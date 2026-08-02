import { requireNavRoute } from '@autoworkshop/next-shell';
import { RegisterVehicleScreen } from '../../_screens/register-vehicle-screen';

/**
 * /customers-and-vehicles/register-vehicle
 *
 * The §46 OWNER tree's route, matching its register-customer sibling.
 *
 * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
 * Option A, owner-approved 2026-08-01). It grants nothing new: the API already
 * permitted this role to do this, and the only thing missing was a way to reach
 * it by clicking. A nav entry with no page behind it would advertise a route
 * that 404s — the divergence `resolve.ts` warns about — so the entry and this
 * page land together.
 *
 * NOT THE SECURITY CONTROL. The service refuses a role outside its permitted set
 * regardless of which screen called it (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/customers-and-vehicles/register-vehicle';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <RegisterVehicleScreen route={ROUTE} />;
}
