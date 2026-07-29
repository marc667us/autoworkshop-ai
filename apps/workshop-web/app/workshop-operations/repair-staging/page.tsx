import { requireNavRoute } from '@autoworkshop/next-shell';
import { StagingBoardScreen } from '../../_screens/staging-board-screen';

/**
 * /workshop-operations/repair-staging — the §46 workshop-owner tree, which
 * groups Repair Staging under Workshop Operations rather than Workshop Floor.
 *
 * Same screen as `/workshop-floor/repair-staging`; only the route differs, and
 * each page gates on its own path so a viewer whose tree lacks this entry gets
 * the 404 their navigation implies.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/workshop-operations/repair-staging');
  return <StagingBoardScreen route="/workshop-operations/repair-staging" />;
}
