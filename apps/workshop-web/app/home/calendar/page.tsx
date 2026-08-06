import { requireNavRoute } from '@autoworkshop/next-shell';
import { WorkshopCalendarScreen } from '../../_screens/workshop-calendar-screen';

/**
 * `/home/calendar` — the technician's tree (`07.txt` pt2 §49).
 *
 * 🔴 A RE-MOUNT, NOT A NEW SCREEN. This is the workshop calendar slice 2 mounted at /home/workshop-calendar. It already carries NO writes, deliberately, because HOME is reached by every role INCLUDING the technician, whose tree has no reception group.
 *
 * §49 gives the technician its own names for things the workshop trees already
 * have. Building a second implementation per tree is how two screens start
 * disagreeing about the same data; `navLabelFor` reads the heading back from
 * whichever tree the viewer is in, so one screen carries several names honestly.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without it, mounting a screen here would make it
 * reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/home/calendar';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WorkshopCalendarScreen route={ROUTE} />;
}
