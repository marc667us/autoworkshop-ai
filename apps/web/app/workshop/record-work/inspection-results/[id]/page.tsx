import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionSheetScreen } from '../../../_screens/inspection-sheet-screen';

/**
 * /record-work/inspection-results/<id> — one sheet, §49 technician tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE — see the §34 sibling for the reasoning. The
 * per-record check is the service's: a technician reaching for a sheet on a card
 * they are not assigned to gets 404, the same answer an unknown id gives.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/record-work/inspection-results');
  const { id } = await params;
  return <InspectionSheetScreen route="/record-work/inspection-results" inspectionId={id} />;
}
