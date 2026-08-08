import { requireNavRoute } from '@autoworkshop/next-shell';
import { LeadsScreen } from '../../_screens/leads-screen';

/**
 * `/workshop-operations/leads` — the lead-discovery agent's candidates, on the
 * §46 OWNER tree, which reaches them by this path.
 *
 * ⚠️ THE SAME SCREEN, MOUNTED AGAIN — not a copy. The workshop's role trees
 * (`07.txt` pt2 §46-§49) group the same work differently, and a route that
 * appears in a tree with no page behind it is a DEAD END: this repository has
 * shipped three of those. Duplicating the screen would be the §0.3 violation.
 *
 * ⚠️ `requireNavRoute` FIRST. A concrete page resolves ahead of `app/[...slug]`,
 * so the catch-all's tree check stops happening the moment this file exists.
 * Not the control — the API and RLS refuse independently (CLAUDE.md §8).
 */
export default async function Page() {
  await requireNavRoute('workshop', '/workshop-operations/leads');
  return <LeadsScreen route="/workshop-operations/leads" />;
}
