import { requireNavRoute } from '@autoworkshop/next-shell';
import { MyNotificationsScreen } from '../../../_screens/my-notifications-screen';

/**
 * `/home/notifications` - the customer workspace, `01 (1).txt` section 33. Slice 9.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/home/notifications';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <MyNotificationsScreen route={ROUTE} />;
}
