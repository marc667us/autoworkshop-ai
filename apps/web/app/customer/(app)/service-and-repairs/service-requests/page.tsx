import { requireNavRoute } from '@autoworkshop/next-shell';
import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
import { MyServiceRequests } from '../../../_screens/my-service-requests';

/**
 * /service-and-repairs/service-requests — `01 (1).txt` §33, the customer workspace.
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
  await requireNavRoute('customer', '/service-and-repairs/service-requests');
  // 🔴 BOTH, AND IN THIS ORDER. A "service request" is what the CUSTOMER sent —
  // and until now this route showed only job cards, so somebody who filed a
  // request through the public directory had nowhere to learn whether it had
  // even been read. The repair list stays because a request that has been
  // converted becomes one of those, and losing it would trade one gap for
  // another.
  return (
    <>
      <MyServiceRequests />
      <RepairJourneyScreen view="all" />
    </>
  );
}
