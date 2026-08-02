import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardDetailScreen } from '../../../_screens/job-card-detail-screen';

/**
 * /home/my-tasks/<id> — the §48 RECEPTION tree (and §47 manager, which also
 * carries `/home/my-tasks`).
 *
 * 🔴 RECEPTION HAS NO JOB-CARD LIST ROUTE AT ALL. §48's only job-card entry is
 * `/vehicle-intake/create-job-card`, which OPENS one; the only place reception
 * READS job cards is the `/home/my-tasks` queue. So that queue is this detail
 * route's parent — the alternative was either refusing reception the link on
 * their own queue, or adding a job-cards entry to §48, which would be a change
 * to approved navigation and `05.txt` §2 prohibits that without review.
 *
 * A detail route hanging off a QUEUE rather than a list is unusual in this app
 * and is the honest shape here: the queue is reception's list.
 *
 * ⚠️ GATED ON THE PARENT QUEUE ROUTE. See the sibling under `workshop-floor`.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/home/my-tasks');
  const { id } = await params;
  return <JobCardDetailScreen id={id} listHref="/home/my-tasks" />;
}
