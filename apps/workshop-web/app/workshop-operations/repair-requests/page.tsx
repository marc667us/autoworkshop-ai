import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobQueueScreen } from '../../_screens/job-queue-screen';
import { JOB_QUEUES } from '../../_screens/job-queue-definitions';

/**
 * /workshop-operations/repair-requests — a real view of real job cards, narrowed to one point in the
 * lifecycle. The queue's stages and its words live in `job-queue-definitions`,
 * so this file cannot drift from the others.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-operations/repair-requests');
  return <JobQueueScreen route="/workshop-operations/repair-requests" queue={JOB_QUEUES['/workshop-operations/repair-requests']} />;
}
