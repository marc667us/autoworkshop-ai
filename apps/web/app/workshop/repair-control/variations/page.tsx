import { requireNavRoute } from '@autoworkshop/next-shell';
import { VariationsScreen } from '../../_screens/variations-screen';

/**
 * /repair-control/variations
 *
 * Serves BOTH the §46 owner and §47 manager trees, which use the same group slug. Both roles hold CAN_RAISE_VARIATION and CAN_REVIEW_VARIATION, and neither tree carried a variation entry until this slice — a gap found by scripts/audit-nav-coverage.mjs rather than by tripping over it.
 *
 * One screen, four tree routes — the roles involved in a variation span four
 * trees, and building fewer would leave one of them on a blank page. The gate is
 * NOT shared: each page names its own path so `check-page-gates.sh` can verify
 * the gate belongs to the page it sits in.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/repair-control/variations';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', ROUTE);
  return <VariationsScreen route={ROUTE} />;
}
