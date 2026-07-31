import { requireNavRoute } from '@autoworkshop/next-shell';
import { GarageScreen } from '../../../_screens/garage-screen';

/**
 * /my-vehicles/garage — `01 (1).txt` §33, the customer workspace.
 *
 * ⚠️ WHAT THIS GATE DOES, STATED ACCURATELY (an earlier version of this comment
 * claimed it stops signed-out visitors; Codex challenged that and was right).
 * `requireNavRoute` resolves the path against the viewer's VISIBLE NAVIGATION.
 * The §33 customer tree has no per-role variants and no permission on this item,
 * so it is visible to everyone — including a viewer with no session, who falls
 * back to that same default tree with no grants. **A signed-out visitor is
 * therefore NOT refused here.** They reach the page, `apiGet` finds no access
 * token, and the screen renders its `unauthenticated` state telling them to sign
 * in. That is the intended behaviour, not an oversight: `middleware.ts` says in
 * its own comment that it does not gate access, and forcing a redirect here
 * would couple the Playwright suite to a live Keycloak.
 *
 * So the gate's real job in this app is narrow: it keeps the route honest if the
 * §33 tree ever gains a permission or a role variant, and it keeps every
 * concrete page in the app subject to the same build-enforced rule rather than
 * some being exempt. It is NOT authentication.
 *
 * NOT the control either way. `VehicleService` narrows a `customer` viewer to
 * their OWN vehicles and Postgres RLS isolates the tenant, both independently of
 * anything here (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/my-vehicles/garage');
  return <GarageScreen />;
}
