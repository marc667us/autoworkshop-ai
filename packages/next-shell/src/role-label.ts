/**
 * Turn `workshop_supervisor` into `Workshop supervisor`.
 *
 * ⚠️ IN ITS OWN MODULE, WITH NO `'use client'`, AND THAT IS THE ENTIRE REASON
 * THIS FILE EXISTS. It previously sat in `RoleSwitcher.tsx`, which IS a client
 * module — so calling it from a SERVER component (the app layout, building the
 * option list) failed at runtime with:
 *
 *   Error: Attempted to call roleLabel() from the server but roleLabel is on
 *   the client. It's not possible to invoke a client function from the server.
 *
 * ⚠️ TYPECHECK, LINT AND `next build` ALL PASSED ON THE BROKEN VERSION. The
 * server/client boundary is enforced at RUNTIME, so every gate was green while
 * every page in the app returned "a server-side exception occurred". The only
 * thing that catches this is loading the page — which is why `/verify` exists
 * and why a clean build is not evidence a screen works.
 *
 * A pure string function has no business being in a client module anyway. Kept
 * derived rather than a lookup table: a table renders a NEW role as a blank
 * option, and a role added to `identity.memberships` must never appear in the
 * switcher as an empty choice.
 */
export function roleLabel(roleName: string): string {
  const words = roleName.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
