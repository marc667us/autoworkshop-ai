import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';

/**
 * /customer-approval/pending-approvals — the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
 *
 * The screen is shared across all three role trees; the GATE is not. Each page names
 * its own path so `check-page-gates.sh` can verify the gate belongs to the page it
 * sits in.
 *
 * NOT A SECURITY CONTROL. `ProposalService` refuses the roles that may not read,
 * prepare or decide, enforces §424's immutability, and Postgres RLS denies
 * cross-tenant access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
  return <ProposalQueueScreen route="/customer-approval/pending-approvals" />;
}
