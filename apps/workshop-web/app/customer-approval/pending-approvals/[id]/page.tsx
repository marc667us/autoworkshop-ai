import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';

/**
 * /customer-approval/pending-approvals/<id> — one customer proposal. the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
 * dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `ProposalService.findById` re-verifies role, tenant and
 * organization, answering 404 outside them.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
  const { id } = await params;
  return <ProposalSheetScreen route="/customer-approval/pending-approvals" proposalId={id} />;
}
