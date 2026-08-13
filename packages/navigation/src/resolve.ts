/**
 * Navigation resolution — permissions, active state and breadcrumbs.
 *
 * Pure functions over the navigation tree. No React, no router, no fetch, so
 * every branch is directly unit-testable and the same logic serves the shell,
 * the Playwright journeys and the permission tests.
 */

import type { Crumb, NavGroup, PermissionKey, RoleId, Workspace } from './types';
import { withPackBase } from './pack-base';

/**
 * The navigation a ROLE sees inside a workspace — `07.txt` part 2 §46-§49.
 *
 * Falls back to the workspace default when the role is unknown or has no tree
 * of its own. §50 defines eight workshop roles but only four trees, so the
 * fallback is the normal path for half of them, not an error case.
 */
export function groupsForRole(workspace: Workspace, role?: RoleId): NavGroup[] {
  if (!role) return workspace.groups;
  return workspace.roleGroups?.[role] ?? workspace.groups;
}

/**
 * A workspace as seen by one role.
 *
 * WHY THIS SHAPE. It returns a `Workspace`, not a bare group list, so that
 * every existing consumer — the shell, `breadcrumbsFor`, the catch-all route
 * resolver, the journey tests — keeps taking exactly the type it already took
 * and needs no change. The alternative, threading a `role` parameter through
 * each of them, would have created a second place where "which tree is this
 * viewer on" is decided, and this repo has already shipped that bug once: the
 * nav and the router each held their own copy of the viewer's grants and
 * disagreed, so the menu advertised routes that 404'd.
 *
 * Resolve the workspace ONCE, at the edge, and pass it down.
 *
 * Role selects the tree; permissions still filter it. Those are different
 * questions — "which map am I holding" versus "which doors on it may I open" —
 * and a role never bypasses a permission. Compose with `visibleGroups`.
 */
export function workspaceForRole(workspace: Workspace, role?: RoleId): Workspace {
  const groups = groupsForRole(workspace, role);
  if (groups === workspace.groups) return workspace;

  // `roleGroups` is DROPPED from the result, deliberately.
  //
  // Keeping it made this function non-idempotent in a way that quietly lied:
  // re-applying it to an already-resolved workspace with a DIFFERENT role fell
  // back to the first role's tree instead of the workspace default, because
  // `groups` was no longer the default by then. So
  // `workspaceForRole(workspaceForRole(w, 'technician'), 'supervisor')` handed
  // back the technician's navigation — under a supervisor's name.
  //
  // The returned object is a RESOLVED VIEW for one role. A resolved view has no
  // business carrying the menu of alternatives it was chosen from: anything
  // holding it could re-derive a different role and reintroduce exactly the
  // nav/router divergence this whole design exists to prevent. Dropping the
  // field makes a second application a no-op instead of a surprise, and makes
  // "resolve once, at the edge, then pass it down" enforceable rather than
  // merely advised.
  const { roleGroups: _resolved, ...rest } = workspace;
  return { ...rest, groups };
}

/**
 * Filter a workspace's navigation to what `grants` may see.
 *
 * ⚠️ THIS IS NOT A SECURITY BOUNDARY. §16 asks for "permission-aware
 * visibility" so users are not shown doors they cannot open — that is a
 * usability feature. The route guard, the API and RLS deny independently.
 * CLAUDE.md §8: "Hidden is not secure." A reviewer seeing this function must
 * not conclude the nav is what protects the page.
 *
 * A group disappears when its own permission fails OR when filtering leaves it
 * with no items — an expandable group that opens onto nothing is worse than no
 * group at all.
 */
export function visibleGroups(workspace: Workspace, grants: readonly PermissionKey[]): NavGroup[] {
  const held = new Set(grants);
  const allowed = (p?: PermissionKey) => p === undefined || held.has(p);

  // ADR-021: hrefs leave here MOUNTED. `workspaces.ts` transcribes the spec's
  // routes literally (`/<group>/<item>`); this is the one place that turns a
  // transcribed route into the path it is actually served at inside the single
  // artifact. `requireNavRoute` and `renderModulePage` apply the same base to
  // the pathname they are given, which is what keeps the two sides comparable.
  return workspace.groups
    .filter((g) => allowed(g.permission))
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => allowed(i.permission))
        .map((i) => ({ ...i, href: withPackBase(workspace.id, i.href) })),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Is `href` the active route for `pathname`?
 *
 * Exact match, or a prefix match at a SEGMENT boundary. The boundary check is
 * the point: a plain `startsWith` would light up `/parts` when the user is on
 * `/parts-and-supply`, and §4 requires the selected module to stay correctly
 * highlighted in both expanded and collapsed modes.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  return pathname.startsWith(href + '/');
}

/** Does any item in this group match the current route? Drives auto-expand. */
export function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((i) => isActive(i.href, pathname));
}

/**
 * Which groups should start expanded.
 *
 * §16 allows one or several groups open "depending on the user's preference",
 * so this is only the DEFAULT: the group containing the current page. Landing
 * with every group collapsed hides where you are; landing with all of them open
 * defeats grouping.
 */
export function defaultExpanded(groups: readonly NavGroup[], pathname: string): string[] {
  return groups.filter((g) => isGroupActive(g, pathname)).map((g) => g.id);
}

/**
 * Derive breadcrumbs for the current route (§2 layout, "Page Header and
 * Breadcrumbs").
 *
 * Built from the navigation tree rather than by splitting the URL, so crumbs
 * carry the spec's human labels ("Repair Staging") instead of slugs
 * ("repair-staging"). An unmatched path yields just the workspace crumb — a
 * deliberately honest empty state rather than a fabricated trail.
 */
export function breadcrumbsFor(
  workspace: Workspace,
  pathname: string,
  homeHref = '/',
): Crumb[] {
  const crumbs: Crumb[] = [{ label: workspace.label, href: homeHref }];

  // ADR-021. Both sides are normalised to the MOUNTED form before comparison,
  // rather than only the hrefs. `pathname` arrives mounted from the browser and
  // unmounted from anything that works in the spec's own route strings — the
  // tests do, and so does any caller holding a literal. `withPackBase` is
  // idempotent, so normalising both makes the comparison correct for either,
  // instead of correct for whichever the last caller happened to hold.
  const here = withPackBase(workspace.id, pathname);

  for (const g of workspace.groups) {
    for (const i of g.items) {
      if (isActive(withPackBase(workspace.id, i.href), here)) {
        // The group itself is not navigable — it is an expander, not a page —
        // so it appears as a label with no href.
        crumbs.push({ label: g.label });
        crumbs.push({ label: i.label });
        return crumbs;
      }
    }
  }

  return crumbs;
}

/** Flatten to a searchable list — backs the §16 "menu search" affordance. */
export function flattenItems(groups: readonly NavGroup[]) {
  return groups.flatMap((g) => g.items.map((i) => ({ ...i, groupId: g.id, groupLabel: g.label })));
}

/**
 * Case-insensitive substring search over item and group labels.
 *
 * Substring, not fuzzy: a technician typing "brak" wants "Brake" items, and a
 * fuzzy matcher would also return things sharing scattered letters, which reads
 * as noise. Matching the group label too means "finance" surfaces that group's
 * items even though none of them contain the word.
 */
export function searchItems(groups: readonly NavGroup[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flattenItems(groups).filter(
    (i) => i.label.toLowerCase().includes(q) || i.groupLabel.toLowerCase().includes(q),
  );
}
