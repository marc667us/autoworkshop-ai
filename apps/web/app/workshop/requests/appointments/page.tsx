import { requireNavRoute } from '@autoworkshop/next-shell';
import { AppointmentsScreen } from '../../_screens/appointments-screen';

/**
 * `/requests/appointments` — "Appointments". Slice 2 of `COMPLETION_PLAN.md`.
 *
 * ONE screen at four routes. Booking a customer in is the same act whatever
 * the tree calls it; four different screens so each menu label could have its
 * own would be four screens pretending to be different.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/requests/appointments';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <AppointmentsScreen route={ROUTE} />;
}
