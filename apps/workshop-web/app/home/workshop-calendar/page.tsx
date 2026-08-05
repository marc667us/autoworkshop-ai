import { requireNavRoute } from '@autoworkshop/next-shell';
import { WorkshopCalendarScreen } from '../../_screens/workshop-calendar-screen';

/**
 * `/home/workshop-calendar` — "Workshop Calendar". Slice 2 of `COMPLETION_PLAN.md`.
 *
 * Seven days of bookings. Read-only: §34 puts this under HOME, which every
 * workshop role reaches — including the technician, whose tree has no
 * reception group, so a booking form here would offer an action the API
 * refuses.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/home/workshop-calendar';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WorkshopCalendarScreen route={ROUTE} />;
}
