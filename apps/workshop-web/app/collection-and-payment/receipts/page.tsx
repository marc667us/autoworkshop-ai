import { requireNavRoute } from '@autoworkshop/next-shell';
import { ReceiptsScreen } from '../../_screens/receipts-screen';

/**
 * `/collection-and-payment/receipts` — "Receipts". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * Every payment and the receipt number given for it. One receipt per payment,
 * enforced by `uq_receipt_payment` — a second would be a reprint.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/collection-and-payment/receipts';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ReceiptsScreen route={ROUTE} />;
}
