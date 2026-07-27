import type { PermissionKey, WorkspaceId } from '@autoworkshop/navigation';

/**
 * The viewer's permission grants — THE single source, for both the navigation
 * and the route resolver.
 *
 * WHY THIS EXISTS AT ALL. The grants were briefly supplied in two places: each
 * app's `layout.tsx` passed a literal array to the shell, while the catch-all
 * route resolved with none. The two disagreed, so the side nav advertised
 * modules that answered 404 when clicked. Two sources of truth for "what may
 * this user see" is a bug generator, and it produced a bug immediately.
 *
 * Every caller now reads from here, so the nav and the router cannot disagree
 * by construction.
 *
 * ⚠️ THESE ARE DEMO GRANTS, AND THEY ARE NOT A SECURITY CONTROL.
 * Until Phase 2 wires the Keycloak session (T-0005, tenant-context resolution),
 * there is no authenticated viewer to ask, so this returns a fixed set that
 * makes the permission-gated navigation reviewable. It is client-visible,
 * trivially forged, and protects nothing.
 *
 * What it does control is *visibility*: which doors the UI admits exist. Real
 * enforcement is the API's tenant guard plus Postgres RLS, which deny
 * independently of anything decided here. CLAUDE.md §8: "Hidden is not secure."
 *
 * WHEN PHASE 2 LANDS, this is the one function to replace. Its body becomes a
 * read of the validated Keycloak claims and the viewer's membership records —
 * never a client-supplied value, per `1.txt` §9 ("the gateway must never trust
 * a tenant identifier supplied only by the client"). Every call site is already
 * correct and needs no change.
 */

const DEMO_GRANTS: Record<string, readonly PermissionKey[]> = {
  // The platform-admin workspace additionally exercises the admin-only groups.
  admin: ['platform.admin', 'organization.admin', 'finance.read'],
};

/**
 * The default demo viewer deliberately does NOT hold `finance.read`.
 *
 * It used to. The nav model only ever gates on two keys — `finance.read` (9
 * items) and `organization.admin` (1) — and this default granted both, so for
 * every non-admin workspace *every* module in the tree was visible. The
 * consequence was not cosmetic: `gatedHref()` in the journey suite could not
 * find a single gated module in any of the seven workspaces, so
 * "a gated URL 404s when typed directly" — the regression test for defect 1,
 * the permission-bypass defect, and the only security-relevant assertion in the
 * suite — silently `test.skip`ped in all seven. The suite reported green while
 * proving nothing at all about permission gating.
 *
 * Withholding one grant makes the gating real: finance modules are now genuinely
 * denied to the default viewer, the catch-all must fail closed for them, and the
 * test that checks it actually executes. The admin workspace keeps `finance.read`
 * because a platform administrator legitimately sees finance — and
 * `at least one workspace must exercise permission gating` in the journey suite
 * now fails if this ever drifts back to granting everything.
 */
const DEMO_DEFAULT: readonly PermissionKey[] = ['organization.admin'];

export function viewerGrants(workspaceId: WorkspaceId | string): readonly PermissionKey[] {
  return DEMO_GRANTS[workspaceId] ?? DEMO_DEFAULT;
}
