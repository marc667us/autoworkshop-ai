import { requireNavRoute } from '@autoworkshop/next-shell';
import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';

/**
 * /service-and-repairs/completed-repairs — `01 (1).txt` §33, the customer workspace.
 *
 * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
 * It is not authentication: the §33 tree has no per-role variants and no
 * permission on this item, so a signed-out visitor reaches the page, `apiGet`
 * finds no token, and the screen renders its unauthenticated state. Same
 * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
 *
 * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
 * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
  return <RepairJourneyScreen view="finished" />;
}
