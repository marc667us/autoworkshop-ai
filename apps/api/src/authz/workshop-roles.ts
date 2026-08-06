import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHO IS STAFF OF THIS WORKSHOP, AND WHO IS MERELY INSIDE ITS ORGANISATION.
 *
 * ── 🔴 WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * `customer` is a real, grantable membership role (`permission-matrix.ts`), and
 * a customer's `TenantContext.organizationId` IS THE WORKSHOP'S. Row-level
 * security is organisation-scoped, so it cannot tell a customer apart from the
 * staff they buy from — both are inside the same organisation.
 *
 * That means every `list*` method which returns "everything in this
 * organisation" is readable by a customer unless the SERVICE says otherwise.
 * Nothing else says otherwise: the controllers carry `TenantGuard`, which
 * establishes WHO you are and WHICH tenant, not WHAT you may do, and there is
 * no global guard in this application.
 *
 * It was found three times in two passes — settings, knowledge, then finance,
 * warranty and parts — so it stops being a per-service oversight and becomes a
 * shared, named rule.
 *
 * ── ⚠️ THE ASYMMETRY IS THE WHOLE POINT ────────────────────────────────────
 *
 * Writes were gated everywhere; reads were gated nowhere. A workshop's books,
 * stock levels, supplier prices and warranty decisions are exactly the things a
 * customer must not browse, and they were the things left open.
 *
 * ⚠️ THIS IS NOT "CUSTOMERS SEE NOTHING". A customer must absolutely see THEIR
 * OWN invoices, payments and warranty claims. That is a different query — one
 * carrying a customer predicate derived from the session — not a relaxation of
 * this one. `SelfServiceService` is the pattern.
 */
export const WORKSHOP_STAFF_ROLES = [
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',
  'technician',
  'storekeeper',
  'cashier',
  'quality_controller',
  'platform_administrator',
] as const;

export function isWorkshopStaff(ctx: TenantContext): boolean {
  return (WORKSHOP_STAFF_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse a non-staff caller, naming what they CAN reach.
 *
 * ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape hatch
 * does not exist is a wall, and walls are the most expensive defect class
 * recorded in this repository.
 */
export function assertWorkshopStaff(ctx: TenantContext, what: string): void {
  if (!isWorkshopStaff(ctx)) {
    throw new ForbiddenException(
      `${what} belongs to the workshop, not to a customer account. ` +
        'Your own repairs, invoices, payments and warranty claims are on your own pages.',
    );
  }
}
