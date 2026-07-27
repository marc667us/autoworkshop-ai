import { auth } from './auth';

/**
 * MIDDLEWARE IS NOT OPTIONAL HERE.
 *
 * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
 * token. The refresh itself happens in the `jwt` callback, but only middleware
 * may write the session cookie — a server component can compute a renewed token
 * and has no way to store it. Without this file the app would re-refresh on
 * every render, keep none of it, and `getAccessToken()` would start returning
 * null a few minutes into every session, with the shell quietly degrading to
 * its signed-out state.
 *
 * It does NOT gate access. An unauthenticated visitor still reaches the shell
 * and sees the ungated navigation; the API and Postgres RLS are what deny.
 * Redirect-to-sign-in is a deliberate later step (see the handover): forcing it
 * here would couple the whole Playwright suite to a running Keycloak and API.
 *
 * The matcher is written out rather than imported because Next requires
 * `config` to be statically analysable — an imported constant is not. It is the
 * same value as `AUTH_MIDDLEWARE_MATCHER` in `@autoworkshop/auth`, which is the
 * canonical copy.
 */
export default auth;

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
