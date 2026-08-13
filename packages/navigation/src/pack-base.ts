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
