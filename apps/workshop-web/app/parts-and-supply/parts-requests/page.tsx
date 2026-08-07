import { requireNavRoute } from '@autoworkshop/next-shell';
import { WorkshopPartsRequestsScreen } from '../../_screens/parts-requests-screen';

/**
 * `/parts-and-supply/parts-requests` — the workshop's side of the
 * workshop→supplier edge (059).
 */
export default async function Page() {
  await requireNavRoute('workshop', '/parts-and-supply/parts-requests');
  return <WorkshopPartsRequestsScreen />;
}
