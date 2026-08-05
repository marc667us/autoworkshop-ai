import { requireNavRoute } from '@autoworkshop/next-shell';
import { CommunicationPreferencesScreen } from '../../../_screens/communication-preferences-screen';

/**
 * `/settings/communication-preferences` - the customer workspace, `01 (1).txt` section 33. Slice 9.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/settings/communication-preferences';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <CommunicationPreferencesScreen route={ROUTE} />;
}
