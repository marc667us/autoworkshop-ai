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
 * IT DOES NOT GATE ACCESS, AND DELIBERATELY SO — but read the next paragraph
 * before concluding that nothing does. Gating here would mean resolving the
 * viewer's grants inside middleware, which runs on the Edge runtime and would
 * put a `/me` round trip in front of every request including static-ish ones.
 *
 * THE GATE FOR THIS WORKSPACE IS IN `app/layout.tsx` (T-0005 finding 4). It
 * calls `workspaceGate(viewer, 'platform.admin')` and, when that fails, renders
 * a denial in place of `children` — so the page's server component never
 * executes. A layout wraps every route in the segment, so unlike the previous
 * arrangement (route-tree filtering inside `renderModulePage`) a concrete
 * `app/<group>/<item>/page.tsx` cannot slip past it by Next's route precedence.
 * That bypass is what finding 4 was.
 *
 * Neither is the real control: the API's `TenantGuard` and Postgres RLS deny
 * independently, and must (CLAUDE.md §8, "Hidden ≠ secure").
 *
 * Redirect-to-sign-in remains a deliberate later step (see the handover):
 * forcing it here would couple the whole Playwright suite to a running Keycloak
 * and API. The layout gate needs neither — signed out, it renders a "Sign in to
 * continue" state and nothing else.
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
