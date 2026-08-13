import { requireNavRoute } from '@autoworkshop/next-shell';
import { RegisterVehicleScreen } from '../../_screens/register-vehicle-screen';

/**
 * /vehicles/register-vehicle — RECEPTION's route (07.txt pt2 §48).
 *
 * See the register-customer page beside it. The screen loads the customer and
 * make lists server-side before rendering, so the owner picker only ever offers
 * customers this viewer is entitled to see.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/vehicles/register-vehicle');
  return <RegisterVehicleScreen route="/vehicles/register-vehicle" />;
}
