import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionQueueScreen } from '../../_screens/inspection-queue-screen';

/**
 * /repair-control/inspection-queue — the §47 WORKSHOP MANAGER tree.
 *
 * §47 names the same concept "Inspection Queue" rather than "Inspection", which
 * is why the heading is read back from the navigation instead of hardcoded: a
 * manager sees their own word for this screen from the shared implementation.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/inspection-queue');
  return <InspectionQueueScreen route="/repair-control/inspection-queue" />;
}
