import { NextResponse, type NextRequest } from 'next/server';
import { auth } from './auth';
import { packServingLegacyPath, workspaces } from '@autoworkshop/navigation';

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
 * and sees the ungated navigation; the API and Postgres RLS are what deny, and
 * `requireWorkspaceAccess()` is what 404s a pack a viewer may not use.
 *
 * ADR-021: this replaces seven identical copies, one per deployed app. Nothing
 * about it needed to become pack-aware — the packs differ by path, and every
 * path below the public set is treated the same way.
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
 * 🔴 THE BLAST RADIUS IS NOW LARGER, WHICH MAKES THIS MORE IMPORTANT, NOT LESS.
 * Before ADR-021 a 500 here took down one of seven deployed applications. One
 * artifact means it would take down all seven — so the one route that provably
 * needs no secret is exactly the one worth keeping out of the handler's way.
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
 * nothing, because `app/page.tsx` redirects them into their own pack, which IS
 * covered, so the refresh persists on the very next request. An anonymous
 * visitor never needs the secret at all — the session read checks for a cookie
 * BEFORE asking for it.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/']);

/**
 * The seven mount points. A path that starts with one of these is already where
 * it belongs; anything else may be a pre-ADR-021 link.
 */
const PACKS = new Set([
  'customer', 'workshop', 'supplier', 'fleet', 'insurance', 'towing', 'admin',
]);

/**
 * Paths the ARTIFACT owns at its root — never pack routes, never legacy.
 *
 * 🔴 `onboarding` IS HERE OR IT IS UNREACHABLE. The redirector below sends any
 * first segment that is in neither set to `packServingLegacyPath`, and no pack
 * claims `/onboarding`, so it would have redirected to `/` — the page would
 * have existed, built, type-checked and been impossible to open. Codex named
 * this as the exact required edit before the route was written.
 *
 * ⚠️ AND NOT IN `PUBLIC_PATHS`. `/onboarding` is for signed-in people, so the
 * Auth.js handler SHOULD run there — that is what refreshes and persists the
 * access token, which the page needs in order to ask the API what the viewer
 * belongs to.
 */
const ROOT_OWNED = new Set(['api', 'auth', 'onboarding', '_next', 'robots.txt', 'favicon.ico']);

export default function middleware(req: NextRequest, event: unknown) {
  const { pathname } = req.nextUrl;

  // 🔴 EVERY PRE-CONSOLIDATION LINK 404s WITHOUT THIS, AND THE TEST SUITE
  // CANNOT SEE IT. Until 2026-08-13 the apex served workshop-web, so
  // `/home/dashboard` and `/customer-reception/customers` were real, published
  // URLs — bookmarked, emailed, remembered. Mounting the packs moved all of them
  // and left nothing behind. The live suite stayed green at 70/0/1 throughout,
  // because it only ever requests paths the NEW topology advertises; the owner
  // found it by using the product.
  //
  // Resolved against the navigation model rather than a hand-written list: it
  // already knows every route every pack serves. When exactly one pack claims
  // the path we send them straight there. When several do — `/home/dashboard`
  // is in six of the seven trees — we send them to `/`, which resolves the
  // viewer and dispatches, because guessing between packs would drop somebody
  // into a workspace they may hold no membership for.
  //
  // ⚠️ A REDIRECT, NOT A REWRITE. The address bar must end up showing where the
  // page actually lives, or the next bookmark repeats the problem for ever.
  const first = pathname.split('/')[1] ?? '';
  if (first && !PACKS.has(first) && !ROOT_OWNED.has(first)) {
    const pack = packServingLegacyPath(pathname, Object.values(workspaces));
    const url = req.nextUrl.clone();
    url.pathname = pack ? `/${pack}${pathname}` : '/';
    return NextResponse.redirect(url);
  }

  if (PUBLIC_PATHS.has(pathname)) {
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
