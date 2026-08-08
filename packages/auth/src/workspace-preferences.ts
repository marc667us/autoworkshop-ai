import { cookies } from 'next/headers';

/**
 * THE NON-CREDENTIAL COOKIES THAT MUST STILL DIE WITH THE SESSION.
 *
 * ── 🔴 THE DEFECT THIS EXISTS TO CLOSE ────────────────────────────────────
 *
 * Owner, 2026-08-07: *"i logged in as a customer from landing page to send a
 * request, i logged out and tried loging as admin but the dash board still and
 * menu items still showed that a customer"*.
 *
 * `performSignOut` revoked the refresh token, called `signOut()` — which clears
 * **Auth.js's session cookie and nothing else** — and ended the Keycloak SSO
 * session. `aw.activeRole` and `aw.activeOrganization` are set by the role and
 * organisation switchers, are NOT Auth.js cookies, and were therefore left
 * behind on the browser. The next person to sign in on that host inherited the
 * previous person's selection.
 *
 * ⚠️ IT IS NOT A PRIVILEGE ESCALATION, AND SAYING SO PRECISELY MATTERS. The API
 * treats `x-role-name` as a REQUEST: `resolveTenantContext` selects among
 * memberships already proved from the validated token subject and refuses a
 * role the caller does not hold. So a stale value cannot grant anything.
 *
 * 🔴 BUT IT IS A REAL FAULT WHENEVER THE NEW USER GENUINELY HOLDS THAT ROLE —
 * and `customer` is a real membership role inside a workshop's own
 * organisation, which is the fact behind almost every access defect recorded in
 * this repository. An owner who is also a customer signs in and is silently
 * still acting as a customer: the dashboard is wrong, the menu is wrong, and
 * nothing anywhere says why. A silent downgrade is the failure mode the role
 * cookie's own comment says must be avoided.
 *
 * 🔴 AND THE TERMINAL IS SHARED. `switchUserAction` already exists precisely
 * because `07.txt` pt2 §9 describes a shared workshop terminal, and its comment
 * warns that "the menu quietly being the wrong one is the only evidence". That
 * is exactly what happened here — one layer below the layer that was fixed.
 *
 * ── WHY THESE LIVE IN `auth` AND NOT IN `next-shell` ──────────────────────
 *
 * `next-shell` depends on `@autoworkshop/auth`, so the reverse import would be
 * a cycle. More importantly the LIFECYCLE belongs here: these cookies are
 * scoped to a signed-in session, so the code that ends a session is the code
 * that must end them. `next-shell` re-exports the names, so every existing
 * import path keeps working and there is still exactly ONE definition.
 */

/** Which role the viewer chose to act as. Set by the role switcher. */
export const ACTIVE_ROLE_COOKIE = 'aw.activeRole';

/** Which organisation the viewer chose. Set by the organisation switcher. */
export const ACTIVE_ORG_COOKIE = 'aw.activeOrganization';

/**
 * Every browser-visible preference that is meaningful only inside a session.
 *
 * ⚠️ ADD TO THIS LIST WHEN YOU ADD A SWITCHER. A new preference cookie that is
 * not named here silently reacquires the exact bug above, and it will present
 * as "the menu is wrong after signing in" — which reads like a navigation fault
 * and sends the next reader to the wrong file entirely.
 */
export const WORKSPACE_PREFERENCE_COOKIES: readonly string[] = [
  ACTIVE_ROLE_COOKIE,
  ACTIVE_ORG_COOKIE,
];

/**
 * Forget the viewer's switcher selections.
 *
 * ⚠️ CALLED BEFORE THE REDIRECT, NEVER AFTER. `redirect()` throws
 * `NEXT_REDIRECT`, so anything sequenced after it never runs — the same trap
 * that made step 3 of the sign-out sequence load-bearing about ordering.
 *
 * ⚠️ FAILS SOFT, deliberately, for the same reason the token revocation does: a
 * user who cannot complete sign-out because a cookie store misbehaved is left
 * MORE exposed, not less. A stale preference is a wrong menu; a session that
 * refused to end is a live credential.
 */
export async function clearWorkspacePreferences(): Promise<void> {
  try {
    const store = await cookies();
    for (const name of WORKSPACE_PREFERENCE_COOKIES) {
      // 🔴 `path: '/'` IS NAMED, NOT LEFT TO A DEFAULT.
      //
      // A cookie is identified by (name, domain, path), and a delete whose path
      // does not match the one it was SET with expires a different cookie and
      // silently changes nothing. Both of these are written with an explicit
      // `path: '/'` (`set-role-action.ts`, `set-organization-action.ts`), so
      // that is stated here rather than relying on the framework's default
      // happening to agree. A no-op delete would leave this whole fix INERT
      // while every test still passed — the "config reads correct while the
      // mechanism is inert" failure recorded five times in this repository.
      //
      // No `domain` is set when they are written either, so none is set here:
      // adding one would make the pair stop matching in the other direction.
      store.delete({ name, path: '/' });
    }
  } catch (error) {
    console.warn(
      '[auth] could not clear workspace preference cookies during sign-out; ' +
        'the next sign-in on this browser may open with the previous role selected: ' +
        String(error),
    );
  }
}
