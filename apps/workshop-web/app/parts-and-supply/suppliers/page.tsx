import { requireNavRoute } from '@autoworkshop/next-shell';
import { SuppliersScreen } from '../../_screens/suppliers-screen';

/**
 * `/parts-and-supply/suppliers` — "Suppliers". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * Who the workshop buys from, and what it has spent with each. The directory
 * itself belongs to the public marketplace — suppliers register themselves.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts-and-supply/suppliers';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <SuppliersScreen route={ROUTE} />;
}
