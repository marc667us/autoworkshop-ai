import NextAuth, { type NextAuthResult } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, authSecret, clientIdForWorkspace, keycloakIssuer } from './config';
import {
  isExpired,
  refreshAccessToken,
  revokeRefreshToken,
  RefreshFailedError,
  type KeycloakTokenSet,
} from './tokens';

/**
 * ONE Auth.js configuration, consumed by all seven Next apps.
 *
 * WHY A FACTORY AND NOT SEVEN `auth.ts` FILES. The apps differ by exactly one
 * value — which Keycloak client they authenticate as — and that value is
 * derivable from the workspace id. Seven copies of a token-refresh callback is
 * seven chances for six of them to fall behind the seventh, which is the
 * duplication root CLAUDE.md §0.3 forbids and the same reasoning that put the
 * `next/link` adapter in `@autoworkshop/next-shell` instead of in every app.
 *
 * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
 * the Keycloak tokens live inside it. The browser therefore holds the tokens in
 * a form it cannot read — but that is not the whole story, because Auth.js
 * serves whatever the `session` callback returns as JSON at
 * `/api/auth/session`, to the browser, on request. **Anything placed on the
 * session object is public to the client.** The tokens are deliberately left in
 * the JWT and never copied onto the session; `getAccessToken()` below reads
 * them back server-side.
 *
 * WHAT THIS IS NOT. A session proves who the viewer is. It authorises nothing:
 * the API re-verifies the token's signature, issuer, audience and expiry on
 * every call and resolves the tenant from membership records, and Postgres RLS
 * denies underneath that. CLAUDE.md §5, §8.
 */

/** What the browser is allowed to know about its own session. */
declare module 'next-auth' {
  interface Session {
    /**
     * Set when the refresh token stopped working. The UI uses it to send the
     * viewer back through sign-in rather than rendering a shell whose every
     * API call is about to 401.
     */
    error?: 'RefreshFailed';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    keycloak?: KeycloakTokenSet;
    error?: 'RefreshFailed';
  }
}

export interface WorkspaceAuth {
  /** Mount at `app/api/auth/[...nextauth]/route.ts`. */
  handlers: NextAuthResult['handlers'];
  /** Read the session in a server component, route handler or middleware. */
  auth: NextAuthResult['auth'];
  signIn: NextAuthResult['signIn'];
  signOut: NextAuthResult['signOut'];
  /** The Keycloak client this workspace authenticates as. */
  clientId: string;
  /**
   * The current Keycloak ACCESS TOKEN, server-side only.
   *
   * Returns `null` when there is no session, or when the stored token has
   * expired. **Expired means null, never a refresh** — see the note on
   * `createWorkspaceAuth` about why refreshing here would break the session.
   * Callers must treat `null` as "unauthenticated" and fail closed.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Is there a decryptable session cookie for this workspace?
   *
   * Distinct from `getAccessToken()` in two ways that matter: it does NOT care
   * whether the access token has expired, and it makes no network call.
   *
   * It exists because "can this viewer sign out" and "can this viewer be
   * described" are different questions, and conflating them stranded users
   * (Codex finding M2). The shell's labels come from `GET /api/v1/me`; when the
   * API is down that returns nothing, the viewer resolves to null, and a viewer
   * with a perfectly live Keycloak session was shown a Sign IN button and no way
   * out. An API outage must not remove the ability to end a session — that is
   * exactly when someone is most likely to want to.
   */
  hasSession: () => Promise<boolean>;
  /**
   * End the session for real: revoke the refresh token at Keycloak, then
   * return the URL that ends the Keycloak SSO session.
   *
   * `signOut()` alone deletes this app's cookie and nothing else, so a refresh
   * token captured beforehand stays valid and rotatable. CLAUDE.md §9 requires
   * actual revocation, and on a shared workshop terminal that is the point of
   * signing out at all.
   *
   * Call this BEFORE `signOut()` — it needs the cookie in order to read the
   * refresh token out of it.
   */
  signOutCompletely: (postLogoutRedirect: string) => Promise<{
    keycloakSignOutUrl: string;
    refreshTokenRevoked: boolean;
  }>;
}

/**
 * Build the Auth.js instance for one workspace.
 *
 * TOKEN REFRESH HAS EXACTLY ONE OWNER: the `jwt` callback below. That is not
 * tidiness, it is forced by the realm — `revokeRefreshToken: true` with
 * `refreshTokenMaxReuse: 0` means using a refresh token revokes it, so a second
 * refresher would silently invalidate the session the first one just renewed.
 * The failure surfaces minutes later as a spontaneous sign-out.
 *
 * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
 * the App Router that both runs before a render and may set a cookie. A server
 * component can run the callback but cannot write the result, so an app that
 * skips the middleware will re-refresh on every render and persist none of it.
 * `createAuthMiddleware()` exists so that is one import rather than a thing to
 * remember.
 */
export function createWorkspaceAuth(workspaceId: WorkspaceId | string): WorkspaceAuth {
  const clientId = clientIdForWorkspace(workspaceId);

  const result = NextAuth(() => ({
    // The config is a FUNCTION so the environment is read per request rather
    // than when Next collects this route during `next build` — otherwise the
    // build machine's realm and secret are baked into the deployed bundle.
    secret: authSecret(),
    session: { strategy: 'jwt' as const },
    /**
     * Accept the request's Host header when building callback URLs.
     *
     * WITHOUT THIS EVERY AUTH ENDPOINT RETURNS 500. Auth.js v5 refuses an
     * unrecognised host by default — `UntrustedHost: Host must be trusted` —
     * and it only auto-detects Vercel. Behind Render, a Cloudflare tunnel, a
     * reverse proxy, or plain `next start` on any port but the one it guessed,
     * `/api/auth/signin` and `/api/auth/session` fail while ordinary pages keep
     * returning 200. That asymmetry is why typecheck, lint, the unit suite and
     * a ten-target build were all green with sign-in completely broken.
     *
     * WHY TRUSTING THE HOST IS SAFE HERE, AND WHERE THE REAL CONTROL IS. The
     * host decides which absolute URL is sent to Keycloak as `redirect_uri`, so
     * a forged Host header is an attempt to have the authorization code
     * delivered somewhere else. Keycloak refuses that: each client carries an
     * explicit `redirectUris` allow-list, and a `redirect_uri` outside it is
     * rejected before any code is issued — the browser never leaves the login
     * page. The allow-list in `realm-autoworkshop.json` is therefore the
     * control, and it is a server-side one that no header can influence.
     *
     * KEEP THAT ALLOW-LIST TIGHT. It is currently `http://localhost:<port>/*`
     * plus the production hostnames. Widening it to a wildcard host would
     * remove the only thing making this setting safe.
     */
    trustHost: true,
    // Auth.js's own pages are fine; there is no branded sign-in screen yet and
    // a half-styled one would be worse than the default.
    providers: [
      Keycloak({
        clientId,
        /**
         * The realm. Auth.js discovers every endpoint from
         * `${issuer}/.well-known/openid-configuration`, so without it the
         * provider has no authorization, token or JWKS URL and every auth
         * route fails with `InvalidEndpoints: Provider "keycloak" is missing
         * both 'issuer' and 'authorization' endpoint config`.
         *
         * Ordinary pages keep returning 200 while this is wrong, because they
         * never touch the provider — only `/api/auth/*` and the middleware do.
         * That is the same asymmetry that hid the `trustHost` fault above, and
         * it is why this file is verified by starting the app and calling the
         * endpoints rather than by building it.
         *
         * Resolved per request from KEYCLOAK_URL + KEYCLOAK_REALM — the same
         * two variables, combined the same way, as the API's token validation.
         */
        issuer: keycloakIssuer(),
        // PUBLIC client with PKCE S256 — `realm-autoworkshop.json` defines all
        // seven browser clients that way, and the realm enforces the challenge
        // method through `pkce.code.challenge.method`. There is no secret to
        // send, so the token endpoint must not be given one; `none` says so
        // explicitly rather than letting Auth.js send an empty string, which
        // Keycloak rejects as a malformed client credential.
        //
        // A confidential client would authenticate the token exchange itself
        // and is the stronger option now that the exchange happens on the Next
        // server rather than in the browser. It is deliberately NOT changed
        // here: that is a realm change affecting seven clients plus seven
        // secrets, and it belongs in its own reviewed step, not folded into
        // the change that introduces sessions at all.
        client: { token_endpoint_auth_method: 'none' },
        checks: ['pkce', 'state'],
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        // First call after a successful sign-in: `account` carries the tokens.
        if (account) {
          token.keycloak = {
            accessToken: account.access_token as string,
            refreshToken: account.refresh_token as string | undefined,
            // `expires_at` is epoch SECONDS and may be absent; deriving it from
            // `expires_in` keeps the unit consistent either way.
            expiresAt:
              (account.expires_at as number | undefined) ??
              Math.floor(Date.now() / 1000) + ((account.expires_in as number | undefined) ?? 300),
            idToken: account.id_token as string | undefined,
          };
          delete token.error;
          return token;
        }

        const current = token.keycloak;
        if (!current) return token;
        if (!isExpired(current)) return token;

        if (!current.refreshToken) {
          // Nothing to refresh with. Marking the token rather than clearing it
          // keeps the viewer's identity readable for the sign-in prompt.
          token.error = 'RefreshFailed';
          return token;
        }

        try {
          token.keycloak = await refreshAccessToken(clientId, current.refreshToken);
          delete token.error;
        } catch (err) {
          // Do NOT rethrow: an exception here fails the whole request, taking
          // out pages that need no API call at all. Fail closed instead — the
          // token is marked, `getAccessToken()` still returns null once it
          // expires, and the viewer resolves to no grants.
          if (!(err instanceof RefreshFailedError)) throw err;
          token.error = 'RefreshFailed';
        }
        return token;
      },

      // Everything returned here is served to the browser at
      // `/api/auth/session`. Tokens are absent from this object ON PURPOSE.
      async session({ session, token }) {
        if (token.error) session.error = token.error;
        return session;
      },
    },
  }));

  return {
    handlers: result.handlers,
    auth: result.auth,
    signIn: result.signIn,
    signOut: result.signOut,
    clientId,
    async getAccessToken() {
      // Reads the cookie directly rather than going through `auth()`, because
      // `auth()` returns the SESSION and the session deliberately has no
      // tokens on it.
      const req = { headers: await headers() };

      // IS THERE A SESSION AT ALL? Asked FIRST, and without the secret.
      //
      // `authSecret()` throws when AUTH_SECRET is unset, and this function runs
      // on every render of every page. Demanding the secret up front would make
      // an app with no auth configured fail every route with a 500 — including
      // for a visitor who has no session and needs none, which is every visitor
      // to a signed-out page and every page the Playwright suite loads.
      //
      // Both cookie names are tried, because the name is decided by the URL
      // scheme and not by NODE_ENV — see `readSessionToken`.
      const token = await readSessionToken(req);

      const keycloak = token?.keycloak;
      if (!keycloak) return null;
      // Expired is not refreshed here — see the header note. A caller that
      // receives null must behave as unauthenticated.
      if (isExpired(keycloak, Math.floor(Date.now() / 1000), 0)) return null;
      return keycloak.accessToken;
    },

    async hasSession() {
      // Deliberately does NOT check expiry. An expired access token still has a
      // refresh token to revoke and a Keycloak SSO session to end, so sign-out
      // is still the right offer — and still does real work.
      const token = await readSessionToken({ headers: await headers() });
      return token?.keycloak !== undefined;
    },

    async signOutCompletely(postLogoutRedirect: string) {
      // Reads the cookie the same way getAccessToken does, and for the same
      // reason: the session object deliberately carries no tokens, so the JWT
      // is the only place the refresh token exists.
      const req = { headers: await headers() };

      let refreshTokenRevoked = false;
      let idToken: string | undefined;

      // Same both-names read as `getAccessToken`. Getting this wrong here is
      // WORSE than getting it wrong there: a miss means the refresh token is
      // never found, so sign-out silently degrades to clearing a cookie —
      // exactly the defect this method exists to fix.
      const token = await readSessionToken(req);
      const keycloak = token?.keycloak;
      idToken = keycloak?.idToken;
      if (keycloak?.refreshToken) {
        refreshTokenRevoked = await revokeRefreshToken(clientId, keycloak.refreshToken);
      }

      // Returned rather than thrown on failure: a user who cannot sign out
      // because an upstream call failed is left MORE exposed than one whose
      // token outlives the session. The caller audits the difference.
      return {
        keycloakSignOutUrl: keycloakSignOutUrl(idToken, postLogoutRedirect),
        refreshTokenRevoked,
      };
    },
  };
}

/**
 * Is this request being served over https?
 *
 * The same question Auth.js asks to decide the session cookie's name, answered
 * the same way: `AUTH_URL` when it is set (it is, per service), otherwise the
 * proxy's `x-forwarded-proto`. Nothing here consults `NODE_ENV` — see below.
 */
function isSecureRequest(req: { headers: Headers }): boolean {
  const configured = process.env['AUTH_URL'];
  if (configured) return configured.startsWith('https://');
  // Render and every reverse proxy set this. It may be a comma-separated list
  // when several proxies are chained; the FIRST entry is the client's scheme.
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return proto === 'https';
}

/**
 * Read and decrypt the session JWT under the cookie name this request's SCHEME
 * implies — falling back to the other name ONLY on plain http.
 *
 * WHY THE SCHEME AND NOT `NODE_ENV`. Auth.js names the cookie
 * `authjs.session-token` over http and `__Secure-authjs.session-token` over
 * https. The previous implementation derived it from `NODE_ENV === 'production'`
 * instead, and those two agree only by coincidence — on the deployed site, where
 * production and https happen to coincide.
 *
 * THEY DISAGREE ON EVERY PRODUCTION BUILD SERVED OVER HTTP, which is what
 * `next start` is locally. Measured: a genuine Keycloak login set
 * `authjs.session-token.0/.1`, `/api/auth/session` reported the signed-in user,
 * and `getAccessToken()` returned null the whole time because it was looking for
 * `__Secure-…`. The shell rendered "Not signed in" to a signed-in user,
 * `viewerGrants()` returned none, and nothing logged an error — a check reading
 * correct while the mechanism is inert.
 *
 * ⚠️ WHY HTTPS NEVER FALLS BACK — Codex finding M1, and it is a real attack, not
 * a tidiness point. An earlier revision of this function tried the NON-secure
 * name first and accepted whichever decrypted. The `__Secure-` prefix exists
 * precisely because a plain-http origin (a sibling subdomain, a hostile network
 * on first contact) can write a cookie that an https origin will then send. So
 * on https, preferring — or even falling back to — the unprefixed name lets an
 * attacker plant their OWN valid session under `authjs.session-token` and have
 * the victim's browser adopt it: session fixation, and the victim never sees a
 * login screen. On https the prefixed cookie is therefore the ONLY one honoured.
 *
 * The fallback survives on http alone, where no `__Secure-` cookie can exist and
 * the prefix guarantees nothing anyway. That keeps local development working
 * without weakening any deployment.
 *
 * Chunked cookies (`.0`, `.1`) are reassembled by `getToken` itself — verified,
 * not assumed. They are not exotic here: a Keycloak access + refresh + id token
 * set reliably exceeds the 4096-byte cookie limit, so in practice the session is
 * ALWAYS chunked.
 */
async function readSessionToken(req: { headers: Headers }) {
  const secure = isSecureRequest(req);
  const names = secure ? [true] : [false, true];

  // Ask without the secret first — see the note in `getAccessToken`. `getToken`
  // checks for the cookie before it checks for a secret, so a visitor with no
  // session never forces `AUTH_SECRET` to be present.
  const present = await Promise.all(
    names.map((secureCookie) => getToken({ req, secret: '', secureCookie, raw: true })),
  );
  if (!present.some(Boolean)) return null;

  const secret = authSecret();
  for (const secureCookie of names) {
    const token = await getToken({ req, secret, secureCookie });
    if (token) return token;
  }
  return null;
}

/**
 * The one instance per workspace.
 *
 * `createWorkspaceAuth` builds a NextAuth instance; calling it per request would
 * build a new provider, a new cookie configuration and a new set of callbacks
 * on every render. More importantly the app's route handler and the shell's
 * viewer resolution MUST agree on the cookie name and secret, and the surest
 * way for them to agree is to be the same object.
 */
const instances = new Map<string, WorkspaceAuth>();

export function workspaceAuth(workspaceId: WorkspaceId | string): WorkspaceAuth {
  let existing = instances.get(workspaceId);
  if (!existing) {
    existing = createWorkspaceAuth(workspaceId);
    instances.set(workspaceId, existing);
  }
  return existing;
}

/**
 * The URL that ends the KEYCLOAK session, not just the local cookie.
 *
 * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
 * session outlives it, so the next sign-in completes silently and the viewer
 * appears never to have been signed out — which on a shared workshop terminal
 * is the whole point of signing out.
 *
 * `id_token_hint` is what lets Keycloak end the session without an interstitial
 * "do you want to log out?" confirmation.
 */
export function keycloakSignOutUrl(idToken: string | undefined, postLogoutRedirect: string): string {
  const url = new URL(`${keycloakIssuer()}/protocol/openid-connect/logout`);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
  return url.toString();
}

/** Re-exported so callers need one import to reach the API. */
export { apiBaseUrl };
