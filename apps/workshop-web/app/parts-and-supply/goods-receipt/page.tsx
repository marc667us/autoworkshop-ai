import { requireNavRoute } from '@autoworkshop/next-shell';
import { GoodsReceiptScreen } from '../../_screens/goods-receipt-screen';

/**
 * `/parts-and-supply/goods-receipt` — "Goods Receipt". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * Booking a delivery in. The receipt and the stock movements are ONE
 * transaction: paperwork that says it arrived while the shelf says otherwise is
 * the worst state a store can be in.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts-and-supply/goods-receipt';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <GoodsReceiptScreen route={ROUTE} />;
}
