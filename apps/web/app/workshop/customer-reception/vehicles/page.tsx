import { requireNavRoute } from '@autoworkshop/next-shell';
import { VehiclesScreen } from '../../_screens/vehicles-screen';

/**
 * /customer-reception/vehicles — the §34 WORKSPACE DEFAULT route.
 *
 * See the customers page beside this one for the full reasoning. In short: the
 * four role trees route this concept to different paths, so the screen is shared
 * from `app/_screens` and each path is a thin mount that gates itself.
 *
 * NOT A SECURITY CONTROL — `VehicleService` enforces the role, RLS enforces the
 * tenant (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-reception/vehicles');
  return <VehiclesScreen route="/customer-reception/vehicles" />;
}
