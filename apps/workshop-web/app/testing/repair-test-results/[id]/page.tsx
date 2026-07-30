import { requireNavRoute } from '@autoworkshop/next-shell';
import { TestingSheetScreen } from '../../../_screens/testing-sheet-screen';

/**
 * /testing/repair-test-results/<id> — one test session. the §49 TECHNICIAN tree. §49 splits one test session into four entries — results, scan, road test and submission — and they are FACETS of one record, so all four open the same screen. A submission page that could not show what is being submitted would be worse than none.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per session. `check-page-gates.sh` strips trailing
 * dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `TestingService.findById` re-verifies role, tenant,
 * organization AND — for a technician — assignment, answering 404 outside them.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/testing/repair-test-results');
  const { id } = await params;
  return <TestingSheetScreen route="/testing/repair-test-results" sessionId={id} />;
}
