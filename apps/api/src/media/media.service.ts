import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { OWNER_TYPES } from './media.schemas';

export type OwnerType = (typeof OWNER_TYPES)[number];

export interface MediaAsset {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  originalName: string | null;
  contentType: string;
  byteSize: number | null;
  status: 'pending' | 'stored' | 'quarantined';
  scanStatus: 'skipped' | 'pending' | 'clean' | 'infected';
  caption: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  /** A short-lived signed GET, present only once the upload is confirmed. */
  url: string | null;
}

/**
 * What the product accepts as an attachment.
 *
 * ⚠️ AN ALLOW-LIST, NOT A BLOCK-LIST, and that is the whole point. A block-list
 * of dangerous types is a list of the ones somebody thought of; anything not on
 * it is accepted. These are the types a workshop actually produces — a phone
 * photograph, a dashcam clip, a voice note, a PDF from a supplier.
 *
 * ⚠️ AND IT IS NOT A SUBSTITUTE FOR SCANNING. A file whose declared content type
 * is `image/jpeg` may hold anything at all; the browser declares this, and the
 * browser is the thing being defended against. What it buys is that the product
 * will not knowingly store and serve back an executable. `media.assets.scan_status`
 * records honestly that nothing has scanned the bytes (ADR-012 — there is no
 * scanner in the compose file and none may be bought), and the UI shows it.
 */
const ACCEPTED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
  'application/pdf',
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
};

/** 64 MB. A phone video clip fits; a feature film does not. */
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Where each owner type lives, so a link can be proved to point at something the
 * caller may actually reach.
 *
 * 🔴 THIS TABLE IS THE AUTHORIZATION CONTROL, and it is the reason `media.links`
 * can carry a polymorphic `owner_id` without a foreign key. Before any asset is
 * minted the owner row is SELECTed **under the caller's own tenant context**, so
 * RLS answers the question "may this person see this thing at all". A job card
 * in another organisation returns no row and the request is refused with a 404 —
 * the same answer a direct request for that card would give, so this endpoint
 * cannot be used to probe for the existence of other tenants' records.
 *
 * ⚠️ IT IS NOT ENOUGH ON ITS OWN and must not be mistaken for enough. It proves
 * the caller can SEE the owner; whether they may ATTACH to it is the owning
 * service's rule. `execution` and `execution_task` are therefore additionally
 * gated below.
 */
const OWNER_TABLES: Record<OwnerType, { table: string; label: string }> = {
  job_card: { table: 'repair.job_cards', label: 'job card' },
  execution: { table: 'repair.repair_executions', label: 'repair execution' },
  execution_task: { table: 'repair.execution_tasks', label: 'repair task' },
  vehicle_intake: { table: 'reception.vehicle_intakes', label: 'vehicle intake' },
  quality_inspection: { table: 'repair.quality_inspections', label: 'quality inspection' },
  message: { table: 'comms.messages', label: 'message' },
};

/**
 * Attachments — slice 1 of `COMPLETION_PLAN.md`.
 *
 * ── WHAT THIS FIXES ────────────────────────────────────────────────────────
 *
 * `StorageService` was written with a full SigV4 presigner and an integration
 * spec, and was then **wired into no module at all** — it had no provider entry,
 * no controller, and no caller anywhere in the product. Meanwhile
 * `repair.execution_evidence.storage_key` had sat deliberately unused since
 * migration 019 waiting for exactly this.
 *
 * That is the fourth instance in this repository of a complete service with no
 * reachable caller, after `grant()`, `link_sponsor_user()` and `POST /job-cards`.
 * The tell is identical every time: the code is good, its tests pass, and the
 * tests call it directly rather than through anything a person can reach. The
 * question that finds it is **what UI could call this?**
 *
 * ── THE THREE-STEP UPLOAD, AND WHY IT IS THREE ─────────────────────────────
 *
 *   1. `POST /media/upload-url` — the server resolves the owner, mints an asset
 *      row as `pending`, and returns a presigned PUT.
 *   2. The BROWSER uploads straight to MinIO. The file never touches the API.
 *   3. `POST /media/:id/confirm` — the asset becomes `stored` and only now
 *      appears in any gallery.
 *
 * Step 3 exists because a presigned URL is minted BEFORE the upload happens and
 * the browser may close the tab, lose signal, or simply not bother. Without it
 * every gallery would show broken images and nobody could distinguish a failed
 * upload from a deleted file.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Step 1 — resolve the owner, record the intent, hand back a signed PUT.
   */
  async requestUploadUrl(
    ctx: TenantContext,
    input: {
      ownerType: OwnerType;
      ownerId: string;
      fileName?: string;
      contentType: string;
      byteSize?: number;
      caption?: string;
    },
  ): Promise<{ assetId: string; uploadUrl: string; expiresIn: number; storageKey: string }> {
    const contentType = input.contentType.trim().toLowerCase();
    if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(
        `${contentType} is not a file type this workshop stores. ` +
          'Photographs (JPEG, PNG, WebP, HEIC), video (MP4, MOV, WebM), voice notes ' +
          '(MP3, M4A, OGG) and PDF documents are accepted.',
      );
    }

    // Advisory — the browser reports it. Refusing here saves minting a URL for
    // an upload that MinIO would reject anyway; it is not the real limit.
    if (input.byteSize !== undefined && input.byteSize > MAX_BYTES) {
      throw new BadRequestException(
        `That file is ${Math.round(input.byteSize / 1024 / 1024)}MB. ` +
          `The limit is ${MAX_BYTES / 1024 / 1024}MB — record a shorter clip, or attach a link instead.`,
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      await this.assertOwnerReachable(client, ctx, input.ownerType, input.ownerId);

      // 🔴 THE ID IS GENERATED HERE, AND THE ROW IS WRITTEN ONCE.
      //
      // The first version inserted a placeholder `storage_key` and UPDATEd it
      // in the same transaction, because the key needs the asset's own id. Its
      // comment claimed `trg_asset_rewrite` "cannot see" an update inside the
      // inserting transaction. THAT WAS SIMPLY FALSE — a BEFORE UPDATE trigger
      // fires on any UPDATE, transaction boundaries are irrelevant to it — so
      // every call to this method raised:
      //
      //   ERROR: media.assets.storage_key is immutable (asset …)
      //
      // i.e. the upload feature could never have worked once. Typecheck and lint
      // both passed; nothing exercised a real database. Found by Codex and then
      // REPRODUCED against Postgres before being believed.
      //
      // That is this repository's "a comment claiming a guard that does not
      // exist" defect for the fourth time, and the first where the comment
      // argued the guard would NOT fire. Generating the uuid in the service
      // removes the update entirely, so the trigger has nothing to catch and the
      // immutability rule stays absolute rather than needing an exception.
      const assetId = randomUUID();

      const storageKey = this.storage.assetKey({
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        assetId,
        extension: EXTENSION_BY_TYPE[contentType] ?? '',
      });

      await client.query(
        `INSERT INTO media.assets
           (id, tenant_id, organization_id, storage_key, original_name, content_type,
            byte_size, status, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
        [
          assetId,
          ctx.tenantId,
          ctx.organizationId,
          storageKey,
          input.fileName ?? null,
          contentType,
          input.byteSize ?? null,
          ctx.userId,
        ],
      );

      await client.query(
        `INSERT INTO media.links
           (tenant_id, organization_id, asset_id, owner_type, owner_id, caption, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6,
                 COALESCE((SELECT max(position) + 1 FROM media.links
                            WHERE tenant_id = $1 AND owner_type = $4 AND owner_id = $5), 0),
                 $7)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          assetId,
          input.ownerType,
          input.ownerId,
          input.caption ?? null,
          ctx.userId,
        ],
      );

      const signed = this.storage.presignPut(storageKey);
      return {
        assetId,
        uploadUrl: signed.url,
        expiresIn: signed.expiresIn,
        storageKey,
      };
    });
  }

  /**
   * Step 3 — the browser reports the upload landed.
   *
   * ⚠️ THIS TAKES NO STORAGE KEY. See `ConfirmUploadBody` for why: accepting one
   * would let a caller confirm an asset against any object in the bucket,
   * including another tenant's, because object storage has no RLS.
   */
  async confirmUpload(
    ctx: TenantContext,
    assetId: string,
    input: { byteSize?: number },
  ): Promise<MediaAsset> {
    return this.db.withTenant(ctx, async (client) => {
      // Scoped to the organisation for the same reason as
      // `assertOwnerReachable`: media.assets' RLS is tenant-wide, so without
      // this a caller in another organisation of the same tenancy who learned a
      // pending asset id could mark it stored and then read it back.
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM media.assets
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [assetId, ctx.tenantId, ctx.organizationId],
      );
      // No row means either "does not exist" or "belongs to another tenant, and
      // RLS filtered it". Both answer 404 — telling them apart is what turns an
      // endpoint into an existence oracle for other tenants' data.
      if (existing.rowCount === 0) throw new NotFoundException('no such upload');

      const status = existing.rows[0]!.status;
      if (status === 'stored') {
        throw new ConflictException('that upload has already been confirmed');
      }
      if (status === 'quarantined') {
        throw new ConflictException('that upload was quarantined and cannot be confirmed');
      }

      await client.query(
        `UPDATE media.assets
            SET status = 'stored',
                confirmed_at = now(),
                byte_size = COALESCE($2, byte_size)
          WHERE id = $1 AND tenant_id = $3 AND organization_id = $4`,
        [assetId, input.byteSize ?? null, ctx.tenantId, ctx.organizationId],
      );

      const rows = await this.selectAssets(client, ctx, { assetId });
      const asset = rows[0];
      if (!asset) throw new NotFoundException('no such upload');
      return asset;
    });
  }

  /** Everything attached to one thing, newest position last. */
  async listForOwner(
    ctx: TenantContext,
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<MediaAsset[]> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertOwnerReachable(client, ctx, ownerType, ownerId);
      return this.selectAssets(client, ctx, { ownerType, ownerId });
    });
  }

  /**
   * Detach a file from one thing.
   *
   * The ASSET survives — only the link goes. `media.assets` carries no DELETE
   * grant at all, so who uploaded what remains answerable even after a
   * photograph is removed from a repair. Destroying the object itself is an
   * operator action, not an API one.
   */
  async unlink(ctx: TenantContext, assetId: string, ownerType: OwnerType, ownerId: string): Promise<void> {
    await this.db.withTenant(ctx, async (client) => {
      // Prove the caller can reach the OWNER before detaching anything from it.
      // Without this, knowing two ids was enough to strip a photograph off
      // another organisation's job card — media.links' RLS is tenant-wide.
      await this.assertOwnerReachable(client, ctx, ownerType, ownerId);

      const result = await client.query(
        `DELETE FROM media.links
          WHERE asset_id = $1 AND owner_type = $2 AND owner_id = $3
            AND tenant_id = $4 AND organization_id = $5`,
        [assetId, ownerType, ownerId, ctx.tenantId, ctx.organizationId],
      );
      if (result.rowCount === 0) throw new NotFoundException('that file is not attached to this record');
    });
  }

  /**
   * Prove the caller can reach the owner, under their own RLS context.
   *
   * ⚠️ THE TABLE NAME IS INTERPOLATED, and that is safe ONLY because it comes
   * from `OWNER_TABLES` keyed by a value the boundary already narrowed to a
   * closed enum — it is never caller text. `owner_id` is a bound parameter.
   * If `OWNER_TABLES` ever grows a name built from input, this becomes an
   * injection site.
   */
  private async assertOwnerReachable(
    client: { query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null }> },
    ctx: TenantContext,
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<void> {
    const owner = OWNER_TABLES[ownerType];
    if (!owner) throw new BadRequestException('unknown attachment target');

    let found: { rowCount: number | null };
    try {
      // 🔴 SCOPED TO THE ORGANISATION, NOT ONLY THE TENANT.
      //
      // Every owner table's RLS policy reads `tenant_id = current_tenant_id()`
      // and nothing about the organisation — measured, not assumed:
      //
      //   job_cards | tenant_isolation | ALL | tenant_id = current_tenant_id()
      //
      // and a tenant here really does hold more than one organisation. So RLS
      // alone would let somebody whose active organisation is one workshop
      // attach a photograph to — and then read — a job card belonging to a
      // different workshop in the same tenancy. The rest of this product does
      // its organisation scoping in the service layer for the same reason.
      //
      // Found by Codex, 2026-08-06. A tenant predicate is not an organisation
      // predicate, and RLS being present is not RLS being sufficient.
      found = await client.query(
        `SELECT 1 FROM ${owner.table}
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
        [ownerId, ctx.tenantId, ctx.organizationId],
      );
    } catch (error) {
      // `reception.vehicle_intakes` and `comms.messages` arrive in later slices.
      // Until then an attempt to attach to one must say so plainly rather than
      // surfacing `relation does not exist` to a person holding a photograph.
      const code = (error as { code?: string }).code;
      if (code === '42P01') {
        throw new BadRequestException(
          `attaching files to a ${owner.label} is not built yet`,
        );
      }
      throw error;
    }

    if (!found.rowCount) {
      throw new NotFoundException(`no such ${owner.label}`);
    }
  }

  private async selectAssets(
    client: { query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    _ctx: TenantContext,
    filter: { assetId?: string; ownerType?: OwnerType; ownerId?: string },
  ): Promise<MediaAsset[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.assetId) {
      values.push(filter.assetId);
      where.push(`a.id = $${values.length}`);
    }
    if (filter.ownerType) {
      values.push(filter.ownerType);
      where.push(`l.owner_type = $${values.length}`);
    }
    if (filter.ownerId) {
      values.push(filter.ownerId);
      where.push(`l.owner_id = $${values.length}`);
    }

    const rows = await client.query<{
      id: string;
      owner_type: OwnerType;
      owner_id: string;
      original_name: string | null;
      content_type: string;
      byte_size: string | null;
      status: MediaAsset['status'];
      scan_status: MediaAsset['scanStatus'];
      caption: string | null;
      uploaded_by: string | null;
      uploaded_by_name: string | null;
      created_at: string;
      confirmed_at: string | null;
      storage_key: string;
    }>(
      `SELECT a.id, l.owner_type, l.owner_id, a.original_name, a.content_type,
              a.byte_size, a.status, a.scan_status, l.caption, a.uploaded_by,
              u.display_name AS uploaded_by_name, a.created_at, a.confirmed_at,
              a.storage_key
         FROM media.links l
         JOIN media.assets a ON a.id = l.asset_id
         -- LEFT JOIN, deliberately. uploaded_by is nullable and identity.users
         -- carries no RLS, so this cannot hide a row -- but the 039 lesson
         -- applies to the SHAPE of the answer: an inner join would silently drop
         -- an asset whose uploader was later removed, turning "the user is gone"
         -- into "the photograph never existed". A join is not a filter you get
         -- to be casual about once RLS is in the picture.
         LEFT JOIN identity.users u ON u.id = a.uploaded_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY l.position ASC, a.created_at ASC`,
      values,
    );

    return rows.rows.map((r) => ({
      id: r.id,
      ownerType: r.owner_type,
      ownerId: r.owner_id,
      originalName: r.original_name,
      contentType: r.content_type,
      byteSize: r.byte_size === null ? null : Number(r.byte_size),
      status: r.status,
      scanStatus: r.scan_status,
      caption: r.caption,
      uploadedBy: r.uploaded_by,
      uploadedByName: r.uploaded_by_name,
      createdAt: r.created_at,
      confirmedAt: r.confirmed_at,
      // A signed GET only for a file that is actually there. Handing out a URL
      // for a `pending` asset would produce a broken image and a 404 from MinIO.
      url: r.status === 'stored' ? this.storage.presignGet(r.storage_key).url : null,
    }));
  }
}
