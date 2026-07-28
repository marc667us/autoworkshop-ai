import { notFound } from 'next/navigation';
import type { PermissionKey, WorkspaceId } from '@autoworkshop/navigation';
import { currentViewer } from './viewer';
import { hasWorkspaceAccess } from './WorkspaceGate';

/**
 * The gate a CONCRETE page must call — T-0005 finding 4, second half.
 *
 * ⚠️ WHY THE LAYOUT GATE IS NOT ENOUGH, MEASURED RATHER THAN ASSUMED.
 *
 * The obvious fix for finding 4 was to gate in `app/layout.tsx`, since a layout
 * wraps every route in its segment and no page can escape it by route
 * precedence. I wrote that, claimed it "prevents execution, not merely display",
 * and then tested it with a probe page that logs when its server component runs.
 * Against a signed-out visitor on a fresh build:
 *
 *   · rendered DOM        — only the denial. The gate works, visually.
 *   · RSC flight payload  — CONTAINED THE PROBE PAGE'S OUTPUT.
 *   · server console      — the probe's server component EXECUTED.
 *
 * So a layout gate is a DISPLAY gate. Next renders the matched page segment
 * regardless of whether the layout includes `children` in its own output, and
 * ships the result to the browser in the flight payload where the DOM never
 * shows it. A page that queried a database would have queried it; a page that
 * rendered a customer's name would have sent that name to someone not allowed
 * to see it, invisibly.
 *
 * The layout gate is KEPT — it stops enumeration in the DOM and gives an honest
 * message — but it is not the page's protection. This is.
 *
 * CALL IT AS THE FIRST STATEMENT OF EVERY CONCRETE `page.tsx`, before any data
 * access. `scripts/guardrails/check-page-gates.mjs` fails the build if a page
 * under a gated workspace does not, so this is enforced rather than remembered —
 * finding 4 exists precisely because "remember to protect it" was already the
 * design once.
 *
 * NOT THE CONTROL, STILL. `notFound()` hides a screen; the API's `TenantGuard`
 * and Postgres RLS are what deny the DATA, independently, and every page must
 * remain safe if this call were deleted (CLAUDE.md §8).
 *
 * 404 AND NOT 403, deliberately: a 403 confirms the route exists, which hands an
 * unauthorised viewer a map of the platform's screens. The same reasoning
 * `renderModulePage` already uses for hidden modules.
 */
export async function requireWorkspaceAccess(
  workspaceId: WorkspaceId | string,
  requiredGrant: PermissionKey,
): Promise<void> {
  const viewer = await currentViewer(workspaceId);
  if (!hasWorkspaceAccess(viewer, requiredGrant)) notFound();
}
