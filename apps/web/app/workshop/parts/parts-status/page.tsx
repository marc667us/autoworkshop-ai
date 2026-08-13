import { requireNavRoute } from '@autoworkshop/next-shell';
import { InventoryScreen } from '../../_screens/inventory-screen';

/**
 * `/parts/parts-status` — "Parts Status". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * The workshop's OWN shelf — not `catalogue.parts`, which is what suppliers
 * list for sale. On hand is SUMMED from the movement ledger, never stored: a
 * counter drifts the first time a write is retried.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts/parts-status';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <InventoryScreen route={ROUTE} />;
}
