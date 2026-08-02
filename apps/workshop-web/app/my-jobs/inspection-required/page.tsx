import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobQueueScreen } from '../../_screens/job-queue-screen';
import { JOB_QUEUES } from '../../_screens/job-queue-definitions';

/**
 * /my-jobs/inspection-required — a real view of real job cards, narrowed to one point in the
 * lifecycle. The queue's stages and its words live in `job-queue-definitions`,
 * so this file cannot drift from the others.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/my-jobs/inspection-required');
  return <JobQueueScreen route="/my-jobs/inspection-required" queue={JOB_QUEUES['/my-jobs/inspection-required']} />;
}
