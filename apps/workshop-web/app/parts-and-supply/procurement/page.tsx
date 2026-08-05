import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProcurementScreen } from '../../_screens/procurement-screen';

/**
 * `/parts-and-supply/procurement` — "Procurement". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * What the workshop needs and what it has ordered. Raising a requisition is
 * deliberately wide (a technician who cannot ask writes it on paper); approving
 * one commits the workshop's money, so that is narrow.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts-and-supply/procurement';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ProcurementScreen route={ROUTE} />;
}
