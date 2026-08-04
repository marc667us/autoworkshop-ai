import { requireNavRoute } from '@autoworkshop/next-shell';
import { PlannedScreen } from '../../_screens/planned-screen';

/**
 * /home/calendar — `07.txt` pt2 §49, the technician's tree.
 *
 * A CONCRETE page rather than the catch-all, so this route says what it is for
 * and what to do TODAY instead of rendering a generic "not built yet". The
 * wording lives in `planned-content.ts`; see the header there for why.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4). A role whose tree lacks this entry still gets a 404.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/home/calendar');
  return <PlannedScreen route="/home/calendar" title="Calendar" />;
}
