import { requireNavRoute } from '@autoworkshop/next-shell';
import { ApprovalLimitsScreen } from '../../_screens/approval-limits-screen';

/**
 * `/settings/approval-limits` — "Approval Limits". Slice 6 of `COMPLETION_PLAN.md`.
 *
 * What each role may approve without asking the owner. Recorded, not yet enforced, and the screen says so.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, giving a route a real screen would
 * quietly make it reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/settings/approval-limits';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ApprovalLimitsScreen route={ROUTE} />;
}
