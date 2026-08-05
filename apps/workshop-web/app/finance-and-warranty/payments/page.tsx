import { requireNavRoute } from '@autoworkshop/next-shell';
import { ReceivePaymentScreen } from '../../_screens/receive-payment-screen';

/**
 * `/finance-and-warranty/payments` — "Payments". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * The collection desk. Lists only what is still owed, because a desk taking
 * money wants the invoices somebody might walk up and pay, not a billing
 * history. Payments are RECORDED, not taken (ADR-012).
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance-and-warranty/payments';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ReceivePaymentScreen route={ROUTE} />;
}
