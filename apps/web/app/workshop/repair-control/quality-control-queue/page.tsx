import { requireNavRoute } from '@autoworkshop/next-shell';
import { QualityQueueScreen } from '../../_screens/quality-queue-screen';

/**
 * /repair-control/quality-control-queue — the §47 MANAGER tree's route.
 *
 * ⚠️ A DIFFERENT SLUG FROM THE OTHER TWO, AND IT IS NOT A TYPO. The §47 tree
 * names this entry "Quality-Control Queue" where §34 and §46 both say "Quality
 * Control", so the manager's path really is `quality-control-queue`. Assuming
 * the three trees agreed on a slug would 404 the manager while the other two
 * roles worked, which is the hardest version of this bug to notice.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/repair-control/quality-control-queue';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <QualityQueueScreen route={ROUTE} />;
}
