import type { WorkspaceId } from './types';

/**
 * WHERE A PACK'S ROUTES LIVE INSIDE THE ONE ARTIFACT (ADR-021).
 *
 * Until 2026-08-13 each of the seven packs was its own deployed application on
 * its own hostname, so every pack could own the path `/home/dashboard` and
 * `workspaces.ts` could transcribe the spec's routes literally as
 * `/<group>/<item>`. One artifact means one path namespace, and seven packs
 * cannot all own `/home/dashboard`. Each therefore mounts under its own prefix.
 *
 * 🔴 THE TRANSCRIPTION IN `workspaces.ts` IS DELIBERATELY LEFT ALONE. Its
 * header says the tree is *transcribed, not designed* — every href comes
 * straight from `01 (1).txt` §33-§39 — and rewriting 405 literals to carry a
 * deployment detail would destroy the property that makes that file checkable
 * against the spec. The prefix is applied at RESOLUTION time instead, by the
 * three functions that produce or match hrefs.
 *
 * ⚠️ THE SYMMETRY IS THE WHOLE POINT, AND GETTING IT WRONG IS SILENT. Nav hrefs
 * are what a link points at; `pathname` is what the browser reports. If one
 * side gains the prefix and the other does not, `requireNavRoute` finds no
 * match for any route and calls `notFound()` — so every gated page in the
 * product 404s while typecheck, lint and the build all stay green. That is why
 * the base is DERIVED from the workspace id inside those functions rather than
 * passed in as an optional argument: an argument can be forgotten at one call
 * site, and this repository has already paid for "two literals in two files
 * cannot be type-checked into agreement" once.
 */

/**
 * The seven mount points, as a value rather than a type.
 *
 * Kept here rather than derived from `workspaces` to avoid a circular import —
 * `workspaces.ts` is the largest module in the package and this one is imported
 * by `resolve.ts`, which it in turn imports.
 */
const PACK_IDS = [
  'customer', 'workshop', 'supplier', 'fleet', 'insurance', 'towing', 'admin',
] as const;

/** `customer` → `/customer`. The prefix a pack's routes are mounted under. */
export function packBase(workspaceId: WorkspaceId | string): string {
  return `/${workspaceId}`;
}

/**
 * Add the pack prefix to a route that does not already carry it.
 *
 * IDEMPOTENT ON PURPOSE. Callers reach this from three directions — a page
 * passing its own literal path, a catch-all assembling one from `params.slug`,
 * and the browser's `pathname`, which already has the prefix. Making it safe to
 * apply twice removes the need for every caller to know which of the three it
 * is holding.
 */
export function withPackBase(workspaceId: WorkspaceId | string, path: string): string {
  const base = packBase(workspaceId);
  if (path === base || path.startsWith(base + '/')) return path;

  // ⚠️ THE ROOT PATH IS THE ONE THAT BITES. A naive concatenation turns `/` into
  // `/customer/` — with a trailing slash that matches no navigation href, so the
  // route resolves to nothing and the page renders its not-found branch. It is
  // reachable: `renderModulePage` builds its path from `params.slug`, and an
  // empty slug produces exactly `/`. Measured, not imagined.
  if (path === '' || path === '/') return base;

  // 🔴 A PATH CARRYING ANOTHER PACK'S PREFIX IS A BUG, AND WITHOUT THIS IT IS A
  // SILENT ONE. Codex finding 2: `withPackBase('customer', '/workshop/home/
  // dashboard')` produced `/customer/workshop/home/dashboard` — a path no pack
  // serves and no href advertises, so `requireNavRoute` 404s with nothing in any
  // log to say why. Returning it unchanged still 404s (customer's tree does not
  // advertise a workshop route) but it 404s the ORIGINAL path, which is the one
  // a person can search for.
  //
  // Deliberately NOT a throw. This runs inside server components on every gated
  // page; turning a mis-typed link into a 500 across the artifact would be a far
  // worse trade than a legible 404.
  if (PACK_IDS.some((id) => path === `/${id}` || path.startsWith(`/${id}/`))) {
    return path;
  }

  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Remove the pack prefix, if present.
 *
 * Needed by anything that must compare a real URL against the spec's own route
 * strings — the navigation audits do exactly that, and they should keep
 * checking the transcription rather than the mounting.
 */
export function withoutPackBase(workspaceId: WorkspaceId | string, path: string): string {
  const base = packBase(workspaceId);
  if (path === base) return '/';
  return path.startsWith(base + '/') ? path.slice(base.length) : path;
}

/**
 * WHICH PACK SERVES AN UNMOUNTED, PRE-ADR-021 ROUTE.
 *
 * 🔴 WRITTEN BECAUSE THE CONSOLIDATION BROKE EVERY EXISTING LINK AND I DID NOT
 * NOTICE. Before 2026-08-13 the apex served `workshop-web`, so `/home/dashboard`
 * and `/customer-reception/customers` were real URLs — in bookmarks, in emails,
 * in muscle memory. Mounting the packs moved all of them and left nothing
 * behind, so every one of those now 404s. Measured on production, and reported
 * by the owner as "some page does not exist" before any test noticed: the live
 * suite passed 70/0/1 throughout, because it only ever asks for paths the NEW
 * topology advertises.
 *
 * This resolves an old path against the navigation model, which already knows
 * every route every pack serves. It is data we have, not a list to maintain.
 *
 * Returns the pack id when exactly ONE pack advertises the route, and null when
 * none or several do — `/home/dashboard` exists in six of the seven trees, so
 * guessing between them would send people somewhere they may not belong. The
 * caller sends those to `/`, which resolves the viewer and dispatches properly.
 */
export function packServingLegacyPath(
  path: string,
  workspaces: ReadonlyArray<{ id: string; groups: ReadonlyArray<{ items: ReadonlyArray<{ href: string }> }> }>,
): string | null {
  const matches = workspaces
    .filter((w) => w.groups.some((g) => g.items.some((i) => i.href === path)))
    .map((w) => w.id);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * WHERE A WORKSPACE'S FRONT DOOR SHOULD SEND SOMEBODY — read from the
 * navigation model rather than assumed.
 *
 * ── 🔴 THE DEFECT THIS FIXES, AND WHY NOTHING COULD SEE IT ─────────────────
 *
 * `app/page.tsx` dispatched a signed-in viewer with
 *
 *     redirect(`/${homeWorkspaceFor(activeRole)}/home/dashboard`)
 *
 * and SIX of the seven packs do have a `home` group whose first item is
 * `dashboard`. **Towing does not.** `02.txt` §52 gives it an `operations` group
 * instead, so its dashboard lives at `/towing/operations/dashboard` — which
 * `app/towing/page.tsx` already redirects to correctly, and which the front
 * door did not know.
 *
 * So `/towing/home/dashboard` is not in the towing tree, `renderModulePage`
 * ends `if (!group || !item) notFound()`, and a `towing_operator` signing in at
 * the front door would have been **404'd on their own dashboard**.
 *
 * ⚠️ IT WAS INVISIBLE BECAUSE THE ROLE COULD NOT EXIST. Nothing in the product
 * could write a `towing_operator` membership until migration 080, so the
 * dispatch line had never once been executed for this role — while migration
 * 074 built towing end to end and shipped all ten of its screens. Opening the
 * door is what exposed it. That is this repository's recurring shape: a defect
 * behind an unreachable state stays green for ever, and the fix that makes the
 * state reachable is what finds it.
 *
 * ⚠️ DERIVED, NOT LISTED. A second map of "which pack lands where" is the
 * "two literals in two files cannot be type-checked into agreement" trap that
 * has already cost this repo a sign-out outage and a job-card link class. The
 * navigation model already states every route every pack serves; this reads it.
 * A future workspace whose first group is not `home` is correct automatically.
 *
 * Returns `null` when the workspace is unknown or has no items at all, so the
 * caller decides what to do rather than being handed a plausible-looking path
 * that 404s.
 */
export function landingPathFor(
  workspaceId: WorkspaceId | string,
  workspaces: ReadonlyArray<{
    id: string;
    groups: ReadonlyArray<{
      permission?: string;
      items: ReadonlyArray<{ href: string; permission?: string }>;
    }>;
  }>,
  /**
   * 🔴 THE VIEWER'S GRANTS, AND OMITTING THEM IS NOT A NEUTRAL DEFAULT.
   *
   * Codex asked whether the first item of the first group is ever
   * PERMISSION-GATED, and I had not checked. It is: `adminGroups` opens with
   *
   *     group('home', 'Home', 'home', [['operations-dashboard', …]], 'platform.admin')
   *
   * — the whole group is behind `platform.admin`. `renderModulePage` resolves
   * against `visibleGroups(workspace, grants)`, the FILTERED tree, so a viewer
   * who lacks that permission is 404'd on a path the unfiltered tree happily
   * returned. Since migration 078, `platform.admin` comes from a grant RECORD
   * and not from the role name, so a `platform_administrator` whose grant has
   * been revoked is exactly that viewer — and revocation is a case the product
   * is supposed to handle well, not dump on a 404.
   *
   * Passing grants makes this function answer the same question the router
   * will. `undefined` means "not known", and the ungated-only tree is then the
   * safe reading: it can only ever return a route ANY member of the workspace
   * may open.
   *
   * ⚠️ THIS IS NOT A SECURITY CONTROL, like everything else in this package. It
   * decides where to SEND somebody; the API and RLS decide what they may see.
   */
  grants?: readonly string[],
): string | null {
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return null;

  const held = new Set(grants ?? []);
  const maySee = (permission?: string) => permission === undefined || held.has(permission);
  // The FIRST item of the FIRST group — `01 (1).txt` §18 makes the dashboard a
  // workspace's landing page, and in every transcribed tree that dashboard is
  // exactly this position. Reading the position rather than searching for the
  // word "dashboard" keeps it true of a tree that names its landing screen
  // something else.
  for (const group of workspace.groups) {
    if (!maySee(group.permission)) continue;
    // The first item THIS VIEWER may open, not the first item that exists. A
    // group can be ungated while its opening item is not.
    const first = group.items.find((i) => maySee(i.permission));
    // 🔴 MOUNTED BEFORE IT IS RETURNED. `item()` builds every href as
    // `/${groupId}/${id}` — UNMOUNTED — and the pack base is applied later by
    // `withPackBase`. A caller passing the raw value to `redirect()` would send
    // a towing operator to `/operations/dashboard` at the ARTIFACT root, where
    // the legacy redirector would then resolve it and, because towing is the
    // only pack advertising that path, land them correctly by accident. That
    // accident is not worth depending on, and it breaks the moment a second
    // pack adds an `operations` group. Mounting here means the value is a real
    // URL, and `landing-path.test.ts` asserts every one of them resolves in its
    // own tree.
    if (first) return withPackBase(workspaceId, first.href);
  }
  return null;
}
