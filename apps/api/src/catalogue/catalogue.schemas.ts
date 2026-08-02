import { z } from 'zod';

/**
 * Schemas for the catalogue endpoints whose bodies are NOT already parsed by
 * `catalogue-write-rules.ts`.
 *
 * ⚠️ MOST OF THIS CONTROLLER IS DELIBERATELY LEFT ALONE. `apply`,
 * `updateSupplier`, `createPart`, `updatePart` and `addFitment` take
 * `Record<string, unknown>` and are validated thoroughly by
 * `catalogue-write-rules.ts` — length caps, slug and currency shapes, year
 * bounds, and errors that name the field. Wrapping a second, narrower schema
 * around them would risk rejecting input the existing rules accept, for no
 * gain. Validation already happening is not a gap.
 *
 * ── 🔴 WHAT WAS ACTUALLY BROKEN: THE PUBLICATION FLAGS ─────────────────────
 *
 * The three publication endpoints read their flag with `Boolean(body?.published)`.
 *
 *   Boolean('false')  === true
 *   Boolean('0')      === true
 *   Boolean({})       === true
 *   Boolean([])       === true
 *
 * So a client asking to UNPUBLISH with the string `"false"` — the exact thing a
 * form post, a query string or a loosely-typed client sends — PUBLISHED
 * instead. On these three routes that is not a cosmetic bug: they are what puts
 * a supplier, a part or a workshop's own directory listing in front of the
 * public. The failure is silent and in the dangerous direction.
 *
 * This is the same coercion trap already recorded against slice 9's quality
 * gate, where `Boolean('false')` would have turned "the complaint was NOT
 * addressed" into a pass. It was fixed there by enumerating accepted values;
 * `z.boolean()` does the same job here, refusing anything that is not a real
 * JSON boolean rather than reinterpreting it.
 */

/** ⚠️ `z.boolean()`, never `z.coerce.boolean()` — the latter is `Boolean()` again. */
export const SetPublicationBody = z.object({
  published: z.boolean({
    required_error: 'is required',
    invalid_type_error: 'must be true or false, not a string',
  }),
});
export type SetPublicationBody = z.infer<typeof SetPublicationBody>;

/**
 * The supplier variant carries a second, TRI-STATE flag: absent means "leave
 * verification as it is", which is different from `false` meaning "withdraw
 * it". `.optional()` without a default preserves that distinction — a default
 * would silently un-verify every supplier whose publication was toggled.
 */
export const SetSupplierPublicationBody = z.object({
  published: z.boolean({
    required_error: 'is required',
    invalid_type_error: 'must be true or false, not a string',
  }),
  verified: z
    .boolean({ invalid_type_error: 'must be true or false, not a string' })
    .optional(),
});
export type SetSupplierPublicationBody = z.infer<typeof SetSupplierPublicationBody>;
