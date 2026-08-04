import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';

/**
 * `/home/approvals/[id]` — one proposal.
 *
 * ⚠️ MOUNTED BECAUSE `ProposalQueueScreen` LINKS TO `${route}/${id}`.
 * Re-mounting the queue without this page would put a dead link on every row —
 * on a screen added precisely to remove dead links. The job queues do not need
 * an equivalent because they link to `jobCardDetailHrefFor(role, id)`, the
 * viewer's own tree, rather than to their own path.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/home/approvals';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireNavRoute('workshop', ROUTE);
  const { id } = await params;
  return <ProposalSheetScreen route={ROUTE} proposalId={id} />;
}
