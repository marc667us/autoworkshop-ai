import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProceduresLibraryScreen } from '../../_screens/procedures-library-screen';

/**
 * `/technical-tools/technical-service-information` — the technician's tree (`07.txt` pt2 §49).
 *
 * 🔴 A RE-MOUNT, NOT A NEW SCREEN. This is the repair-procedures library slice 10 mounted at /knowledge-and-staff/repair-procedures-library. Technical service information IS the procedure set: what to do, in what order, with what safety notes.
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

const ROUTE = '/technical-tools/technical-service-information';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ProceduresLibraryScreen route={ROUTE} />;
}
