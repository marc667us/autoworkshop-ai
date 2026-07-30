import { requireNavRoute } from '@autoworkshop/next-shell';
import { TestingSheetScreen } from '../../../_screens/testing-sheet-screen';

/**
 * /testing/submit-to-quality-control/<id> — one test session. the §49 TECHNICIAN tree — the same session, entered by its submission.
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
  await requireNavRoute('workshop', '/testing/submit-to-quality-control');
  const { id } = await params;
  return <TestingSheetScreen route="/testing/submit-to-quality-control" sessionId={id} />;
}
