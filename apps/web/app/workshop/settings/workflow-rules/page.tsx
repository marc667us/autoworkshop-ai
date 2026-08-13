import { requireNavRoute } from '@autoworkshop/next-shell';
import { WorkflowRulesScreen } from '../../_screens/workflow-rules-screen';

/**
 * `/settings/workflow-rules` — "Workflow Rules". Slice 6 of `COMPLETION_PLAN.md`.
 *
 * What this workshop wants to happen automatically. Recorded, not yet running.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, giving a route a real screen would
 * quietly make it reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/settings/workflow-rules';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WorkflowRulesScreen route={ROUTE} />;
}
