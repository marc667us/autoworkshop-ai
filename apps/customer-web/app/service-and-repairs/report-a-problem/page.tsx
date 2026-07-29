import { requireNavRoute } from '@autoworkshop/next-shell';
import { ReportProblemScreen } from '../../_screens/report-problem-screen';

/**
 * /service-and-repairs/report-a-problem — `01 (1).txt` §33.
 *
 * The customer's entry into the repair lifecycle: submitting this opens a job
 * card at stage "complaint received", which the workshop sees immediately.
 *
 * As everywhere in this workspace, the gate does not refuse a signed-out
 * visitor (the §33 tree puts no permission on the item) — they reach the screen
 * and get the unauthenticated state, and cannot write because there is no token.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/service-and-repairs/report-a-problem');
  return <ReportProblemScreen />;
}
