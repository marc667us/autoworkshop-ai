import { requireNavRoute } from '@autoworkshop/next-shell';
import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';

/**
 * /my-vehicles/service-history — `01 (1).txt` §33, the customer workspace.
 *
 * ⚠️ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
 * not authentication — see `/my-vehicles/garage` for the full reasoning. The
 * real scoping is `JobCardService.list`'s customer predicate plus RLS.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/my-vehicles/service-history');
  return <ServiceHistoryScreen />;
}
