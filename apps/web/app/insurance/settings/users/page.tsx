import { requireNavRoute } from '@autoworkshop/next-shell';
import { InsuranceStaffScreen } from '../../_screens/staff-screen';

/**
 * `/insurance/settings/users` — the insurance company's own people.
 *
 * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
 * this component executing and its output would still ship in the RSC payload —
 * a recorded defect in this repository, found when a staff member could read
 * customers' vehicles on a page that "was gated".
 *
 * The `settings` group is declared with `organization.admin`, which since
 * migration 085 only `insurance_owner` holds inside an insurance company. So an
 * assessor is refused here by the navigation contract, the API's
 * `CAN_GRANT_MEMBERSHIP` refuses them again, and RLS scopes whatever survives to
 * their own tenant — the three independent layers CLAUDE.md §8 requires.
 */
export default async function Page() {
  await requireNavRoute('insurance', '/settings/users');
  return <InsuranceStaffScreen />;
}
