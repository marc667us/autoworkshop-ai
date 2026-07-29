import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionSheetScreen } from '../../../_screens/inspection-sheet-screen';

/**
 * /repair-control/inspection-queue/<id> — one sheet, §47 manager tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE — see the §34 sibling for the reasoning.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/inspection-queue');
  const { id } = await params;
  return <InspectionSheetScreen route="/repair-control/inspection-queue" inspectionId={id} />;
}
