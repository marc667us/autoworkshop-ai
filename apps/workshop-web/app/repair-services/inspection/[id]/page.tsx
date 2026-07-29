import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionSheetScreen } from '../../../_screens/inspection-sheet-screen';

/**
 * /repair-services/inspection/<id> — one inspection sheet, §34 default tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC
 * and no navigation advertises one entry per inspection, so "is
 * `/repair-services/inspection/<id>` in your menu" has no sensible answer. The
 * real question is whether this viewer may see the QUEUE, and a viewer refused
 * the queue is refused every sheet reachable from it. `check-page-gates.sh`
 * strips trailing dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `InspectionService.findById` re-verifies role,
 * tenant, organization AND — for a technician — assignment, answering 404 for a
 * sheet outside them, so guessing an id yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-services/inspection');
  const { id } = await params;
  return <InspectionSheetScreen route="/repair-services/inspection" inspectionId={id} />;
}
