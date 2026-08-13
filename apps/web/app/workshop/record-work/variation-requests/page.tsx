import { requireNavRoute } from '@autoworkshop/next-shell';
import { VariationsScreen } from '../../_screens/variations-screen';

/**
 * /record-work/variation-requests
 *
 * The §49 TECHNICIAN tree's route, under Record Work — where §3764 step 11 puts it, between recording unexpected findings and completing the authorised repair. This is where variations are RAISED. The technician sees no review or decision controls here: they raised it, so §3792 requires somebody else.
 *
 * One screen, four tree routes — the roles involved in a variation span four
 * trees, and building fewer would leave one of them on a blank page. The gate is
 * NOT shared: each page names its own path so `check-page-gates.sh` can verify
 * the gate belongs to the page it sits in.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/record-work/variation-requests';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <VariationsScreen route={ROUTE} />;
}
