import { requireNavRoute } from '@autoworkshop/next-shell';
import { NotificationInboxScreen } from '../../_screens/notification-inbox-screen';

/**
 * `/home/notification-inbox` — "Notification Inbox". Slice 7.
 *
 * Everything waiting, counted from the real records. Categories with a count of
 * zero are omitted entirely, so an empty inbox means nothing is waiting rather
 * than that the page is unfinished.
 *
 * `requireNavRoute` FIRST (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/home/notification-inbox';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <NotificationInboxScreen route={ROUTE} />;
}
