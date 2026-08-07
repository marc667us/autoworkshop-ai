import { requireNavRoute } from '@autoworkshop/next-shell';
import { PartsRequestsScreen } from '../../_screens/parts-requests-screen';

/**
 * `/orders-and-delivery/parts-requests` — the supplier's side of the
 * workshop→supplier edge.
 *
 * `requireNavRoute` FIRST, before any data access: a layout gate does not stop
 * this component executing, and its output would still ship in the RSC payload.
 */
export default async function Page() {
  await requireNavRoute('supplier', '/orders-and-delivery/parts-requests');
  return <PartsRequestsScreen />;
}
