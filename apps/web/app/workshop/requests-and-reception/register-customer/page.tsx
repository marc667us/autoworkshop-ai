import { requireNavRoute } from '@autoworkshop/next-shell';
import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';

/**
 * /requests-and-reception/register-customer
 *
 * The §47 MANAGER tree's route. CAN_CREATE_CUSTOMER has always included workshop_manager.
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

const ROUTE = '/requests-and-reception/register-customer';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <RegisterCustomerScreen route={ROUTE} />;
}
