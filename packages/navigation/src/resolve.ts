/**
 * Navigation resolution — permissions, active state and breadcrumbs.
 *
 * Pure functions over the navigation tree. No React, no router, no fetch, so
 * every branch is directly unit-testable and the same logic serves the shell,
 * the Playwright journeys and the permission tests.
 */

import type { Crumb, NavGroup, PermissionKey, Workspace } from './types';

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

  return workspace.groups
    .filter((g) => allowed(g.permission))
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.permission)) }))
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

  for (const g of workspace.groups) {
    for (const i of g.items) {
      if (isActive(i.href, pathname)) {
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
