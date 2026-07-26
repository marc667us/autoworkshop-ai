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

export interface Workspace {
  id: WorkspaceId;
  /** Shown in the top-nav workspace switcher (§5). */
  label: string;
  /** One-line description of who this workspace is for. */
  audience: string;
  groups: NavGroup[];
}

/** A single breadcrumb hop. */
export interface Crumb {
  label: string;
  /** Absent on the final crumb — the current page is not a link. */
  href?: string;
}
