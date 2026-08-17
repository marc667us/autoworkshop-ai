import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
import { addInsuranceMemberAction, withdrawInsuranceMemberAction } from './staff-actions';

/**
 * `/insurance/settings/users` — who works for this insurance company.
 *
 * 🔴 THE NAVIGATION HAS ADVERTISED THIS ENTRY AND THERE WAS NO PAGE. The
 * `settings` group is gated on `organization.admin`, a permission NO insurance
 * role held until migration 085 — so the entry was invisible to everyone, and
 * the moment 085 made it visible it fell through `[...slug]/page.tsx` to the
 * "not built yet" placeholder. That is why this screen ships in the same
 * session as the role.
 *
 * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.insurance_company` in
 * `membership.service.ts`. Offering a role the API will refuse is a form that
 * fails on submit, and `membership-role-fit.spec.ts` is what keeps the API side
 * honest. Two literals in two files cannot be type-checked into agreement — the
 * most-recorded root cause in this repository — so if a role is added there,
 * add it here.
 */

const INSURANCE_ROLE_OPTIONS: readonly OrgRoleOption[] = [
  {
    value: 'insurance_assessor',
    label: 'Assessor',
    hint: 'Assesses claims, registers products and records policies sold',
  },
  {
    value: 'insurance_owner',
    label: 'Administrator',
    hint: 'Full control of this company, including appointing and removing people',
  },
];

export function InsuranceStaffScreen() {
  return (
    <OrgStaffScreen
      workspaceId="insurance"
      title="Users"
      description="Everyone with access to this insurance company, and what they may do. Adding someone gives them access immediately; a suspended account is marked and cannot sign in."
      organisationNoun="insurance company"
      roles={INSURANCE_ROLE_OPTIONS}
      addAction={addInsuranceMemberAction}
      withdrawAction={withdrawInsuranceMemberAction}
    />
  );
}
