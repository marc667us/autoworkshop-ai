import { requireNavRoute } from '@autoworkshop/next-shell';
import { OutstandingBalancesScreen } from '../../_screens/outstanding-balances-screen';

/**
 * `/finance/outstanding-balances` — "Outstanding Balances". Slice 3 of `COMPLETION_PLAN.md`.
 *
 * What the workshop is owed, oldest due date first. The balance is summed from
 * payments and credit notes, never a stored counter.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance/outstanding-balances';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <OutstandingBalancesScreen route={ROUTE} />;
}
