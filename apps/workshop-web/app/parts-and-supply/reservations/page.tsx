import { requireNavRoute } from '@autoworkshop/next-shell';
import { PartsReservationsScreen } from '../../_screens/parts-reservations-screen';

/**
 * `/parts-and-supply/reservations` — "Reservations". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * Stock held for a job. A reservation is NOT a movement — the part is still on
 * the shelf, it is simply spoken for, so AVAILABLE falls and ON HAND does not.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts-and-supply/reservations';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <PartsReservationsScreen route={ROUTE} />;
}
