import { requireNavRoute } from '@autoworkshop/next-shell';
import { SupportCasesScreen } from '../../../_screens/support-cases-screen';

/**
 * `/support/support-cases` — the customer workspace, `01 (1).txt` §33. Slice 9 of
 * `COMPLETION_PLAN.md` — the only slice this session that moves customer-web,
 * which was the weakest tree in the product at 31%.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/support/support-cases';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <SupportCasesScreen route={ROUTE} />;
}
