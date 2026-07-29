import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomerDashboardScreen } from '../../_screens/dashboard-screen';

/**
 * /home/dashboard — `01 (1).txt` §18, the customer's landing page.
 *
 * Until now this route fell through to the catch-all, which renders an honest
 * "not built yet" placeholder — so the FIRST screen a customer saw after signing
 * in told them nothing about their own vehicles.
 *
 * The gate admits a signed-out visitor here, as it does everywhere in this
 * workspace (the §33 tree puts no permission on the item) — see the garage page
 * for the measurement. Such a visitor gets the unauthenticated state; the API
 * has no token for them and returns no data.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/home/dashboard');
  return <CustomerDashboardScreen />;
}
