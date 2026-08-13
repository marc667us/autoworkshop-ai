import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardDetailScreen } from '../../../_screens/job-card-detail-screen';

/**
 * /home/my-assigned-work/<id> — the §49 TECHNICIAN tree.
 *
 * 🔴 THE TECHNICIAN HAS NO JOB-CARDS ROUTE ANYWHERE IN THEIR TREE. §49 gives
 * them "My Assigned Work" and seven `/my-jobs/*` queues, and nothing under
 * `/workshop-floor` or `/workshop-operations`. So the obvious link — every
 * queue pointing at `/workshop-floor/job-cards/<id>` — would have refused the
 * one role that spends the whole day in these queues, and refused it with a
 * 404 that reads as a broken product rather than as a navigation rule.
 *
 * `My Assigned Work` IS the technician's job-card list: it renders the same
 * `JobCardsScreen`, and `JobCardService` narrows a technician to the cards
 * assigned to them, so the identical request returns their cards and nobody
 * else's. Hanging the detail route off it needs no change to approved
 * navigation (`05.txt` §2).
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE. See the sibling under `workshop-floor`.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/home/my-assigned-work');
  const { id } = await params;
  return <JobCardDetailScreen id={id} listHref="/home/my-assigned-work" />;
}
