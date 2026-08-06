import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Human-facing warranty numbers, allocated atomically.
 *
 * ── 🔴 WHY THIS IS A MODULE AND NOT A PRIVATE METHOD ───────────────────────
 *
 * It was private to `WarrantyService`. Slice 12 lets a CUSTOMER raise a claim
 * from their own warranty page, which is a different service with a different
 * authorization rule, and it needs the same number.
 *
 * The tempting move is to write the allocation again next to the new caller.
 * That is how this repository ended up with a case reference built from
 * `count(*) + 1` — which, under READ COMMITTED, lets two concurrent inserts
 * count the same rows and one dies on the UNIQUE constraint, so a complaint
 * vanishes behind a 500 exactly when two people complain at once. Migration 047
 * copied the job-number function rather than inventing a second, worse one, and
 * this does the same for TypeScript.
 *
 * ⚠️ THE ROW LOCK IS THE MECHANISM, not the `max()`. `SELECT … FOR UPDATE` on
 * the organisation row serialises allocation for that organisation; without it
 * the `max()` is read by both transactions before either writes.
 */

/** A client that can run a parameterised query — `PoolClient`, or a test double. */
export interface Queryable {
  query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
}

export type WarrantyNumberTable = 'warranty.policies' | 'warranty.claims';
export type WarrantyNumberColumn = 'policy_number' | 'claim_number';

/** Locks the organisation row so two desks cannot allocate the same number. */
export async function nextWarrantyNumber(
  client: Queryable,
  ctx: TenantContext,
  prefix: string,
  table: WarrantyNumberTable,
  column: WarrantyNumberColumn,
): Promise<string> {
  // Table and column come from a closed set at the call sites and are never
  // caller text — the same rule `MediaService.OWNER_TABLES` follows. The types
  // above make that a compile-time fact rather than a comment.
  await client.query(`SELECT 1 FROM identity.organizations WHERE id = $1 FOR UPDATE`, [
    ctx.organizationId,
  ]);
  const rows = await client.query<{ next: string }>(
    `SELECT COALESCE(max(substring(${column} from '[0-9]+$')::bigint), 0) + 1 AS next
       FROM ${table} WHERE organization_id = $1 AND ${column} LIKE $2`,
    [ctx.organizationId, `${prefix}-%`],
  );
  return `${prefix}-${String(rows.rows[0]!.next).padStart(6, '0')}`;
}
