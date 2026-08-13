import { requireNavRoute } from '@autoworkshop/next-shell';
import { QualityQueueScreen } from '../../_screens/quality-queue-screen';

/**
 * /repair-control/quality-control — the §46 OWNER tree's route.
 *
 * The owner holds "full workshop governance" and may inspect, so the entry
 * exists in their tree under Repair Control. Same screen; the heading follows
 * whichever tree the viewer is on, via `navLabelFor`.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/repair-control/quality-control';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <QualityQueueScreen route={ROUTE} />;
}
