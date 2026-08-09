import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHO WORKS IN THE TOWING WORKSPACE.
 *
 * ── 🔴 WHY A THIRD AUDIENCE HELPER AND NOT `assertWorkshopStaff` ──────────
 *
 * `WORKSHOP_STAFF_ROLES` does not contain `towing_operator`, and it should not:
 * a towing operator is FOREIGN to the workshop tree (`viewer-contract.ts` puts
 * it in `NON_WORKSHOP_ROLES` alongside `customer` and `fleet_administrator`).
 * Reusing the workshop helper here would refuse the workspace's own primary
 * role — the one case it exists to serve.
 *
 * Going the other way and using no check at all is the defect this repository
 * has recorded most often: **every write was gated; no read was gated at all.**
 * RLS is organisation-scoped and cannot tell a `customer` apart from staff in
 * the same organisation, so without a service-layer audience a customer who
 * enrolled at a workshop that also tows could read its driver roster, its
 * incident log and its billing.
 *
 * ── THE LIST, AND WHY EACH NAME IS ON IT ──────────────────────────────────
 *
 *   towing_operator        the workspace's own role (§52)
 *   workshop_owner         owns the business the towing arm belongs to
 *   workshop_manager       runs it day to day
 *   platform_administrator §32 gives it the administration surface entire
 *
 * Deliberately NOT here: `technician`, `reception_staff`, `storekeeper`,
 * `cashier`, `customer`, and the other workspaces' roles. A recovery is
 * dispatched by the towing desk, not by whoever happens to be on the workshop
 * floor — and `audit-nav-coverage.mjs` will fail the build if the API permits a
 * role the navigation gives no way to reach.
 */
export const TOWING_ROLES = [
  'towing_operator',
  'workshop_owner',
  'workshop_manager',
  'platform_administrator',
] as const;

export function isTowingStaff(ctx: TenantContext): boolean {
  return (TOWING_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse a caller who does not work here, NAMING WHAT THEY CAN REACH.
 *
 * ⚠️ Every refusal names a reachable alternative. A rule whose escape hatch
 * does not exist is a wall, and walls are the most expensive defect class in
 * this repository.
 */
export function assertTowingStaff(ctx: TenantContext, what: string): void {
  if (!isTowingStaff(ctx)) {
    throw new ForbiddenException(
      `${what} belongs to the towing desk. ` +
        'If you are looking for a vehicle currently in the workshop, it is on the ' +
        'job card; your own recoveries and invoices are on your own pages.',
    );
  }
}
