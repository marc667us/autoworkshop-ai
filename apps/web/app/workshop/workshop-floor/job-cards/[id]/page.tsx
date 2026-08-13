import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardDetailScreen } from '../../../_screens/job-card-detail-screen';

/**
 * /workshop-floor/job-cards/<id> — the §34 default tree and the §47 manager tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC
 * and no navigation advertises one entry per record, so "is
 * `/workshop-floor/job-cards/<id>` in your menu" has no sensible answer. The
 * real question is whether this viewer may see the LIST, and a viewer refused
 * the list is refused every record reachable from it. `check-page-gates.sh`
 * strips trailing dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `JobCardService.findById` re-verifies role, tenant
 * and organisation — and, for a technician, assignment — answering 404 for
 * anything outside them, so guessing an id yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-floor/job-cards');
  const { id } = await params;
  return <JobCardDetailScreen id={id} listHref="/workshop-floor/job-cards" />;
}
