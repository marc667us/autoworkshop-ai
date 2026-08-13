import { requireNavRoute } from '@autoworkshop/next-shell';
import { RepairPlanQueueScreen } from '../../_screens/repair-plan-queue-screen';

/**
 * /repair-services/repair-plans — the §34 WORKSPACE DEFAULT route — seen by a workshop supervisor, a platform administrator, a cashier, a storekeeper or a quality-control inspector. The supervisor reads this tree, which is why §30-§31's review control has to be reachable here.
 *
 * The screen is shared across all three role trees; the GATE is not. Each page names
 * its own path so `check-page-gates.sh` can verify the gate belongs to the page it
 * sits in.
 *
 * NOT A SECURITY CONTROL. `RepairPlanService` refuses the roles that may not read or
 * build a plan (`07.txt` pt2 §50), narrows a technician to their assigned cards,
 * enforces §563's reviewer independence, and Postgres RLS denies cross-tenant access
 * independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-services/repair-plans');
  return <RepairPlanQueueScreen route="/repair-services/repair-plans" />;
}
