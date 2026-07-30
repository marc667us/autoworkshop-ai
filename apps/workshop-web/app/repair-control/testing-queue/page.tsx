import { requireNavRoute } from '@autoworkshop/next-shell';
import { TestingQueueScreen } from '../../_screens/testing-queue-screen';

/**
 * /repair-control/testing-queue — the §47 WORKSHOP MANAGER tree.
 *
 * The screen is shared; the GATE is not. Each page names its own path so
 * `check-page-gates.sh` can verify the gate belongs to the page it sits in.
 *
 * NOT A SECURITY CONTROL. `TestingService` refuses the roles that may not record or read
 * test results, holds §35's release approval to a NARROWER set still, and Postgres RLS
 * denies cross-tenant access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/testing-queue');
  return <TestingQueueScreen route="/repair-control/testing-queue" />;
}
