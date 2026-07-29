import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardsScreen } from '../../_screens/job-cards-screen';

/**
 * /workshop-operations/job-cards — the §46 owner tree
 *
 * The screen is shared; the SERVICE decides what each role sees, so a
 * technician opening their own route gets only their assigned cards from the
 * very same query a manager runs. See `job-cards-screen.tsx`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-operations/job-cards');
  return <JobCardsScreen route="/workshop-operations/job-cards" />;
}
