import { requireNavRoute } from '@autoworkshop/next-shell';
import { VariationsScreen } from '../../_screens/variations-screen';

/**
 * /solution-and-approval/variations
 *
 * The §34 DEFAULT tree's route — where workshop_supervisor and platform_administrator land, because their nav ids have no tree of their own. The supervisor is the role that performs §3792's internal review, so this is the route that matters most for the reviewing half of the flow.
 *
 * One screen, four tree routes — the roles involved in a variation span four
 * trees, and building fewer would leave one of them on a blank page. The gate is
 * NOT shared: each page names its own path so `check-page-gates.sh` can verify
 * the gate belongs to the page it sits in.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/solution-and-approval/variations';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <VariationsScreen route={ROUTE} />;
}
