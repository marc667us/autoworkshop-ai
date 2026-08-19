import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
import { addFleetMemberAction, withdrawFleetMemberAction } from './staff-actions';

/**
 * `/fleet/settings/users` — who works for this fleet.
 *
 * 🔴 REUSED, NOT REBUILT. `OrgStaffScreen` already serves insurance and towing;
 * §0.3 makes reuse the rule and this is the third consumer. A fourth copy of a
 * roster is a fourth place for the two-literals defect to appear.
 *
 * ⚠️ AND UNLIKE INSURANCE AND TOWING, FLEET NEEDED NO MIGRATION TO GET HERE.
 * Migration 085 existed because `insurance_assessor` and `towing_operator` were
 * absent from `CAN_GRANT_MEMBERSHIP`, so those organisations could never appoint
 * anybody. `fleet_administrator` has been in that set all along — measured, not
 * assumed, before this screen was written. The question was asked; the answer
 * was that nothing was missing.
 *
 * ⚠️ THE ROLE LIST MUST MATCH `ROLES_BY_ORG_TYPE.fleet_operator` in
 * `membership.service.ts`, which is `['fleet_administrator']` — one role.
 * Offering a role the API will refuse is a form that fails on submit, and two
 * literals in two files cannot be type-checked into agreement.
 */

const FLEET_ROLE_OPTIONS: readonly OrgRoleOption[] = [
  {
    value: 'fleet_administrator',
    label: 'Fleet administrator',
    hint: 'Manages vehicles and drivers, raises service requests and appoints colleagues',
  },
];

export function FleetStaffScreen() {
  return (
    <OrgStaffScreen
      workspaceId="fleet"
      title="Users"
      description="Who has access to this fleet, and what they may do."
      organisationNoun="fleet"
      roles={FLEET_ROLE_OPTIONS}
      addAction={addFleetMemberAction}
      withdrawAction={withdrawFleetMemberAction}
    />
  );
}
