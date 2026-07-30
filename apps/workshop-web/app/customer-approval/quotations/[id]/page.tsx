import { requireNavRoute } from '@autoworkshop/next-shell';
import { QuotationSheetScreen } from '../../../_screens/quotation-sheet-screen';

/**
 * /customer-approval/quotations/<id> — one quotation. the §47 WORKSHOP MANAGER tree — the role §5's internal approval is written for.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per quotation, so "is this in your menu" has no
 * sensible answer. `check-page-gates.sh` strips trailing dynamic segments and enforces
 * exactly that.
 *
 * NOT the record-level check. `QuotationService.findById` re-verifies role, tenant and
 * organization, answering 404 outside them.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-approval/quotations');
  const { id } = await params;
  return <QuotationSheetScreen route="/customer-approval/quotations" quotationId={id} />;
}
