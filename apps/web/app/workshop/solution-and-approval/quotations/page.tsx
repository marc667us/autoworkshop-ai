import { requireNavRoute } from '@autoworkshop/next-shell';
import { QuotationQueueScreen } from '../../_screens/quotation-queue-screen';

/**
 * /solution-and-approval/quotations — the §34 WORKSPACE DEFAULT tree — seen by a workshop supervisor, cashier, storekeeper or platform administrator.
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
  await requireNavRoute('workshop', '/solution-and-approval/quotations');
  return <QuotationQueueScreen route="/solution-and-approval/quotations" />;
}
