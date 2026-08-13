import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomerMessagesScreen } from '../../../_screens/customer-messages-screen';

/**
 * `/communication/messages` — the customer workspace, `01 (1).txt` §33. Slice 7.
 *
 * The customer's conversations with the workshop. A customer cannot name who to write to, so the API addresses their thread to the front desk and REFUSES plainly if the workshop has nobody set up to receive it.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/communication/messages';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <CustomerMessagesScreen route={ROUTE} />;
}
