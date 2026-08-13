import { requireNavRoute } from '@autoworkshop/next-shell';
import { PartsOrdersScreen } from '../../../_screens/parts-orders-screen';

/**
 * /parts-and-warranty/parts-orders — the buyer's marketplace orders.
 *
 * ⚠️ THE NAV ITEM THIS RESOLVES AGAINST WAS ADDED 2026-07-31 AND IS NOT IN §33.
 * ✅ OWNER-APPROVED 2026-07-31. `packages/navigation/src/workspaces.ts` carries
 * the note and the reasoning:
 * §33 predates the public parts marketplace, so it has no item for a customer's
 * own orders, and `requireNavRoute` refuses a path the viewer's tree does not
 * contain — a page no tree points at is a page nobody can open. CLAUDE.md lists
 * "changing approved navigation without review" as prohibited, so it was raised
 * for that review rather than slipped in, and the owner approved it.
 *
 * ⚠️ WHAT THIS GATE DOES, STATED ACCURATELY — the same caveat as the garage
 * page. `requireNavRoute` resolves the path against the viewer's VISIBLE
 * navigation. The customer tree has no permission on this item, so it is
 * visible to everyone including a viewer with no session: a signed-out visitor
 * is NOT refused here. They reach the page, `apiGet` finds no access token, and
 * the screen renders the unauthenticated state. That is intended — the
 * marketplace is public and the sign-in prompt belongs at the point of ordering,
 * not in front of the page.
 *
 * NOT the control either way. `UserGuard` authenticates the API call and
 * migration 022's RLS scopes the rows to the buyer, both independently of
 * anything here (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/parts-and-warranty/parts-orders');
  return <PartsOrdersScreen />;
}
