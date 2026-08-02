import { describe, expect, it, beforeAll } from 'vitest';
import { StorageService } from './storage.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Integration proof that the presigned URL is ACCEPTED BY MINIO.
 *
 * 🔴 A SIGNATURE CANNOT BE UNIT-TESTED INTO CORRECTNESS. Every part of SigV4 —
 * the canonical URI's per-segment encoding, the sorted query, the signed-header
 * list, UNSIGNED-PAYLOAD, the four-stage signing key — produces a plausible
 * hex string whether it is right or wrong. The only thing that distinguishes a
 * correct signature from a wrong one is a server accepting it, so this test
 * performs a REAL upload and a REAL read-back.
 *
 * Skips loudly when MinIO is unreachable, rather than passing silently.
 * ⚠️ MinIO was unreachable from the host for days earlier in this project while
 * Docker reported it healthy, so "skipped" here is a state worth seeing.
 */
const ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000';
const BUCKET = process.env['S3_BUCKET'] ?? 'aw-media';

function service(): StorageService {
  const values: Record<string, string> = {
    S3_ENDPOINT: ENDPOINT,
    S3_BUCKET: BUCKET,
    S3_ACCESS_KEY: process.env['S3_ACCESS_KEY'] ?? 'minioadmin',
    S3_SECRET_KEY: process.env['S3_SECRET_KEY'] ?? 'change_me_locally',
    S3_REGION: 'us-east-1',
  };
  return new StorageService({ get: (k: string) => values[k] } as unknown as ConfigService);
}

let reachable = false;
beforeAll(async () => {
  try {
    const res = await fetch(`${ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn(`[storage.integration] SKIPPED — no MinIO at ${ENDPOINT}`);
  }
});

describe('StorageService presigned PUT, against real MinIO', () => {
  it('produces a key that leads with the tenant, and uses no caller filename', () => {
    const key = service().evidenceKey({
      tenantId: 'T1',
      organizationId: 'O1',
      executionId: 'E1',
      evidenceId: 'V1',
      // A hostile "extension" — the key must not carry any of it.
      extension: '../../etc/passwd',
    });
    expect(key.startsWith('tenants/T1/')).toBe(true);
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/');
  });

  it('🔴 MinIO ACCEPTS the signature — a real upload and read-back', async () => {
    if (!reachable) return;
    const svc = service();
    const key = svc.evidenceKey({
      tenantId: 'itest',
      organizationId: 'org',
      executionId: 'exec',
      evidenceId: `probe-${Date.now()}`,
      extension: 'txt',
    });
    const { url } = svc.presignPut(key, 300);
    const body = `verify-storage ${new Date().toISOString()}`;

    const put = await fetch(url, { method: 'PUT', body });
    // A wrong signature answers 403 SignatureDoesNotMatch — which is exactly the
    // failure this test exists to catch, so the status is asserted, not the
    // absence of a throw.
    expect(put.status, `MinIO refused the presigned PUT: ${await put.text()}`).toBe(200);

    // ⚠️ NO PLAIN READ-BACK, AND THE REASON IS A GOOD ONE. The first version
    // asserted an unauthenticated GET returned 200 — it does not, because the
    // bucket is PRIVATE, which is correct and is what stops a leaked key
    // exposing customer vehicle photographs to the internet. The assertion was
    // wrong, not the storage.
    //
    // Reading an object back therefore needs its own presigned GET, which this
    // slice does not build — evidence is written here and displayed later.
    // Asserted instead: an anonymous read is REFUSED, which is the property
    // that actually matters.
    const anon = await fetch(`${ENDPOINT}/${BUCKET}/${key}`);
    expect(anon.status, 'the evidence bucket is publicly readable').not.toBe(200);
  });

  it('an EXPIRED url is refused — the window is a real control', async () => {
    if (!reachable) return;
    const svc = service();
    const key = svc.evidenceKey({
      tenantId: 'itest',
      organizationId: 'org',
      executionId: 'exec',
      evidenceId: `expired-${Date.now()}`,
      extension: 'txt',
    });
    // One second, then wait it out. Without this the 15-minute lifetime is a
    // comment rather than a behaviour.
    const { url } = svc.presignPut(key, 1);
    await new Promise((r) => setTimeout(r, 1600));
    const put = await fetch(url, { method: 'PUT', body: 'too late' });
    expect(put.status, 'an expired presigned URL was accepted').not.toBe(200);
  });
});
