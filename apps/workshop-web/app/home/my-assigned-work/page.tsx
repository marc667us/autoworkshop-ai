import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardsScreen } from '../../_screens/job-cards-screen';

/**
 * /home/my-assigned-work — the §49 TECHNICIAN tree — same screen, narrowed to their assigned cards by the service
 *
 * The screen is shared; the SERVICE decides what each role sees, so a
 * technician opening their own route gets only their assigned cards from the
 * very same query a manager runs. See `job-cards-screen.tsx`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/home/my-assigned-work');
  return <JobCardsScreen route="/home/my-assigned-work" />;
}
