/**
 * Navigation model types.
 *
 * This package is deliberately FRAMEWORK-FREE — no React, no Next.js. The
 * navigation tree is data, and every one of the 7 apps plus Storybook, the
 * Playwright journeys and the permission tests need to read that data without
 * dragging a renderer in with it. `packages/ui` renders it; this package
 * defines it.
 *
 * Source of truth: `autoworkshop 01 (1).txt` — the whole file is the approved
 * navigation plan. §16-17 define the side-nav architecture and the full group
 * list; §33-39 define the per-workspace groups. Nothing here is invented; if a
 * label is not in that spec it does not belong in this file.
 */

/** Permission key, e.g. `job_card.read`. Resolved against the user's grants. */
export type PermissionKey = string;

/**
 * A leaf navigation entry — something you can actually navigate to.
 *
 * `01 (1).txt` §16 requires unread counters and warning badges on side-nav
 * items, so those are part of the model rather than a rendering afterthought.
 */
export interface NavItem {
  /** Stable id. Used for pinning, favourites and analytics — never the label. */
  id: string;
  label: string;
  href: string;
  /**
   * Permission required to SEE this item. §16: "Permission-aware visibility."
   * Undefined means every authenticated member of the workspace may see it.
   *
   * Hiding is a usability affordance, NOT a security control — the route and
   * the API must independently deny. See CLAUDE.md §8 "Hidden is not secure".
   */
  permission?: PermissionKey;
  /** Counter key resolved at runtime, e.g. open job cards. §21, §22, §23. */
  counterKey?: string;
  /** Warning-badge key, e.g. reorder alerts and quarantine in §24. */
  warningKey?: string;
}

/**
 * A side-navigation group — the "major menu button" of §16.
 *
 * §16: each group has an icon, a title, an expand/collapse arrow, an optional
 * status counter and an optional warning badge.
 */
export interface NavGroup {
  id: string;
  label: string;
  /**
   * Icon NAME, not an icon component — keeping this package renderer-free
   * means it cannot hold JSX. `packages/ui` maps the name to a glyph.
   */
  icon: string;
  items: NavItem[];
  /** Group is hidden wholesale unless the user holds this permission. */
  permission?: PermissionKey;
}

/**
 * A workspace is one of the 7 apps (§86). The active workspace decides which
 * groups appear — §17: "The exact groups displayed shall depend on the active
 * workspace."
 */
export type WorkspaceId =
  | 'customer'
  | 'workshop'
  | 'supplier'
  | 'fleet'
  | 'insurance'
  | 'towing'
  | 'admin';

/**
 * A role WITHIN a workspace — `autoworkshop 07.txt` part 2 §50.
 *
 * ⚠️ `07.txt` is TWO documents in one file. Part 2 begins at line 1798 and
 * restarts its own numbering at §1; these roles are part 2's §50, not part 1's.
 *
 * §50 names eight workshop roles. Four of them (§46-§49) are given a complete,
 * distinct navigation tree; the other four are given a control summary but no
 * tree, so they fall back to the workspace default until the spec defines one.
 * They are listed here anyway, because a role that exists in the authority
 * table but not in the type is a role nobody can grant.
 *
 * ROLE IS NOT WORKSPACE, and conflating them would fork the workspace tree
 * eight ways for no benefit. All eight live inside the single `workshop`
 * workspace; the workspace decides which app you are in, the role decides which
 * navigation that app shows you.
 */
export type WorkshopRoleId =
  | 'owner'
  | 'manager'
  | 'reception'
  | 'supervisor'
  | 'technician'
  | 'storekeeper'
  | 'quality-control'
  | 'cashier';

/** Any role id. Only `workshop` has role-specific trees today (07 pt2 §46-§49). */
export type RoleId = WorkshopRoleId;

export interface Workspace {
  id: WorkspaceId;
  /** Shown in the top-nav workspace switcher (§5). */
  label: string;
  /** One-line description of who this workspace is for. */
  audience: string;
  /**
   * The workspace-level navigation — `01 (1).txt` §33-§39.
   *
   * This is the DEFAULT tree, used when the viewer's role is unknown or when
   * that role has no tree of its own. It is not a superset of the role trees
   * and must not be treated as one: §46-§49 group and label the same work
   * differently per role ("Repair Requests" for the owner is "Repair Request
   * Inbox" for the manager), so they are distinct trees, not filtered views.
   */
  groups: NavGroup[];
  /**
   * Role-specific navigation — `07.txt` part 2 §46-§49.
   *
   * Present only where the spec actually defines a tree for that role. A role
   * absent from this map is not an error; it falls back to `groups`, which is
   * the honest behaviour for a role the spec has not yet detailed.
   */
  roleGroups?: Partial<Record<RoleId, NavGroup[]>>;
}

/** A single breadcrumb hop. */
export interface Crumb {
  label: string;
  /** Absent on the final crumb — the current page is not a link. */
  href?: string;
}
