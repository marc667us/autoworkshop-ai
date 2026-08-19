import { requireNavRoute } from '@autoworkshop/next-shell';
import { FleetServiceRequestsScreen } from '../../_screens/fleet-screens';

/**
 * `/fleet/service-management/service-requests` — slice 20.
 *
 * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
 * this component executing and its output would still ship in the RSC payload —
 * a recorded defect here, found when a staff member could read customers'
 * vehicles on a page that "was gated".
 */
export default async function Page() {
  await requireNavRoute('fleet', '/service-management/service-requests');
  return <FleetServiceRequestsScreen />;
}
