import { requireNavRoute } from '@autoworkshop/next-shell';
import { ServiceRequestsScreen } from '../../_screens/service-requests-screen';

/**
 * `/customer-reception/service-requests` — reception's inbox for the public
 * Request for Service (owner's value chain, step 7).
 *
 * `requireNavRoute` FIRST, before any data access: a layout gate does not stop
 * this component executing, and its output would still ship in the RSC payload.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/customer-reception/service-requests');
  return <ServiceRequestsScreen />;
}
