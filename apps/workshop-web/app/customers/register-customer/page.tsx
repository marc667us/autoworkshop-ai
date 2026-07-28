import { requireNavRoute } from '@autoworkshop/next-shell';
import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';

/**
 * /customers/register-customer — RECEPTION's route (07.txt pt2 §48).
 *
 * A thin mount; the screen is shared from `app/_screens`. The GATE is not
 * shared — each page names its own path so `check-page-gates.sh` can verify the
 * gate belongs to the page it sits in.
 *
 * Only §48 advertises this route, so only reception reaches it through the
 * navigation. That is NOT what stops anyone else writing: `CustomerService`
 * refuses a role outside `CAN_CREATE_CUSTOMER` regardless of which screen, or
 * which server action, called it (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customers/register-customer');
  return <RegisterCustomerScreen route="/customers/register-customer" />;
}
