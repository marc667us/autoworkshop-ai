import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionSheetScreen } from '../../../_screens/inspection-sheet-screen';

/**
 * /repair-control/inspection/<id> — one inspection sheet, §46 owner tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE. See the §34 sibling for the full reasoning:
 * a dynamic route has no nav entry of its own, so the gate asks whether this
 * viewer may see the queue this sheet hangs from.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/inspection');
  const { id } = await params;
  return <InspectionSheetScreen route="/repair-control/inspection" inspectionId={id} />;
}
