import { requireNavRoute } from '@autoworkshop/next-shell';
import { RequestSpecialistScreen } from '../../_screens/request-specialist-screen';

/**
 * /plan-work/request-specialist — `07.txt` pt2 §49, the technician's tree.
 *
 * Slice 14: a signpost until now. Real screen — see `request-specialist-screen.tsx`.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4). A role whose tree lacks this entry still gets a 404.
 *
 * NOT the authorization control either way — `PlanningService` calls
 * `assertWorkshopStaff` on every method.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/plan-work/request-specialist');
  return <RequestSpecialistScreen />;
}
