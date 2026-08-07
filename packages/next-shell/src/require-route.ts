import { notFound } from 'next/navigation';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
} from '@autoworkshop/navigation';
import { currentViewer, viewerRole } from './viewer';
import { grantsFor, isForeignToWorkshop } from './viewer-contract';

/**
 * The gate a concrete page must call when its WORKSPACE is not gated as a whole
 * — Phase 4, and the second shape of T-0005 finding 4.
 *
 * ⚠️ WHY `requireWorkspaceAccess` DOES NOT COVER THIS CASE.
 *
 * That function asks "does the viewer hold permission X?", which is the right
 * question for `admin-web`: `02.txt` §32 gates the whole administration surface
 * on `platform.admin`, so one key answers for every screen in it. The workshop
 * workspace is not like that. It is gated per ROLE TREE (`07.txt` pt2 §46-§49),
 * and those trees differ in WHICH SCREENS they contain, not in a permission key:
 *
 *   · §46 owner, §47 manager, §48 reception — all contain Customer Reception.
 *   · §49 TECHNICIAN DOES NOT. A technician's navigation has no customers or
 *     vehicles entry at all.
 *
 * No permission key distinguishes them — `technician` and `reception_staff` both
 * hold NONE of the three keys in the matrix. So `requireWorkspaceAccess` cannot
 * express this rule, and a page relying on it would admit the technician.
 *
 * THE HOLE THIS CLOSES IS FINDING 4'S, IN A NEW PLACE. Until a concrete page
 * exists, every route goes through `app/[...slug]`, and `renderModulePage`
 * resolves the path against the role-filtered, grant-filtered tree — so a
 * technician typing `/customer-reception/customers` gets a 404. The moment a
 * real `app/customer-reception/customers/page.tsx` lands, Next resolves it AHEAD
 * of the catch-all and that resolution stops happening. The protection would
 * disappear at exactly the moment there is real customer data behind it.
 *
 * This applies the SAME resolution the catch-all does, from the page itself. It
 * is deliberately the same three functions in the same order, so the router and
 * the navigation cannot drift onto different maps.
 *
 * CALL IT AS THE FIRST STATEMENT, BEFORE ANY DATA ACCESS. A layout gate does not
 * substitute: measured on a probe page, a layout gate leaves the page's server
 * component EXECUTING and its output in the RSC flight payload while the DOM
 * shows only the denial. See `require-access.ts`.
 *
 * NOT THE CONTROL, AND NOTHING HERE MAY BE RELIED ON AS ONE. CLAUDE.md §8:
 * "Hidden ≠ secure." The API's `TenantGuard`, the services' role checks and
 * Postgres RLS deny independently, and every page must remain safe if this call
 * were deleted. What this stops is a viewer reaching a screen their own
 * navigation does not advertise — the Phase 3 acceptance criterion.
 *
 * 404 rather than 403, deliberately: a 403 confirms the route exists and hands
 * an unauthorised viewer a map of the platform's screens.
 */
export async function requireNavRoute(
  workspaceId: string,
  /** The route's own path, e.g. `/customer-reception/customers`. */
  pathname: string,
): Promise<void> {
  const base = getWorkspace(workspaceId);
  if (!base) notFound();

  // Resolved together and from the same helpers the layout and the catch-all
  // use. `currentViewer` and `viewerRole` are memoised per request with React's
  // `cache()`, so this cannot resolve a different identity than the shell
  // rendering around it.
  const [viewer, role] = await Promise.all([
    currentViewer(workspaceId),
    viewerRole(workspaceId),
  ]);

  // 🔴 A ROLE FROM ANOTHER WORKSPACE IS REFUSED BEFORE THE TREE IS CONSULTED.
  //
  // Consulting it would ADMIT them. `navRoleFor()` returns `undefined` for a
  // customer, `workspaceForRole(base, undefined)` returns the workshop's DEFAULT
  // staff tree, and every item in that tree is ungated — so `visibleGroups`
  // filters nothing and all 45 entries come back "advertised". Measured: a
  // signed-in customer could reach Customers, Vehicles, Job Cards, Quotations,
  // Suppliers, Warranty Claims and the Reports screens.
  //
  // This is the REFUSING half of that fix. The navigation half lives in
  // `WorkspaceShell`, and neither is sufficient alone: hiding without refusing
  // is what CLAUDE.md §8 forbids by name, and refusing without hiding leaves 45
  // menu entries that 404 — the signpost-that-404s failure this repository has
  // already paid for three times.
  if (isForeignToWorkshop(viewer?.activeRole)) notFound();

  // A signed-out visitor has no role and no grants, so they fall through to the
  // workspace default tree with `NO_GRANTS` — which is correct: they see what an
  // anonymous visitor may see, which for every gated item is nothing.
  const workspace = workspaceForRole(base, role);
  const groups = visibleGroups(workspace, grantsFor(viewer));

  const advertised = groups.some((g) => g.items.some((i) => i.href === pathname));
  if (!advertised) notFound();
}
