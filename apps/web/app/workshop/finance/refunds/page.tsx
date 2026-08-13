import { requireNavRoute } from '@autoworkshop/next-shell';
import { RefundsScreen } from '../../_screens/refunds-screen';

/**
 * `/finance/refunds` — "Refunds". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * Money going back out. A refund returns what was PAID; a credit note reduces
 * what is OWED — different tables, different screens.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance/refunds';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <RefundsScreen route={ROUTE} />;
}
