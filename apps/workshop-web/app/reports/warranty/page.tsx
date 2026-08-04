import { requireNavRoute } from '@autoworkshop/next-shell';
import { PlannedScreen } from '../../_screens/planned-screen';

/**
 * /reports/warranty — "Warranty".
 *
 * A CONCRETE page rather than the catch-all, so this route says what it is for
 * and what to do TODAY instead of rendering a generic "Not built yet" badge.
 * The wording lives in `_screens/planned-workshop.ts`; see the header there for
 * why 104 of these arrived at once.
 *
 * `requireNavRoute` FIRST, before anything else: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, adding a friendly placeholder would
 * quietly make a route reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/reports/warranty');
  return <PlannedScreen route="/reports/warranty" title="Warranty" />;
}
