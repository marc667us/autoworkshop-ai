import { NextResponse, type NextRequest } from 'next/server';
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

/**
 * ⚠️ THE PUBLIC STOREFRONT DOES NOT RUN THE AUTH HANDLER, AND THIS IS WHY.
 *
 * Measured 2026-07-31, and raised independently by Codex as HIGH. `auth`
 * resolves its config PER REQUEST, and that config reads
 * `required('AUTH_SECRET')`, which THROWS when the variable is absent. Because
 * the matcher below covers `/`, a missing `AUTH_SECRET` returned HTTP 500 for
 * EVERY route — including the public marketplace, the one surface in this
 * product that needs no account at all.
 *
 * Fail-closed on a missing signing secret is CORRECT for anything that touches
 * a session; a silent fallback would mint sessions nobody can decrypt after the
 * next restart. What was wrong is the BLAST RADIUS. An anonymous visitor
 * browsing parts has no session to protect, so coupling their page to a secret
 * they never use buys nothing and costs the entire storefront.
 *
 * Production severity is lower than it first looks, and that is said rather
 * than hidden: `render.yaml` sets `AUTH_SECRET` with `generateValue: true`, so
 * a deployed instance always has one. The acute failure was local, from a
 * start-up command that did not source `.env`. What remains is blast radius,
 * and this closes it.
 *
 * ⚠️ A WRAPPER RATHER THAN A MATCHER EXCLUSION. Both work. Excluding `/` needs
 * `(?!$|…)` bolted into a regex that is already hard to read and is duplicated
 * from `@autoworkshop/auth` — and a mistake there silently UN-COVERS routes
 * that must stay covered. A named set is explicit and greppable.
 *
 * ⚠️ EXACT MATCHES ONLY, NEVER A PREFIX TEST. `startsWith('/')` would match
 * every path in the app and disable authentication everywhere — the worst
 * possible outcome of a change meant to improve availability.
 *
 * The token-refresh cost Codex named is real and bounded: a signed-in visitor
 * landing on `/` gets no refreshed token persisted on THAT request. It costs
 * nothing, because `app/page.tsx` redirects them straight to
 * `/home/dashboard`, which IS covered, so the refresh persists on the very next
 * request. An anonymous visitor never needs the secret at all — the session
 * read checks for a cookie BEFORE asking for it.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/']);

export default function middleware(req: NextRequest, event: unknown) {
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  // Auth.js's `auth` IS a middleware function — this is the same invocation
  // `export default auth` performed, with the public paths peeled off first.
  return (auth as unknown as (r: NextRequest, e: unknown) => ReturnType<typeof NextResponse.next>)(
    req,
    event,
  );
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
