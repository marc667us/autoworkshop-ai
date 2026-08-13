import { requireNavRoute } from '@autoworkshop/next-shell';
import { MyInstalledPartsScreen } from '../../../_screens/my-installed-parts-screen';

/**
 * /parts-and-warranty/installed-parts — `01 (1).txt` §33, the customer workspace.
 *
 * Slice 13: a signpost until the customer could reach this. Real screen now —
 * see `my-installed-parts-screen.tsx`.
 *
 * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
 * and is NOT authentication. The refusal that matters is in the API, where the
 * customer predicate is derived from the SESSION and never accepted from the
 * caller.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/parts-and-warranty/installed-parts');
  return <MyInstalledPartsScreen />;
}
