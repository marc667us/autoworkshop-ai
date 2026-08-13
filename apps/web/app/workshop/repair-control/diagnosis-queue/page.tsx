import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiagnosisQueueScreen } from '../../_screens/diagnosis-queue-screen';

/**
 * /repair-control/diagnosis-queue — the §47 WORKSHOP MANAGER tree, which names it a queue because a manager's interest is the records waiting on review.
 *
 * The screen is shared across all four role trees; the GATE is not. Each page names
 * its own path so `check-page-gates.sh` can verify the gate belongs to the page it
 * sits in.
 *
 * NOT A SECURITY CONTROL. `DiagnosisService` refuses the roles that may not read or
 * record a diagnosis (`07.txt` pt2 §50), narrows a technician to their assigned
 * cards, enforces §1292's reviewer independence, and Postgres RLS denies cross-tenant
 * access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
  return <DiagnosisQueueScreen route="/repair-control/diagnosis-queue" />;
}
