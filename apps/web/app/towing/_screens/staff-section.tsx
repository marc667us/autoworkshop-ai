import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
import { addTowingMemberAction, withdrawTowingMemberAction } from './staff-actions';

/**
 * Who works for this towing company — rendered inside `/operations/settings`.
 *
 * 🔴 WHY IT IS A SECTION AND NOT ITS OWN ROUTE. `02.txt` §52 defines ONE
 * settings entry for the towing tree, and CLAUDE.md lists "changing approved
 * navigation without review" among the prohibited actions. Inventing a `users`
 * entry to match the insurance tree would be exactly that. The settings entry is
 * already gated on `organization.admin` — the permission `towing_owner` gained
 * in migration 085 — so this is the correct home for it under the approved
 * navigation, and no nav change is needed.
 *
 * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.towing_company` in
 * `membership.service.ts`. Offering a role the API will refuse is a form that
 * fails on submit.
 */

const TOWING_ROLE_OPTIONS: readonly OrgRoleOption[] = [
  {
    value: 'towing_operator',
    label: 'Operator',
    hint: 'Takes requests, runs the dispatch board and manages drivers and vehicles',
  },
  {
    value: 'towing_owner',
    label: 'Administrator',
    hint: 'Full control of this company, including appointing people, rates and invoices',
  },
];

export function TowingStaffSection() {
  return (
    <OrgStaffScreen
      workspaceId="towing"
      title="People"
      description="Everyone with access to this towing company, and what they may do. Adding someone gives them access immediately; a suspended account is marked and cannot sign in."
      organisationNoun="towing company"
      roles={TOWING_ROLE_OPTIONS}
      addAction={addTowingMemberAction}
      withdrawAction={withdrawTowingMemberAction}
      // Rendered inside `/operations/settings`, which already owns the page's
      // `<h1>`. See the prop's own comment for why this is accessibility, not
      // styling.
      embedded
    />
  );
}
