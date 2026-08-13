import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardDetailScreen } from '../../../_screens/job-card-detail-screen';

/**
 * /workshop-operations/job-cards/<id> — the §46 OWNER tree.
 *
 * The owner's tree files job cards under Workshop Operations rather than
 * Workshop Floor, so the owner needs their own detail route: gating this
 * viewer on `/workshop-floor/job-cards` would 404 them on their own job cards.
 * Two routes, one screen — the same shape Slice C needed for Workshop Profile.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE. See the sibling under `workshop-floor`.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-operations/job-cards');
  const { id } = await params;
  return <JobCardDetailScreen id={id} listHref="/workshop-operations/job-cards" />;
}
