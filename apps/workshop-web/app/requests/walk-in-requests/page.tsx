import { requireNavRoute } from '@autoworkshop/next-shell';
import { WalkInsScreen } from '../../_screens/walk-ins-screen';

/**
 * `/requests/walk-in-requests` — "Walk-in Requests". Slice 2 of `COMPLETION_PLAN.md`.
 *
 * Somebody at the counter with no booking. Free text for the person and the
 * car, because neither is on file yet and forcing a customer record first is
 * how a queue forms at the desk.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/requests/walk-in-requests';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WalkInsScreen route={ROUTE} />;
}
