import { requireNavRoute } from '@autoworkshop/next-shell';
import { CreateJobCardScreen } from '../../_screens/create-job-card-screen';

/**
 * `/workshop-operations/vehicle-intake` — "Vehicle Intake" (OWNER §46).
 *
 * Opening a job card is the same act whatever the tree calls it, so all five
 * intake routes mount ONE screen. Booking a vehicle in IS opening its job card:
 * there is no intermediate record, and inventing one so each menu label could
 * have its own page would be four screens pretending to be different.
 *
 * 🔴 UNTIL 2026-08-05 EVERY ONE OF THESE WAS A SIGNPOST, and the only caller of
 * `POST /job-cards` anywhere in the product was customer-web's "report a
 * problem". A walk-in at the counter could not be booked in at all.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/workshop-operations/vehicle-intake';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <CreateJobCardScreen route={ROUTE} />;
}
