import { requireNavRoute } from '@autoworkshop/next-shell';
import { InvoicesScreen } from '../../_screens/invoices-screen';

/**
 * `/collection-and-payment/invoices` — "Invoices". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * ONE screen at three routes. Billing is the same act whatever the tree calls
 * it. Until slice 3 a job reached quality control and STOPPED — there was no
 * invoice, so no job could be closed for money.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/collection-and-payment/invoices';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <InvoicesScreen route={ROUTE} />;
}
