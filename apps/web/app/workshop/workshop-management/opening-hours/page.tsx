import { requireNavRoute } from '@autoworkshop/next-shell';
import { OpeningHoursScreen } from '../../_screens/opening-hours-screen';

/**
 * `/workshop-management/opening-hours` — "Opening Hours". Slice 6 of `COMPLETION_PLAN.md`.
 *
 * When this workshop is open, and whether each day is shown on its public profile.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, giving a route a real screen would
 * quietly make it reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/workshop-management/opening-hours';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <OpeningHoursScreen route={ROUTE} />;
}
