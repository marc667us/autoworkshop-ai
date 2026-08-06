import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * APPROVAL LIMITS, ACTUALLY ENFORCED — LIST A item A6.
 *
 * ── 🔴 WHAT THIS CLOSES ────────────────────────────────────────────────────
 *
 * `core.approval_limits` has existed since migration 045 and the settings
 * screen rendered a badge saying, honestly:
 *
 *     "These limits are recorded, not yet enforced"
 *
 * That was true, and honest is not the same as finished. A workshop that sets
 * "a supervisor may approve up to GHS 500" and watches a supervisor approve
 * GHS 5,000 has a control that exists only as a sentence — which is worse than
 * no control, because somebody is relying on it.
 *
 * ── WHERE IT BITES ─────────────────────────────────────────────────────────
 *
 * The internal review of a repair VARIATION: extra work found mid-repair, with
 * a cost attached, signed off by a workshop role before the customer is asked.
 * That is the moment money is committed on someone else's behalf, and it is
 * exactly what `scope = 'repair_approval'` names.
 *
 * ── ⚠️ NO ROW MEANS NO LIMIT, DELIBERATELY ─────────────────────────────────
 *
 * A workshop that has configured nothing must keep working — CLAUDE.md §6's
 * bring-your-own-connection principle applied to policy: a tenant that
 * configures nothing still gets a working app. Defaulting an unconfigured role
 * to zero would silently freeze every approval in every workshop that never
 * opened the settings screen, which is an outage delivered as a feature.
 *
 * The owner is exempt for the same reason the schema exempts them elsewhere:
 * a limit that could lock the workshop owner out of their own workshop has no
 * escape hatch, and a rule whose escape hatch does not exist is a wall.
 *
 * ⚠️ THE REFUSAL NAMES WHO CAN. A refusal that does not say what to do next is
 * the most expensive defect class recorded in this repository.
 */

/** Roles that are never limited — see the header for why. */
const UNLIMITED_ROLES = new Set(['workshop_owner', 'platform_administrator']);

export interface ApprovalLimitCheck {
  /** The amount being approved, in the organisation's currency. */
  amount: number;
  /** What is being approved — matches `core.approval_limits.scope`. */
  scope?: string;
  /** Human description used in the refusal, e.g. "this variation". */
  what: string;
}

/**
 * Refuse an approval above the caller's configured limit.
 *
 * Returns silently when the role has no limit configured, when the role is
 * exempt, or when the amount is within the limit.
 */
export async function assertWithinApprovalLimit(
  client: PoolClient,
  ctx: TenantContext,
  check: ApprovalLimitCheck,
): Promise<void> {
  if (UNLIMITED_ROLES.has(ctx.activeRole)) return;

  const scope = check.scope ?? 'repair_approval';

  const r = await client.query<{ max_amount: string; currency: string }>(
    `SELECT max_amount, currency
       FROM core.approval_limits
      WHERE tenant_id = $1 AND organization_id = $2
        AND role_name = $3 AND scope = $4
      LIMIT 1`,
    [ctx.tenantId, ctx.organizationId, ctx.activeRole, scope],
  );

  const limit = r.rows[0];
  // No row = this workshop has not set a limit for this role. Not a refusal.
  if (!limit) return;

  const max = Number(limit.max_amount);
  if (!Number.isFinite(max)) return;
  if (check.amount <= max) return;

  // 🔴 WHO CAN, NOT JUST WHO CANNOT. Computed from the same table rather than
  // hardcoded, so it stays true when the workshop changes its own policy.
  const higher = await client.query<{ role_name: string }>(
    `SELECT role_name FROM core.approval_limits
      WHERE tenant_id = $1 AND organization_id = $2 AND scope = $3
        AND max_amount >= $4
      ORDER BY max_amount ASC`,
    [ctx.tenantId, ctx.organizationId, scope, check.amount],
  );

  const names = higher.rows.map((x) => x.role_name.replace(/_/g, ' '));
  const escalation =
    names.length > 0
      ? `Ask ${names.join(' or ')} — or the workshop owner — to approve it.`
      : 'Ask the workshop owner to approve it.';

  throw new ForbiddenException(
    `${check.what} is ${limit.currency} ${check.amount.toFixed(2)}, above the ` +
      `${limit.currency} ${max.toFixed(2)} your role may approve. ${escalation}`,
  );
}
