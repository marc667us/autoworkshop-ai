import { requireNavRoute } from '@autoworkshop/next-shell';
import { StagingBoardScreen } from '../../_screens/staging-board-screen';

/**
 * /workshop-floor/repair-staging — the §34 workspace default and the §47
 * manager tree, which both put Repair Staging under Workshop Floor.
 *
 * The screen is shared with `/workshop-operations/repair-staging` (the §46 owner
 * tree). One implementation, thin self-gating pages — the same shape as job
 * cards, and for the reason Phase 4 paid for: the role trees route the same
 * concept to different paths, so a board built at one path is invisible to every
 * role that uses another.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-floor/repair-staging');
  return <StagingBoardScreen route="/workshop-floor/repair-staging" />;
}
