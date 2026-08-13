import { requireNavRoute } from '@autoworkshop/next-shell';
import { SupplierOrdersScreen } from '../../_screens/supplier-orders-screen';

/**
 * /orders-and-delivery/new-orders — the supplier order inbox.
 *
 * ⚠️ NO NAVIGATION CHANGE WAS NEEDED HERE, unlike the buyer's screen. The §35
 * supplier tree already carries `orders-and-delivery` with New Orders,
 * Confirmed Orders, Dispatch, Deliveries, Returns and Warranty Cases — the
 * approved navigation anticipated this screen. It replaces the catch-all
 * module placeholder that `app/[...slug]/page.tsx` was rendering for this path;
 * Next resolves a concrete page ahead of the catch-all.
 *
 * ⚠️ THIS ONE SCREEN COVERS THE WHOLE ORDER LIFECYCLE, and the three sibling
 * nav items are STILL PLACEHOLDERS. That is deliberate rather than unfinished:
 * splitting one short list across four routes would make a supplier hunt for an
 * order by guessing its status, and the status is exactly what they came to
 * change. When the volume justifies separate queues, they become filters over
 * this list — the API already indexes `(supplier_id, status, placed_at)` for
 * that. Named here so nobody reads the remaining placeholders as a defect.
 *
 * NOT the control. `UserGuard` authenticates the API call, migration 023's
 * policies scope the rows to this supplier's active members, and its trigger
 * decides which columns may change — all independently of anything here
 * (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('supplier', '/orders-and-delivery/new-orders');
  return <SupplierOrdersScreen />;
}
