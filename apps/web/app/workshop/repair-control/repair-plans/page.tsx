import { requireNavRoute } from '@autoworkshop/next-shell';
import { RepairPlanQueueScreen } from '../../_screens/repair-plan-queue-screen';

/**
 * /repair-control/repair-plans — the §46 WORKSHOP OWNER and §47 WORKSHOP MANAGER trees — both name this screen at the same path, unlike the diagnosis where §47 had a queue of its own.
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
  await requireNavRoute('workshop', '/repair-control/repair-plans');
  return <RepairPlanQueueScreen route="/repair-control/repair-plans" />;
}
