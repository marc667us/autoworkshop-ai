import { requireNavRoute } from '@autoworkshop/next-shell';
import { QuotationQueueScreen } from '../../_screens/quotation-queue-screen';

/**
 * /customer-approval/quotations — the §47 WORKSHOP MANAGER tree — the role §5's internal approval is written for.
 *
 * The screen is shared across all three role trees; the GATE is not. Each page names
 * its own path so `check-page-gates.sh` can verify the gate belongs to the page it
 * sits in.
 *
 * NOT A SECURITY CONTROL. `QuotationService` refuses the roles that may not read or
 * prepare a quotation, holds APPROVAL to a narrower set than preparation (§5), enforces
 * §563's approver independence, and Postgres RLS denies cross-tenant access
 * independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-approval/quotations');
  return <QuotationQueueScreen route="/customer-approval/quotations" />;
}
