import { requireNavRoute } from '@autoworkshop/next-shell';
import { WarrantyRecordsScreen } from '../../_screens/warranty-records-screen';

/**
 * `/finance-and-warranty/warranty-records` — "Warranty Records". Slice 5 of `COMPLETION_PLAN.md`.
 *
 * What this workshop has guaranteed. NOT an insurance product: a workshop
 * warrants its own work, so a policy is created from a completed job card.
 * "In force" is computed at read time — a stored flag is wrong the moment the
 * clock passes midnight.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance-and-warranty/warranty-records';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WarrantyRecordsScreen route={ROUTE} />;
}
