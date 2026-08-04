import { requireNavRoute } from '@autoworkshop/next-shell';
import { PlannedScreen } from '../../../_screens/planned-screen';

/**
 * /communication/voice-calls — `01 (1).txt` §33, the customer workspace.
 *
 * A CONCRETE page rather than the catch-all, so this route says what it is for
 * and what to do TODAY instead of rendering a generic "not built yet". The
 * wording lives in `planned-content.ts`; see the header there for why.
 *
 * `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is not
 * authentication — same reasoning as `/my-vehicles/garage`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('customer', '/communication/voice-calls');
  return <PlannedScreen route="/communication/voice-calls" title="Voice Calls" />;
}
