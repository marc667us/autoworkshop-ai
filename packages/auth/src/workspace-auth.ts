import NextAuth, { type NextAuthResult } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, authSecret, clientIdForWorkspace, keycloakIssuer } from './config';
import { keycloakSignOutUrl } from './logout-url';
import { clearWorkspacePreferences } from './workspace-preferences';
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

/**
 * The session cookie name for ONE workspace.
 *
 * ── 🔴 WHY THE WORKSPACE IS IN THE NAME ─────────────────────────────────────
 *
 * Auth.js names the cookie `authjs.session-token` for every app. COOKIES IGNORE
 * THE PORT, so on a dev box `localhost:3001` and `localhost:3000` share one
 * cookie: signing into the workshop app silently signed you into the customer
 * app, with the workshop's session. MEASURED 2026-08-04 — the cookie jar held
 * `authjs.session-token.0/.1` on `domain=localhost`, and the customer app
 * rendered a signed-in shell for a session it never issued.
 *
 * That is a session for one workspace being accepted by another. Same-origin
 * policy does not help, because the origin is the same by port alone. It also
 * made the SSO check pass for the wrong reason: the second app was not doing
 * single sign-on, it was reading the first app's cookie.
 *
 * Production is on separate hosts today, so this is currently a development
 * defect — but "currently" is doing a lot of work in that sentence. The moment
 * two apps share a domain (subdomains under one parent, or two paths behind one
 * proxy) it becomes a cross-workspace session, and nothing in the code would
 * have changed to cause it.
 *
 * ⚠️ THE `__Secure-` PREFIX IS PART OF THE NAME, NOT DECORATION. It is what
 * stops a plain-http origin writing a cookie an https origin will then send —
 * see `readSessionToken` for the session-fixation this prevents. So the prefix
 * is decided by the SCHEME, exactly as the reader decides it, and both go
 * through this one function so they cannot drift. They have drifted before: a
 * previous revision derived the name from `NODE_ENV`, which agrees with the
 * scheme only by coincidence, and `getAccessToken()` returned null for a
 * genuinely signed-in user with nothing logged.
 *
 * ⚠️ CHANGING THIS INVALIDATES EVERY EXISTING SESSION EXACTLY ONCE. Sessions
 * live under the old name and nothing reads it any more, so everybody signs in
 * again on the next visit. That is the intended, one-time cost.
 */
export function sessionCookieName(workspaceId: WorkspaceId | string, secure: boolean): string {
  // 🔴 ADR-021 — THE WORKSPACE IS NO LONGER IN THE NAME, AND THE PARAGRAPHS
  // ABOVE ARE KEPT BECAUSE THEY EXPLAIN WHY IT ONCE WAS.
  //
  // Read the fourth paragraph again: it predicted exactly this. *"The moment two
  // apps share a domain (subdomains under one parent, or two paths behind one
  // proxy) it becomes a cross-workspace session."* That moment arrived on
  // 2026-08-13, when the seven deployed applications became seven packs inside
  // one artifact. The difference is that they are no longer two apps sharing a
  // domain — they are ONE app, one process, one origin.
  //
  // So the defect the suffix was written to prevent cannot occur: there is no
  // second application to read the first one's cookie. Keeping the suffix would
  // not isolate anything, because the same process serves every pack and the
  // browser would send all seven cookies on every request. What it WOULD do is
  // demand a fresh sign-in each time somebody moved between packs, in a product
  // whose premise is that a workshop owner also buys parts and a customer also
  // tracks a repair.
  //
  // ⚠️ AUTHORITY NEVER CAME FROM WHICH COOKIE WAS PRESENTED, and that is what
  // makes this safe rather than merely convenient. A session says only who the
  // visitor is. What they may reach comes from the membership and grant resolved
  // server-side in `resolveTenantContext`, and from RLS beneath it; a pack a
  // viewer holds no membership for refuses them via `requireWorkspaceAccess()`
  // whether or not a cookie for it exists. The 2026-08-04 defect was a session
  // being ACCEPTED by an app that never issued it — here there is one issuer.
  //
  // The parameter is retained deliberately. Every caller across seven packs
  // passes its own id, and none of those 300-odd call sites needed to change for
  // this; making the argument meaningless in one function is the whole point of
  // fixing the fact instead of the call sites. It also leaves the door open to
  // re-scoping per pack if this app is ever split back apart.
  void workspaceId;
  return `${secure ? '__Secure-' : ''}authjs.session-token`;
}

/**
 * Whether cookies are issued with the `Secure` attribute and prefix.
 *
 * The CONFIG has no request to look at, so it reads `AUTH_URL` — which is what
 * Auth.js's own `useSecureCookies` default does. `isSecureRequest` handles the
 * per-request case for reading, and falls back to the same variable first.
 */
function secureCookiesConfigured(): boolean {
  return (process.env['AUTH_URL'] ?? '').startsWith('https://');
}

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
    /**
     * 🔴 ONE SESSION COOKIE PER WORKSPACE — see `sessionCookieName`.
     *
     * Without this every app on a shared origin reads the same cookie, and on a
     * dev box "shared origin" includes two different PORTS. The name and the
     * `__Secure-` prefix both come from that one function so the writer here
     * and the reader in `readSessionToken` cannot disagree.
     */
    cookies: {
      sessionToken: {
        name: sessionCookieName(workspaceId, secureCookiesConfigured()),
        options: {
          httpOnly: true,
          sameSite: 'lax' as const,
          path: '/',
          secure: secureCookiesConfigured(),
        },
      },
    },
    /**
     * 🔴 THE ERROR PAGE IS OVERRIDDEN; THE SIGN-IN PAGE IS NOT.
     *
     * Auth.js's default sign-in screen is fine — there is no branded one yet and
     * a half-styled one would be worse. Its default ERROR screen is not fine,
     * for one specific and measured reason:
     *
     * Keycloak sleeps on Render's free tier and its cold start reached 136
     * SECONDS on 2026-08-03. Auth.js discovers every endpoint from the realm's
     * `.well-known/openid-configuration`, so during that wake the discovery
     * fetch fails and Auth.js renders `Configuration` — "There is a problem with
     * the server configuration."
     *
     * Nothing is misconfigured. The service is starting. And the person shown
     * that message is always the FIRST visitor after a quiet period, which on a
     * product with little traffic is very nearly every visitor. Telling them the
     * server is broken loses them; telling them to wait ninety seconds does not.
     *
     * ⚠️ EVERY APP MUST MOUNT `/auth/error`. This is set once here for all seven
     * workspaces, so an app missing that route turns a recoverable cold start
     * into a 404 — worse than the screen this replaces. `auth-error-route.spec.ts`
     * asserts all seven exist, and it is the only thing standing between a new
     * app and that regression.
     */
    pages: { error: '/auth/error' },
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
        /**
         * ⚠️ NO `prompt` PARAMETER, AND THAT IS A MEASURED DECISION rather than an
         * omission.
         *
         * Keycloak honours a live SSO session, so pressing "Sign in" while somebody
         * else is still signed in returns THEIR identity without asking — reported as
         * "i logged in as admin but it show technician". The obvious fix is a prompt.
         * Both were tried against this realm and neither works:
         *
         *   · `prompt=select_account` — returns SILENTLY, exactly as with no parameter
         *     at all. Measured: it landed straight on the previous user's dashboard.
         *   · `prompt=login` — shows "Please re-authenticate to continue" PRE-FILLED
         *     with the previous user and only a password box. There is no link to
         *     choose another account in this theme, so it is strictly worse: it asks a
         *     question the person cannot answer and gives them no way out.
         *
         * The mechanism that does work is ending the SSO session, which is what
         * `performSignOut` already does correctly. So the fix is the "Switch user"
         * control in the shell, and this is left at the default deliberately —
         * shipping a parameter that measurably changes nothing, under a comment
         * claiming it does, is worse than shipping neither.
         */
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
          token.keycloak = await refreshAccessToken(
            clientId,
            current.refreshToken,
            undefined,
            // Keep the id token when the realm's refresh response omits one —
            // without it `id_token_hint` disappears and sign-out stops being
            // able to end the Keycloak session.
            current.idToken,
          );
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

    events: {
      /**
       * 🔴 A FRESH SIGN-IN STARTS FROM ROLE PRECEDENCE, NOT FROM WHATEVER THE
       * LAST SESSION LEFT IN A COOKIE.
       *
       * THE DEFECT, reported by the owner twice — 2026-08-07 ("still customer
       * page showup for every role user login") and again 2026-08-08 after the
       * first fix ("still same problem its customer app that comes up"):
       *
       *   `aw.activeRole` is read by `activeRoleName()` and sent to the API as
       *   `x-role-name`. `resolveTenantContext` treats that as a REQUEST and
       *   **filters to that role before anything else** — deliberately, so the
       *   switcher can never be silently ignored. But that means a stored
       *   `customer` value BYPASSES role precedence completely. The 2026-08-07
       *   fix made the DEFAULT the strongest role held; it does nothing at all
       *   when a role is explicitly requested, and a cookie always requests one.
       *
       *   So an account holding workshop_owner + customer, whose browser once
       *   stored `customer`, resolved as a customer on every request for ever.
       *   The cookie outlived the session, the sign-out and the deploy.
       *
       * ⚠️ CLEARING ON SIGN-OUT WAS NOT ENOUGH, and that is why the owner saw
       * it "come back". `performSignOut` does clear these — but only for
       * somebody who signs out THROUGH the app after that code shipped. A
       * browser already holding the value never passed through it. Fixing the
       * mechanism does not retroactively clear what it was supposed to prevent,
       * the same shape as the `verifyEmail` trap: clearing the flag did not
       * free the users already caught by it.
       *
       * Clearing here makes each LOGIN authoritative: precedence picks the
       * strongest role held, and the switcher is how you go the other way —
       * which is what the switcher is for. The choice lasts the session rather
       * than becoming a permanent, invisible property of the browser.
       */
      async signIn() {
        await clearWorkspacePreferences();
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
      const token = await readSessionToken(req, workspaceId);

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
      const token = await readSessionToken({ headers: await headers() }, workspaceId);
      return token?.keycloak !== undefined;
    },

    async signOutCompletely(postLogoutRedirect: string) {
      // Reads the cookie the same way getAccessToken does, and for the same
      // reason: the session object deliberately carries no tokens, so the JWT
      // is the only place the refresh token exists.
      const req = { headers: await headers() };

      // `refreshTokenRevoked` stays `let` — it IS reassigned below.
      let refreshTokenRevoked = false;

      // Same both-names read as `getAccessToken`. Getting this wrong here is
      // WORSE than getting it wrong there: a miss means the refresh token is
      // never found, so sign-out silently degrades to clearing a cookie —
      // exactly the defect this method exists to fix.
      const token = await readSessionToken(req, workspaceId);
      const keycloak = token?.keycloak;
      // Declared AT its assignment rather than hoisted as `let` above. Same
      // scope, assigned once, read once — so there was never anything for the
      // earlier declaration to buy, and a `let` that is never reassigned
      // invites somebody to reassign it.
      const idToken = keycloak?.idToken;
      if (keycloak?.refreshToken) {
        refreshTokenRevoked = await revokeRefreshToken(clientId, keycloak.refreshToken);
      }

      // Returned rather than thrown on failure: a user who cannot sign out
      // because an upstream call failed is left MORE exposed than one whose
      // token outlives the session. The caller audits the difference.
      return {
        keycloakSignOutUrl: keycloakSignOutUrl(idToken, postLogoutRedirect, clientId),
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
  // Authoritative when present: configuration, not a header.
  const configured = process.env['AUTH_URL'];
  if (configured) return configured.startsWith('https://');

  // ⚠️ AUTH_URL IS NOT ALWAYS SET. `render.yaml` does not set it, so treating it
  // as guaranteed — as an earlier comment here did — put the whole decision on a
  // header without saying so.
  //
  // When several proxies chain, `x-forwarded-proto` becomes a list and the
  // LAST entry is the one the terminating proxy added; the FIRST is the one
  // nearest the client, i.e. the untrusted one. Reading `[0]` (as this did) lets
  // a client-supplied `http` win on a genuine https deployment and downgrade the
  // cookie name back to the unprefixed one — reinstating the exact session
  // fixation the scheme check exists to prevent.
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1]?.trim() === 'https';
  }

  // No configuration and no proxy header: FAIL SECURE. Only a loopback host is
  // assumed to be plain http, because that is local development and nothing else
  // is. Anything else is treated as https, so a missing header can only ever
  // make the check stricter — never weaker.
  const host = req.headers.get('host') ?? '';
  const hostname = host.split(':')[0];
  return !(hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1');
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
async function readSessionToken(req: { headers: Headers }, workspaceId: WorkspaceId | string) {
  const secure = isSecureRequest(req);
  const names = secure ? [true] : [false, true];

  // ⚠️ `cookieName` IS PASSED EXPLICITLY. `getToken` otherwise derives the
  // DEFAULT Auth.js name, which is no longer what the config writes — so
  // omitting it here would look for `authjs.session-token` while the session
  // lives under `authjs.session-token.<workspace>`, and every signed-in user
  // would read as signed out with nothing logged. That precise failure has
  // happened in this function once already, from the NODE_ENV/scheme mismatch.
  const cookieNameFor = (secureCookie: boolean) => sessionCookieName(workspaceId, secureCookie);

  // Ask without the secret first — see the note in `getAccessToken`. `getToken`
  // checks for the cookie before it checks for a secret, so a visitor with no
  // session never forces `AUTH_SECRET` to be present.
  const present = await Promise.all(
    names.map((secureCookie) =>
      // ⚠️ `cookieName` ONLY — NOT alongside `secureCookie`. Passing both had
      // getToken apply its own `__Secure-` prefixing on top of the name we
      // already prefixed, so it looked for `__Secure-__Secure-…` and found
      // nothing: no session cookie in the jar at all, and both apps fell back
      // to a sign-in click. Measured immediately after the first attempt.
      getToken({ req, secret: '', cookieName: cookieNameFor(secureCookie), raw: true }),
    ),
  );
  if (!present.some(Boolean)) return null;

  const secret = authSecret();
  for (const secureCookie of names) {
    const token = await getToken({ req, secret, cookieName: cookieNameFor(secureCookie) });
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

/** Re-exported so callers need one import to reach the API. */
export { apiBaseUrl, keycloakSignOutUrl };
