import { requireNavRoute } from '@autoworkshop/next-shell';
import { NotificationPreferencesScreen } from '../../_screens/notification-preferences-screen';

/**
 * `/settings/notifications` — "Notifications". Slice 6 of `COMPLETION_PLAN.md`.
 *
 * Which events this workshop wants to hear about, and how.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, giving a route a real screen would
 * quietly make it reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/settings/notifications';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <NotificationPreferencesScreen route={ROUTE} />;
}
