import { redirect } from 'next/navigation';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { workspaceAuth } from './workspace-auth';
import { postLogoutOrigin } from './origin';
import { clearWorkspacePreferences } from './workspace-preferences';

/**
 * SIGNING OUT FOR REAL — the wiring T-0005 finding 5 was missing.
 *
 * `revokeRefreshToken()` and `signOutCompletely()` landed in `1d10bd5` and were
 * called by nothing, which meant the finding was documented rather than closed:
 * a refresh token captured before sign-out stayed valid and rotatable for the
 * realm's whole lifespan. This module is the caller, and it is ONE caller shared
 * by all seven apps rather than seven copies of a three-step sequence whose
 * ORDER is the part that matters (§0.3).
 *
 * THE ORDER IS LOAD-BEARING, and each step fails differently if moved:
 *
 *   1. revoke at Keycloak — needs the cookie, so it must happen while the
 *      cookie still exists. Clearing first makes the refresh token permanently
 *      unreachable and therefore permanently valid, which is the exact bug.
 *   2. clear this app's cookie — `signOut({ redirect: false })`. With `redirect`
 *      left at its default Auth.js throws its own redirect and step 3 never runs.
 *   3. send the browser to Keycloak's end-session endpoint — otherwise the SSO
 *      session outlives the local one and the next sign-in completes silently,
 *      so the user appears never to have signed out at all. On the shared
 *      workshop terminal in `07.txt` pt2 §9 that is the whole risk.
 *
 * WHY A SERVER ACTION AND NOT A ROUTE HANDLER. Next verifies the Origin against
 * the Host for server actions, so the CSRF control is the framework's rather
 * than something written here and later trusted without being re-read. A plain
 * `POST /api/sign-out` route has no such check, and sign-out CSRF is real: an
 * attacker cannot steal the session but can repeatedly end it, which on a job
 * card halfway through a repair is a denial of service with data loss attached.
 */

/**
 * Revoke, clear, and end the Keycloak session. Never returns — it redirects.
 *
 * Intended to be wrapped by a per-app server action, because `'use server'`
 * files must be reachable from the app's own module graph and the workspace id
 * is the one genuinely per-app value (the same shape as each app's `auth.ts`).
 */
export async function performSignOut(
  workspaceId: WorkspaceId | string,
  options: {
    /**
     * Where Keycloak returns the browser afterwards, relative to this app.
     *
     * ⚠️ SWITCHING USER IS SIGNING OUT, and that is the whole insight behind this
     * parameter. Keycloak honours a live SSO session, so pressing "Sign in" while
     * somebody else is still signed in returns THEIR identity without a prompt —
     * reported as "i logged in as admin but it show technician". Neither
     * `prompt=login` nor `prompt=select_account` fixes it: measured against this
     * realm, `select_account` returns silently exactly as before, and `login`
     * shows a re-authentication page PRE-FILLED with the previous user and no
     * link to choose another. The only reliable way to become somebody else is to
     * end the SSO session first — which is precisely what this function already
     * does, correctly, in the order that matters.
     *
     * So "switch user" is not a new mechanism. It is this one, landing on the
     * sign-in page instead of the dashboard.
     */
    returnTo?: string;
  } = {},
): Promise<never> {
  const instance = workspaceAuth(workspaceId);
  const base = await postLogoutOrigin();
  // Appended to the ORIGIN rather than accepted as a whole URL: the origin is
  // validated by Keycloak against the client's allow-list, and letting a caller
  // supply the full address would move that decision out of the allow-list.
  const origin = options.returnTo ? `${base}${options.returnTo}` : base;

  // Step 1 — while the cookie still exists. Fails SOFT by design: a user who
  // cannot sign out because Keycloak is unreachable is left more exposed than
  // one whose refresh token outlives the session, so the boolean is recorded
  // and the sequence continues.
  const { keycloakSignOutUrl, refreshTokenRevoked } = await instance.signOutCompletely(origin);

  if (!refreshTokenRevoked) {
    // Deliberately a log and not a thrown error. This is the one outcome that
    // leaves a live credential behind, so it must be visible somewhere — but
    // the user's sign-out is not the place to surface an upstream fault.
    console.warn(
      `[auth] sign-out for workspace "${workspaceId}": refresh token was NOT revoked at Keycloak; ` +
        'the local session is cleared but the token stays valid until the realm expires it',
    );
  }

  // Step 2 — `redirect: false` or Auth.js throws its own redirect and step 3
  // never executes, leaving the Keycloak SSO session alive.
  await instance.signOut({ redirect: false });

  // 🔴 Step 2b — THE SWITCHER COOKIES, WHICH `signOut()` DOES NOT TOUCH.
  //
  // `instance.signOut()` clears Auth.js's OWN session cookie and nothing else.
  // `aw.activeRole` and `aw.activeOrganization` are set by the role and
  // organisation switchers, so they survived every sign-out this app has ever
  // performed — and the next person to sign in on that browser inherited the
  // previous person's selection.
  //
  // Owner, 2026-08-07: signed in as a customer, signed out, signed back in as
  // admin, "the dash board still and menu items still showed that a customer".
  //
  // Before the redirect, because `redirect()` throws and nothing after it runs.
  // See `workspace-preferences.ts` for why this is not a privilege escalation
  // and is still a real fault.
  await clearWorkspacePreferences();

  // Step 3 — throws NEXT_REDIRECT, which is how Next performs a redirect from a
  // server action. Nothing after this line runs.
  redirect(keycloakSignOutUrl);
}
