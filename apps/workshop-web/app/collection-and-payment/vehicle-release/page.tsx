import { requireNavRoute } from '@autoworkshop/next-shell';
import { VehicleReleaseScreen } from '../../_screens/vehicle-release-screen';

/**
 * `/collection-and-payment/vehicle-release` — "Vehicle Release". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * Which cars can go, and what is still owed on each. It does NOT block an
 * unpaid release: a product that blocked the counter would be routed around,
 * and the release would stop being recorded at all.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/collection-and-payment/vehicle-release';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <VehicleReleaseScreen route={ROUTE} />;
}
