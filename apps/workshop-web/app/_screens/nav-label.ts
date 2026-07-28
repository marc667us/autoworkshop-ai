import { currentViewer, grantsFor, navRoleFor } from '@autoworkshop/next-shell';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';

/**
 * The label THIS VIEWER'S navigation uses for a route.
 *
 * WHY A SCREEN DOES NOT JUST HARDCODE ITS OWN TITLE. The catch-all takes its
 * heading from the nav item, so menu, breadcrumb and heading always agree. A
 * concrete `page.tsx` is the one place that agreement can break, and it already
 * did once: `/home/dashboard` said "Workshop Dashboard" while the technician's
 * menu called it "Technician Dashboard" — the same screen named three ways.
 *
 * It matters more here than it did there, because ONE screen is mounted at
 * several routes. `07.txt` pt2 gives each role its own tree, and they do not
 * agree on where the customer list lives or what it is called:
 *
 *   · §34 default   `/customer-reception/customers`  — "Customers"
 *   · §46 owner     `/customers-and-vehicles/customers` — "Customers"
 *   · §48 reception `/customers/customer-search`     — "Customer Search"
 *
 * Reading the label back from the tree means reception sees "Customer Search"
 * and an owner sees "Customers", from one implementation, with no per-route
 * copy of the wording to drift.
 *
 * `fallback` covers the case where the route resolves but the item does not —
 * which should be impossible after `requireNavRoute`, and is still not worth
 * throwing over a heading.
 */
export async function navLabelFor(
  workspaceId: string,
  pathname: string,
  fallback: string,
): Promise<string> {
  const base = getWorkspace(workspaceId);
  if (!base) return fallback;

  // `currentViewer` is memoised per request with React's `cache()`, so this
  // resolves the SAME viewer the layout and the gate already saw rather than
  // issuing another session read.
  const viewer = await currentViewer(workspaceId);
  const workspace = workspaceForRole(base, navRoleFor(viewer?.activeRole));

  return (
    visibleGroups(workspace, grantsFor(viewer))
      .flatMap((g) => g.items)
      .find((i) => i.href === pathname)?.label ?? fallback
  );
}
