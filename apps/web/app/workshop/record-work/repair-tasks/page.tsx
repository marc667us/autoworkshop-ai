import { requireNavRoute } from '@autoworkshop/next-shell';
import { ExecutionQueueScreen } from '../../_screens/execution-queue-screen';

/**
 * /record-work/repair-tasks — the §49 TECHNICIAN tree. §49 splits one repair record into four menu entries — tasks, time, parts and evidence — and they are FACETS of the same execution, so all four open the same screen. A time sheet that could not say which task the time was against would be useless, and `05.txt` §2 forbids disconnected pages.
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
  await requireNavRoute('workshop', '/record-work/repair-tasks');
  return <ExecutionQueueScreen route="/record-work/repair-tasks" />;
}
