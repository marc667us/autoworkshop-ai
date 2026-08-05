import { z } from 'zod';
import { optionalText, requiredText, uuid } from '../common/validation/validated-body';

/**
 * Request schemas for the media controller — slice 1 of `COMPLETION_PLAN.md`.
 *
 * Same division of labour as `repair.schemas.ts`: these refuse what is
 * STRUCTURALLY impossible, and `MediaService` refuses what is contextually
 * wrong (an owner in another organisation, a content type the product does not
 * accept, an asset already confirmed).
 */

/**
 * The vocabulary of things a file may be attached to.
 *
 * ⚠️ MIRRORED FROM migration 040's CHECK constraint, and mirrored lists drift.
 * `media.spec.ts` reads the migration and fails if the two disagree, which is
 * the same guard `organization.schemas.spec.ts` uses. Without it this would be
 * a second source of truth that silently diverges the first time the migration
 * grows an owner type.
 */
export const OWNER_TYPES = [
  'job_card',
  'execution',
  'execution_task',
  'vehicle_intake',
  'quality_inspection',
  'message',
] as const;

export const RequestUploadUrlBody = z
  .object({
    ownerType: z.enum(OWNER_TYPES),
    ownerId: uuid(),
    /**
     * The browser's own filename. Kept as DATA so a person can recognise their
     * file — never used to build the storage key, which is composed entirely of
     * values the server already trusts. See `StorageService.evidenceKey`.
     */
    fileName: optionalText(255),
    contentType: requiredText(255),
    /**
     * Advisory only, and the service says so. The browser reports this before
     * uploading; the real size is whatever MinIO ends up holding. It is used to
     * refuse an obviously-too-large upload BEFORE minting a URL, not to trust.
     */
    byteSize: z.number().int().nonnegative().max(1024 * 1024 * 512).optional(),
    caption: optionalText(500),
  })
  .strict();
export type RequestUploadUrlBody = z.infer<typeof RequestUploadUrlBody>;

/**
 * Confirming an upload carries NO storage key and NO status.
 *
 * ⚠️ THE CLIENT DOES NOT GET TO SAY WHERE ITS FILE WENT. If `storageKey` were
 * accepted here, a caller could confirm an asset against any object in the
 * bucket — including another tenant's, since object storage has no row-level
 * security. The key is looked up from the asset id the server minted, and the
 * status it moves to is derived, not accepted. Same shape as the customer
 * decision endpoint, whose consent fields are derived for the same reason.
 */
export const ConfirmUploadBody = z
  .object({
    byteSize: z.number().int().nonnegative().max(1024 * 1024 * 512).optional(),
  })
  .strict();
export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBody>;
