import { requireNavRoute } from '@autoworkshop/next-shell';
import { AddVehicleScreen } from '../../_screens/add-vehicle-screen';

/**
 * /my-vehicles/add-vehicle — `01 (1).txt` §33.
 *
 * The gate checks the viewer's visible navigation, which for the customer
 * workspace admits a SIGNED-OUT visitor too: the §33 tree puts no permission on
 * this item, so `requireNavRoute` does not refuse them. See the garage page for
 * the full note and the measurement behind it. Such a visitor reaches the
 * screen and gets the unauthenticated state; they cannot write, because
 * `apiPost` finds no token and the API refuses.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/my-vehicles/add-vehicle');
  return <AddVehicleScreen />;
}
