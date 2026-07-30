import { requireNavRoute } from '@autoworkshop/next-shell';
import { RepairPlanSheetScreen } from '../../../_screens/repair-plan-sheet-screen';

/**
 * /repair-services/repair-plans/<id> — one repair plan. the §34 WORKSPACE DEFAULT route — seen by a workshop supervisor, a platform administrator, a cashier, a storekeeper or a quality-control inspector. The supervisor reads this tree, which is why §30-§31's review control has to be reachable here.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per plan, so "is `/repair-services/repair-plans/<id>` in your menu" has no
 * sensible answer. The real question is whether this viewer may see the QUEUE, and a
 * viewer refused the queue is refused every record reachable from it.
 * `check-page-gates.sh` strips trailing dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `RepairPlanService.findById` re-verifies role, tenant,
 * organization AND — for a technician — assignment, answering 404 for a record outside
 * them, so guessing an id yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-services/repair-plans');
  const { id } = await params;
  return <RepairPlanSheetScreen route="/repair-services/repair-plans" planId={id} />;
}
