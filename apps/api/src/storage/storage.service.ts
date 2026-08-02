import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

/**
 * Object storage — presigned uploads for repair evidence.
 *
 * `2.txt` §563 lists "images, videos, voice notes" among what a repair records,
 * and `execution_evidence.storage_key` has been waiting for them since migration
 * 019. This is the piece that lets a file actually arrive.
 *
 * 🔴 THE FILE NEVER PASSES THROUGH THE API. The browser is given a PRESIGNED URL
 * and uploads straight to MinIO. That is not a performance preference:
 *
 *   · a technician's phone photo is several megabytes, and proxying it would tie
 *     up an API worker for the whole upload on a workshop's connection;
 *   · the API would then hold customer vehicle photographs in memory, which is
 *     data it has no reason to touch;
 *   · Render's free tier has a request body limit that a video would exceed.
 *
 * The signature is what carries the authorisation, and it expires.
 *
 * ⚠️ SIGNED BY HAND WITH `node:crypto`, NOT BY ADDING AN SDK. `@aws-sdk/client-s3`
 * is ~15MB of transitive dependencies to produce one query string. Directive §18
 * asks whether a package is NECESSARY before adding it, and SigV4's presigned
 * form is a well-specified ~60 lines. The same reasoning as the operations
 * probes, which speak RESP and NATS by hand rather than carrying two clients.
 *
 * ⚠️ AND IT IS NOT AN AUTHORIZATION CONTROL. Who may attach evidence to which
 * repair is decided by `ExecutionService` and by RLS on `execution_evidence`.
 * This only mints a URL for a key the caller has already been permitted to
 * write — see `EvidenceController`, which resolves the execution first.
 */
@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  private endpoint(): string {
    return (this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000').replace(/\/$/, '');
  }

  /**
   * ⚠️ DEFAULTS TO `aw-media`, WHICH IS THE BUCKET THAT ACTUALLY EXISTS.
   * `.env` carried `S3_BUCKET=autoworkshop` — a bucket present in no MinIO
   * instance here; the container holds `aw-media` and `aw-backups`. Nothing had
   * noticed because nothing used S3 yet, and the first upload would have failed
   * with NoSuchBucket. The default is the real name so a missing variable is
   * harmless rather than a trap.
   */
  private bucket(): string {
    return this.config.get<string>('S3_BUCKET') || 'aw-media';
  }

  private region(): string {
    // MinIO ignores the region but SigV4 requires one in the credential scope,
    // and it must match on both sides. `us-east-1` is MinIO's own default.
    return this.config.get<string>('S3_REGION') || 'us-east-1';
  }

  /**
   * Where a piece of evidence lives.
   *
   * ⚠️ THE TENANT IS THE FIRST PATH SEGMENT, deliberately. Object storage has no
   * row-level security, so the only isolation available is the key layout plus
   * who can mint a URL for it. Leading with the tenant means a bucket policy or
   * an operator's `mc` command can scope by prefix, and a key from one tenant
   * can never be mistaken for another's.
   *
   * ⚠️ THE FILENAME IS NOT USED. A caller-supplied name could contain `../`, a
   * null byte, or 4KB of unicode. The key is composed entirely of values this
   * server already trusts plus a uuid; the original name belongs in the
   * `description` column, where it is data rather than a path.
   */
  evidenceKey(params: {
    tenantId: string;
    organizationId: string;
    executionId: string;
    evidenceId: string;
    extension: string;
  }): string {
    const ext = params.extension.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    return (
      `tenants/${params.tenantId}/organizations/${params.organizationId}` +
      `/executions/${params.executionId}/evidence/${params.evidenceId}${ext ? `.${ext}` : ''}`
    );
  }

  /**
   * A presigned PUT URL, valid for a short window.
   *
   * ⚠️ FIFTEEN MINUTES. Long enough for a large photo on a poor workshop
   * connection; short enough that a URL captured from a log or a browser history
   * is worthless by the time anyone finds it. A presigned URL is a bearer
   * credential — anyone holding it can write that key — so its lifetime is the
   * only thing limiting the damage.
   */
  presignPut(key: string, expiresInSeconds = 900): { url: string; key: string; expiresIn: number } {
    const accessKey = this.config.get<string>('S3_ACCESS_KEY') ?? '';
    const secretKey = this.config.get<string>('S3_SECRET_KEY') ?? '';
    const endpoint = this.endpoint();
    const bucket = this.bucket();
    const region = this.region();

    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const host = url.host;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;

    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKey}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    });

    // ⚠️ THE PATH IS ENCODED SEGMENT BY SEGMENT, keeping the slashes. S3's
    // canonical URI escapes each segment but NOT the separators; encoding the
    // whole path would turn `/` into `%2F` and the signature would be computed
    // over a different resource than the one requested.
    const canonicalUri =
      '/' +
      `${bucket}/${key}`
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');

    // URLSearchParams sorts nothing; SigV4 requires the query sorted by key.
    const canonicalQuery = [...query.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      // UNSIGNED-PAYLOAD: the body is the file, which this server never sees and
      // therefore cannot hash. It is the standard presigned-upload form.
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (key: Buffer | string, data: string) =>
      createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return {
      url: `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      key,
      expiresIn: expiresInSeconds,
    };
  }
}
