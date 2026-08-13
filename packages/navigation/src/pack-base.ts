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
