import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Who may act for an insurance company.
 *
 * ⚠️ ITS OWN MODULE, MATCHING `authz/workshop-roles.ts` AND
 * `agents/agent-operator-roles.ts`. Two reasons, and the second is the one that
 * matters: a role list that lives inside a service drags the whole DI container
 * into any test that wants to read it, which is the collection failure that
 * made `staff-roles.ts` its own file.
 *
 * 🔴 `insurance_assessor` IS THE ONLY ROLE AN INSURANCE COMPANY HAS TODAY, and
 * that is a real limitation rather than an oversight to paper over.
 * `GRANTABLE_ROLES` has no `insurance_underwriter`, no `claims_approver` and no
 * `insurance_owner`, so the person who registers the company through
 * `POST /registration/insurance` and the person who assesses a claim are
 * necessarily the same role. `docs/01-product/USER_ROLES.md` names Claims
 * Approver as a distinct role and the code does not have it — recorded in the
 * identity gap list rather than invented here.
 *
 * The consequence, stated: there is currently NO separation of duties inside an
 * insurance company. Whoever can assess can also list products and record
 * sales. That is acceptable for a single-operator insurer and is NOT acceptable
 * for a large one, and it is the first thing to fix when the role vocabulary
 * grows.
 *
 * `platform_administrator` is included for the same reason it is in
 * `WORKSHOP_STAFF_ROLES`: the platform has to be able to look at what it hosts.
 * It confers nothing extra here — the RLS policies still scope every read to
 * the caller's own organisation unless they hold the platform grant.
 */
export const INSURANCE_ROLES = ['insurance_assessor', 'platform_administrator'] as const;

export function isInsuranceOperator(ctx: TenantContext): boolean {
  return (INSURANCE_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse a caller who does not act for an insurer, naming what they CAN do.
 *
 * ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE — this repository's most
 * expensive defect class is a rule whose escape hatch does not exist. Here the
 * alternative is real and specific: anyone may browse and buy insurance without
 * being an insurer, through the public listing.
 */
export function assertInsuranceOperator(ctx: TenantContext, what: string): void {
  if (!isInsuranceOperator(ctx)) {
    throw new ForbiddenException(
      `${what} belongs to an insurance company. ` +
        'To sell insurance here, register one at /registration/insurance. ' +
        'To buy cover, the published products are on the public marketplace and need no account.',
    );
  }
}
