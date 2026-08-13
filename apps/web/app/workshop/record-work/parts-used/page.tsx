import { requireNavRoute } from '@autoworkshop/next-shell';
import { ExecutionQueueScreen } from '../../_screens/execution-queue-screen';

/**
 * /record-work/parts-used — the §49 TECHNICIAN tree — the same repair record, entered by its parts.
 *
 * The screen is shared; the GATE is not. Each page names its own path so
 * `check-page-gates.sh` can verify the gate belongs to the page it sits in.
 *
 * NOT A SECURITY CONTROL. `ExecutionService` refuses the roles that may not carry out
 * or read a repair (`07.txt` pt2 §50), narrows a technician to their assigned cards,
 * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
 * denies cross-tenant access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/record-work/parts-used');
  return <ExecutionQueueScreen route="/record-work/parts-used" />;
}
