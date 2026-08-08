import { requireNavRoute } from '@autoworkshop/next-shell';
import { LeadsScreen } from '../../_screens/leads-screen';

/**
 * `/customer-reception/leads` — the lead-discovery agent's candidates, on the
 * DEFAULT §34 tree, which reaches them by this path.
 *
 * 🔴 THE PATH IN THIS FILE MUST BE THE PATH THIS FILE IS MOUNTED AT, and this
 * page has already been wrong about that once. It was written at `/sales/leads`
 * and moved here when the nav entry moved into Customer Reception, and the two
 * strings below came with it: `requireNavRoute('workshop', '/sales/leads')`
 * resolves a route NO tree advertises, so it calls `notFound()` for every
 * viewer — the menu entry would have 404'd for everybody, while
 * `audit-menu-coverage.mjs` counted the file as a working screen.
 *
 * "A copied file carries its origin's identity" is a recorded defect class in
 * this repository (`apiGet('customer')` in workshop-web, reading a cookie that
 * cannot exist there). This is that, with a route instead of a workspace.
 *
 * ⚠️ THE SAME SCREEN, MOUNTED AGAIN — not a copy. The role trees group the same
 * work differently; duplicating the screen would be the §0.3 violation.
 *
 * ⚠️ `requireNavRoute` FIRST, BEFORE ANY DATA ACCESS. A concrete page resolves
 * ahead of `app/[...slug]`, so the catch-all's tree check stops happening the
 * moment this file exists. Not the control — the API and RLS refuse
 * independently (CLAUDE.md §8).
 */
export default async function Page() {
  await requireNavRoute('workshop', '/customer-reception/leads');
  return <LeadsScreen route="/customer-reception/leads" />;
}
