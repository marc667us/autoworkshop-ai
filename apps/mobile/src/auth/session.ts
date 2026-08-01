import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { CLIENT_ID, DISCOVERY, REDIRECT_PATH, SCOPES } from './config';
import { clearSession, loadSession, saveSession, type StoredSession } from './token-store';

/**
 * The mobile sign-in, refresh and sign-out flows.
 *
 * ⚠️ THE AUTHORIZATION CODE FLOW WITH PKCE, IN THE SYSTEM BROWSER. Not a
 * password form in the app, and not a WebView. Both alternatives are worse in
 * ways that are easy to miss:
 *
 *   * A password form inside the app means the app HANDLES the user's password.
 *     Every future compromise of the binary becomes a credential compromise,
 *     and it forecloses MFA, social login and any policy Keycloak enforces at
 *     the login screen. The realm disables `directAccessGrants` on every client
 *     precisely so this cannot be built by accident.
 *   * A WebView is controlled by the app, so the user cannot see the address
 *     bar and has no way to tell a real Keycloak login from a drawn copy of
 *     one. RFC 8252 §8.12 rejects embedded user-agents for this reason.
 *
 * `expo-auth-session` opens the SYSTEM browser, which shows the real URL and
 * carries the device's existing Keycloak session.
 */

// Required on Android so the browser result is delivered back to the app rather
// than being dropped when the activity resumes.
WebBrowser.maybeCompleteAuthSession();

export const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'autoworkshop',
  path: REDIRECT_PATH,
});

/**
 * Sixty seconds of headroom before the access token's stated expiry.
 *
 * Without it, a token that is valid when the request is BUILT can be expired by
 * the time it is received — a race that shows up as intermittent 401s under a
 * slow connection, which is exactly the connection a workshop has.
 */
const EXPIRY_SKEW_MS = 60_000;

export interface SignInResult {
  ok: boolean;
  /** A message safe to show a user. Never contains a token. */
  message?: string;
}

/**
 * Exchange an authorization code for tokens and store them.
 *
 * ⚠️ `usePKCE` IS NOT PASSED HERE BECAUSE THE REQUEST OBJECT CARRIES IT. The
 * caller builds an `AuthSession.AuthRequest` with `usePKCE: true` (the default
 * in expo-auth-session v6, stated explicitly at the call site anyway), and the
 * verifier travels with it. Passing a code without its verifier produces a
 * Keycloak error rather than a silent downgrade, because the realm requires
 * S256 — the failure is loud, which is the point.
 */
export async function exchangeCode(
  request: AuthSession.AuthRequest,
  code: string,
): Promise<SignInResult> {
  try {
    const token = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code,
        redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
      },
      DISCOVERY,
    );

    await saveSession(toStored(token));
    return { ok: true };
  } catch (err) {
    // The message is deliberately generic. Keycloak's error bodies can echo
    // request parameters, and a token must never reach a UI string or a log.
    return { ok: false, message: describe(err) };
  }
}

function toStored(token: AuthSession.TokenResponse): StoredSession {
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? null,
    expiresAt: Date.now() + (token.expiresIn ?? 300) * 1000,
  };
}

/**
 * The access token to send with an API call, refreshed if it is about to
 * expire. Returns null when the user must sign in again.
 */
export async function currentAccessToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;

  if (Date.now() < session.expiresAt - EXPIRY_SKEW_MS) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    // Expired with nothing to refresh from. Clearing here means the app shows
    // sign-in rather than sending a token the API will reject.
    await clearSession();
    return null;
  }

  // 🔴 SERIALISED, AND THIS IS NOT DEFENSIVE PROGRAMMING — IT IS REQUIRED BY
  // THIS REALM'S CONFIGURATION. Found by Codex, then confirmed against
  // `realm-autoworkshop.json`: `revokeRefreshToken: true` with
  // `refreshTokenMaxReuse: 0`, so refresh tokens ROTATE and the old one is
  // invalid the instant it is used ONCE.
  //
  // A screen that fires two API calls at the same moment — which the job-card
  // list and any future dashboard do routinely — would run two refreshes with
  // the same stored token. The first rotates it; the second is rejected as a
  // REUSE, and the `catch` below would then clear a session that had just been
  // successfully renewed. The user is signed out at random, and only when the
  // token happens to expire mid-screen, which is close to undebuggable.
  //
  // Sharing one in-flight promise means concurrent callers await the SAME
  // refresh and all receive the rotated token.
  if (!inFlightRefresh) {
    inFlightRefresh = doRefresh(session.refreshToken).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/** The single in-flight refresh, shared by every concurrent caller. */
let inFlightRefresh: Promise<string | null> | null = null;

async function doRefresh(refreshToken: string): Promise<string | null> {
  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId: CLIENT_ID, refreshToken },
      DISCOVERY,
    );
    await saveSession(toStored(refreshed));
    return refreshed.accessToken;
  } catch {
    // ⚠️ RE-READ BEFORE CLEARING. The stored session may have been replaced
    // while this refresh was in flight — by a sign-in, or by a rotation this
    // call raced. Clearing unconditionally would discard a VALID credential
    // because a stale one failed. Only clear if what is stored is still the
    // token that just failed.
    const current = await loadSession();
    if (current && current.refreshToken !== refreshToken) {
      return current.accessToken;
    }
    // The refresh token really is revoked, expired or rejected. Keeping it
    // produces an app that retries a doomed refresh on every screen instead of
    // asking the user to sign in.
    await clearSession();
    return null;
  }
}

/**
 * Sign out properly.
 *
 * 🔴 THREE STEPS, AND SKIPPING ANY ONE OF THEM LEAVES THE USER SIGNED IN
 * SOMEWHERE. CLAUDE.md §9 makes this explicit for the web apps and it is more
 * acute on a shared workshop tablet:
 *
 *   1. REVOKE the refresh token at Keycloak. Without this the token stays valid
 *      for its full lifetime and anyone who extracted it keeps minting access
 *      tokens after the user believes they have signed out.
 *   2. END THE KEYCLOAK SESSION in the system browser. Without this the SSO
 *      cookie survives, and the next "Sign in" completes with no password
 *      prompt — the next person to pick up the device is signed in as the
 *      previous one.
 *   3. CLEAR local storage. Necessary, and on its own the weakest of the three,
 *      which is why it is done last and never alone.
 *
 * Steps 1 and 2 are attempted but not allowed to BLOCK the sign-out: a
 * technician with no signal must still be able to clear the device. The local
 * clear therefore runs in `finally`.
 */
export interface SignOutResult {
  /** Local credentials cleared. Always true — the `finally` guarantees it. */
  deviceCleared: boolean;
  /** The refresh token was revoked AT KEYCLOAK. False means it stays valid. */
  serverRevoked: boolean;
  /** The browser SSO session was ended. False means the next sign-in is silent. */
  ssoEnded: boolean;
}

export async function signOut(): Promise<SignOutResult> {
  // ⚠️ THE OUTCOME IS REPORTED, NOT ASSUMED. Raised by Codex: this used to
  // return `void`, so a sign-out that failed to reach Keycloak was
  // indistinguishable from one that succeeded, and the app said "signed out"
  // while the refresh token stayed valid for its full lifetime and the browser
  // SSO cookie survived — meaning the next person to pick up the device signs
  // in with no password prompt.
  //
  // The local clear still runs unconditionally in `finally`, because a
  // technician with no signal must always be able to clear the device. What
  // changes is that the caller can now TELL the difference and say so.
  const result: SignOutResult = { deviceCleared: false, serverRevoked: false, ssoEnded: false };
  const session = await loadSession();
  try {
    if (session?.refreshToken) {
      await AuthSession.revokeAsync(
        {
          clientId: CLIENT_ID,
          token: session.refreshToken,
          // The library's ENUM, not the raw string. `'refresh_token'` is the wire
          // value and reads identically, but the typed member is what survives
          // a library rename — and revoking with the wrong hint silently
          // revokes nothing on some providers.
          tokenTypeHint: AuthSession.TokenTypeHint.RefreshToken,
        },
        DISCOVERY,
      )
        .then(() => {
          result.serverRevoked = true;
        })
        .catch(() => undefined);
    } else {
      // Nothing to revoke is not a failure to revoke.
      result.serverRevoked = true;
    }
    if (DISCOVERY.endSessionEndpoint) {
      // Opened rather than fetched: the SSO cookie belongs to the BROWSER, so a
      // background request from the app would not clear it.
      await WebBrowser.openAuthSessionAsync(
        `${DISCOVERY.endSessionEndpoint}?client_id=${encodeURIComponent(CLIENT_ID)}` +
          `&post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`,
        redirectUri,
      )
        .then((r) => {
          // `dismiss` means the user closed the browser before Keycloak
          // finished ending the session, so the cookie may survive. Only
          // `success` proves it was ended.
          result.ssoEnded = r.type === 'success';
        })
        .catch(() => undefined);
    }
  } finally {
    // ⚠️ ALSO DROPS ANY IN-FLIGHT REFRESH. Without this, a refresh that started
    // before sign-out could resolve afterwards and `saveSession` a fresh
    // credential onto a device the user believes they have cleared.
    inFlightRefresh = null;
    await clearSession();
    result.deviceCleared = true;
  }
  return result;
}

/** A user-facing description that never contains a token or a URL parameter. */
function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/network|fetch|timeout/i.test(text)) {
    return 'Could not reach the sign-in service. Check the connection and try again.';
  }
  return 'Sign-in did not complete. Please try again.';
}
