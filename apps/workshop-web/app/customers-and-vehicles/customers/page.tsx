import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomersScreen } from '../../_screens/customers-screen';

/**
 * /customers-and-vehicles/customers — the workshop OWNER's route (07.txt pt2 §46)
 *
 * A thin mount. The screen itself lives in `app/_screens`, shared with the
 * other routes the role trees give this concept; see that file for why one
 * screen needs several routes. What is NOT shared is the gate: each page names
 * ITS OWN path, so `check-page-gates.sh` can verify the gate belongs to the
 * page it is in.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS. A concrete page is resolved ahead
  // of the catch-all, so it carries no route check unless it makes one.
  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
  return <CustomersScreen route="/customers-and-vehicles/customers" />;
}
