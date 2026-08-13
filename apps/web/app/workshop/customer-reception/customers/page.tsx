import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomersScreen } from '../../_screens/customers-screen';

/**
 * /customer-reception/customers — the §34 WORKSPACE DEFAULT route.
 *
 * This is what a viewer sees when their role has no tree of its own: a platform
 * administrator, a cashier, a storekeeper, a quality-control inspector. The
 * owner and reception reach the same screen at their own paths (§46 and §48),
 * and the technician (§49) reaches it at none — proven, not assumed: signed in
 * as `technician@autoworkshop.local` this route returns 404.
 *
 * The screen lives in `app/_screens/customers-screen.tsx`, shared with those
 * other routes. The GATE is not shared: each page names its own path, so
 * `check-page-gates.sh` can verify the gate belongs to the page it sits in.
 *
 * NOT A SECURITY CONTROL. `CustomerService` refuses the roles that may not read
 * the customer book — measured with a real technician token, which the API
 * answered 200 with the full list before that check existed — and Postgres RLS
 * denies cross-tenant access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-reception/customers');
  return <CustomersScreen route="/customer-reception/customers" />;
}
