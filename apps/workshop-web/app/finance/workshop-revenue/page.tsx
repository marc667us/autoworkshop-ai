import { requireNavRoute } from '@autoworkshop/next-shell';
import { WorkshopRevenueScreen } from '../../_screens/workshop-revenue-screen';

/**
 * `/finance/workshop-revenue` — "Workshop Revenue". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * Money actually received, net of refunds. NOT invoices issued: an invoice is a
 * claim, and counting claims as revenue is how a business believes it is
 * solvent when it is not.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance/workshop-revenue';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WorkshopRevenueScreen route={ROUTE} />;
}
