import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHO ACTS FOR A FLEET OPERATOR.
 *
 * ── 🔴 WHY ITS OWN MODULE, LIKE `towing-roles.ts` AND `insurance-roles.ts` ──
 *
 * A role list that lives inside a service drags the whole DI container into any
 * test that wants to read it — the collection failure that made
 * `staff-roles.ts` its own file.
 *
 * And the audience genuinely differs. `fleet_administrator` is in
 * `NON_WORKSHOP_ROLES` alongside `customer` and `towing_operator`, so
 * `assertWorkshopStaff` would refuse the very role this module exists to serve.
 * Going the other way and gating nothing is the defect this repository has
 * recorded most often — **every write gated, no read gated at all** — and RLS
 * cannot save us here: it is organisation-scoped, so it cannot tell a
 * `customer` who enrolled at an organisation apart from that organisation's
 * own administrator.
 *
 * ── ⚠️ `fleet_administrator` IS THE ONLY FLEET ROLE, AND UNLIKE INSURANCE AND
 * TOWING THAT IS NOT A DEFECT ─────────────────────────────────────────────
 *
 * Migration 085 existed because `insurance_assessor` and `towing_operator` were
 * absent from `CAN_GRANT_MEMBERSHIP`, so those organisations could never appoint
 * a second member. Measured today: `fleet_administrator` IS in that set
 * (`membership.service.ts:35-40`), so a fleet has been able to build a team
 * since it could register. Asked before building, as the standing rule requires;
 * the answer here happens to be that nothing is missing.
 *
 * `platform_administrator` is included for the reason it is included in every
 * other audience helper: the platform has to be able to look at what it hosts.
 * It confers nothing extra — RLS still scopes every read to the caller's own
 * organisation unless they hold the platform grant.
 */
export const FLEET_ROLES = ['fleet_administrator', 'platform_administrator'] as const;

export function isFleetOperator(ctx: TenantContext): boolean {
  return (FLEET_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse a caller who does not act for a fleet, naming what they CAN do.
 *
 * ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE — this repository's most
 * expensive defect class is a rule whose escape hatch does not exist. Here the
 * alternatives are real and specific: register a fleet, or, if you are the
 * workshop being asked, use the incoming-requests route instead.
 */
export function assertFleetOperator(ctx: TenantContext, what: string): void {
  if (!isFleetOperator(ctx)) {
    throw new ForbiddenException(
      `${what} belongs to a fleet operator. ` +
        'To manage a fleet here, register one at /registration/fleet. ' +
        'If you are a workshop that has been asked to do work, your incoming ' +
        'requests are at /fleet/incoming-requests.',
    );
  }
}
