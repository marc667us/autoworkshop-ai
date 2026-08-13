import { requireNavRoute } from '@autoworkshop/next-shell';
import { MyTasksScreen } from '../../../_screens/my-tasks-screen';

/**
 * /home/my-tasks — `01 (1).txt` §33, the customer workspace.
 *
 * Slice 13: a signpost until the customer could reach this. Real screen now —
 * see `my-tasks-screen.tsx`.
 *
 * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
 * and is NOT authentication. The refusal that matters is in the API, where the
 * customer predicate is derived from the SESSION and never accepted from the
 * caller.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/home/my-tasks');
  return <MyTasksScreen />;
}
