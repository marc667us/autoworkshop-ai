import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiagnosisSheetScreen } from '../../../_screens/diagnosis-sheet-screen';

/**
 * /repair-control/diagnosis-queue/<id> — one diagnosis record. the §47 WORKSHOP MANAGER tree, which names it a queue because a manager's interest is the records waiting on review.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per diagnosis, so "is `/repair-control/diagnosis-queue/<id>` in your menu"
 * has no sensible answer. The real question is whether this viewer may see the QUEUE,
 * and a viewer refused the queue is refused every record reachable from it.
 * `check-page-gates.sh` strips trailing dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `DiagnosisService.findById` re-verifies role, tenant,
 * organization AND — for a technician — assignment, answering 404 for a record outside
 * them, so guessing an id yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
  const { id } = await params;
  return <DiagnosisSheetScreen route="/repair-control/diagnosis-queue" diagnosisId={id} />;
}
