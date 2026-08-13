import { requireNavRoute } from '@autoworkshop/next-shell';
import { QualityQueueScreen } from '../../_screens/quality-queue-screen';

/**
 * /repair-services/quality-control — the §34 DEFAULT tree's route.
 *
 * 🔴 THE MOST IMPORTANT OF THE THREE, AND THE EASIEST TO OVERLOOK. This is where
 * `quality_control_inspector` lands — the role whose entire job is this screen.
 * `navRoleFor` maps it to the nav id `quality-control`, and `workshopRoleGroups`
 * defines trees for only owner, manager, reception and technician, so it falls
 * back to the DEFAULT tree. `workshop_supervisor` and `platform_administrator`
 * arrive here for the same reason.
 *
 * Building only the owner's path would have left the dedicated inspector on a
 * blank page — the trap Slice 4 recorded and Slice C paid for anyway.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/repair-services/quality-control';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <QualityQueueScreen route={ROUTE} />;
}
