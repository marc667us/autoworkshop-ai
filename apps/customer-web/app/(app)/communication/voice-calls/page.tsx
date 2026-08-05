import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomerCallsScreen } from '../../../_screens/customer-calls-screen';

/**
 * `/communication/voice-calls` - the customer workspace, `01 (1).txt` section 33. Slice 11.
 *
 * Voice and video happen IN THIS APP. The media goes straight between the
 * customer's device and the workshop's - it does not pass through this platform
 * and is not recorded.
 *
 * `requireNavRoute` FIRST (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/communication/voice-calls';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <CustomerCallsScreen route={ROUTE} fallbackTitle="Voice Calls" />;
}
