import { requireNavRoute } from '@autoworkshop/next-shell';
import { JobCardsScreen } from '../../_screens/job-cards-screen';

/**
 * /workshop-floor/job-cards — the §34 workspace default and the §47 manager tree
 *
 * The screen is shared; the SERVICE decides what each role sees, so a
 * technician opening their own route gets only their assigned cards from the
 * very same query a manager runs. See `job-cards-screen.tsx`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-floor/job-cards');
  return <JobCardsScreen route="/workshop-floor/job-cards" />;
}
