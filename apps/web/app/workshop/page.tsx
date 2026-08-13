import {
  AddToBasket,
  MarketplaceLanding,
  fetchFacets,
  fetchMechanics,
  fetchParts,
  fetchStats,
  fetchVin,
  requestServiceHrefFrom,
  supplierRegisterHrefFrom,
} from '@autoworkshop/marketplace-ui';
import { currentViewer, viewerHasSession } from '@autoworkshop/next-shell';

/**
 * `/` — THE PUBLIC FRONT DOOR, ON THE APP THAT OWNS THE APEX.
 *
 * ── WHY THIS REPLACED A REDIRECT, AND WHERE THE PATTERN CAME FROM ──────────
 *
 * This route used to be `redirect('/home/dashboard')`, on the grounds that §18
 * makes the dashboard a workspace's default landing. The consequence was that
 * `autoworkshop.aiappinvent.com` — the only address anyone has — answered with
 * a sign-in wall. The public parts marketplace and the free VIN search existed
 * in `customer-web`, deployed at a different hostname, and reaching them from
 * the real domain needed a DNS change at Namecheap that cannot be made from
 * here.
 *
 * 🔴 SOLAR HAS NEVER NEEDED THAT DNS CHANGE, and reading it is what produced
 * this file. Solar runs ONE service: 421 routes in one app, 88 of them public.
 * `/` renders the landing for EVERYONE — `render_template("landing.html",
 * user=current_user())`, with no redirect for a signed-in visitor — and the
 * free tools (`/assess/quick`, `/marketplace`) are ordinary unauthenticated
 * routes sitting beside the private ones. There is no second service, so there
 * is nothing for a CNAME to point at differently, and no Namecheap
 * configuration was ever required.
 *
 * AutoWorkshop keeps its seven apps — that decision stands — so the equivalent
 * move is narrower: the public surface became `@autoworkshop/marketplace-ui`,
 * and the app that already holds the apex mounts it. One implementation, two
 * front doors, still no DNS work.
 *
 * ── NO REDIRECT, FOR ANYONE ────────────────────────────────────────────────
 *
 * ⚠️ Deliberately, and this is the half that is easy to undo by accident. A
 * signed-in visitor sees the landing WITH their session: the shell above still
 * names them, still offers Sign out, and its navigation reaches their
 * dashboard. Redirecting somebody "because they have an account" is what made
 * the marketplace unreachable to customers in the first place, and the owner
 * asked for the opposite — "user must be able access the landing even when
 * logged in".
 *
 * `/home/dashboard` remains the dashboard's ONE canonical URL. Nothing here
 * renders it, so the breadcrumb and active-nav concern the old redirect comment
 * raised does not arise.
 *
 * ── 🔴 THE BASKET IS HERE NOW (owner, 2026-08-06) ──────────────────────────
 *
 * This block used to read "NO BASKET HERE", on the reasoning that a workshop's
 * staff buy through procurement rather than a consumer basket. The owner asked
 * for the opposite, explicitly: the landing "must [have] procurement where items
 * can be bought just like in solar, but must have [a] shopping cart".
 *
 * They are right, and the old reasoning had a hole in it. THE APEX IS NOT THE
 * STAFF'S FRONT DOOR — it is EVERYBODY'S. `autoworkshop.aiappinvent.com` is the
 * only address anyone has, and most people arriving at it are not workshop
 * staff at all: they are somebody who searched for a part. Offering them a
 * catalogue with no way to buy from it is the same defect as the register button
 * that answered 400 — a front door that shows you the goods and gives you no
 * till.
 *
 * ⚠️ `AddToBasket` AND `basket.ts` WERE MOVED INTO `@autoworkshop/marketplace-ui`,
 * NOT COPIED. Neither touches a workspace — the basket is browser state — and
 * this repository has THREE recorded instances of a copied file carrying its
 * origin's workspace id, a bug that works locally (cookies ignore the PORT) and
 * fails only in production. One implementation cannot drift. §0.3.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** First value only — `?make=Ford&make=Kia` must not become "Ford,Kia". */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function Index({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  // WHO IS LOOKING. `currentViewer` returns null for a stranger, and this page
  // is entirely public — it reads only unauthenticated endpoints — so a null
  // here costs nothing but the personalised copy.
  //
  // ⚠️ WORKSPACE `'workshop'`, because this app owns the apex and its session
  // cookie is `authjs.session-token.workshop`. Writing `'customer'` here would
  // read a cookie that CANNOT EXIST on this host — and would pass every local
  // test, because localhost:3000 and :3001 share one jar. That exact mistake has
  // been made three times in this repository.
  // 🔴 THE SESSION DECIDES WHETHER THEY ARE SIGNED IN. `/me` ONLY SUPPLIES THE
  // NAME. This is Solar's pattern, and it is here because the obvious version
  // produced the owner's "there is no button to the dashboard" report.
  //
  // What this line used to be:
  //
  //     const viewerDescription = await currentViewer('workshop');
  //     const viewer = viewerDescription ? { ... } : null;
  //
  // `currentViewer()` fetches `GET /api/v1/me`. The API sleeps on Render's free
  // tier and answers in 21.6s cold, so that call returns null whenever the
  // owner is the first visitor after a quiet period — which, with no other
  // users, is EVERY TIME. `viewer: null` is the STRANGER variant, so a signed-in
  // owner was shown the signed-out landing with no way through to their own
  // dashboard. The comment here used to claim "a null here costs nothing but
  // the personalised copy"; it cost the dashboard button.
  //
  // Solar has never had this failure because it never asks a remote service who
  // is looking (`web_app.py:1074`):
  //
  //     def current_user():
  //         if "user_id" not in session:
  //             return None          # ← the SESSION, read locally
  //         ...load the row...
  //
  //     {% if user %} Go to Dashboard {% else %} Start Free {% endif %}
  //
  // `viewerHasSession()` is the exact analogue: it reads this workspace's
  // session cookie and makes NO network call, so it cannot fail because a
  // container is asleep. `/me` is still asked, still in parallel, and still
  // supplies the display name — but it is no longer allowed to decide identity.
  //
  // ⚠️ THE DEGRADED STATE IS "SIGNED IN, NAME UNKNOWN", NEVER "STRANGER". A
  // transport failure is not an authorization fact. This is the fourth time in
  // this repository that a failed read has been rendered as a confident claim
  // about who somebody is.
  const [viewerDescription, signedIn] = await Promise.all([
    currentViewer('workshop'),
    viewerHasSession('workshop'),
  ]);
  const viewer = signedIn
    ? {
        displayName: viewerDescription?.displayName ?? null,
        dashboardHref: '/home/dashboard',
      }
    : null;

  const params = (await searchParams) ?? {};
  const applied = {
    q: one(params.q),
    make: one(params.make),
    model: one(params.model),
    year: one(params.year),
    manufacturer: one(params.manufacturer),
    category: one(params.category),
    mechanicQuery: one(params.mechanic),
  };
  const vinQuery = one(params.vin).trim();

  // Rebuilt rather than forwarded: only the parameters the parts endpoint
  // understands are passed on, so an unrecognised query-string key cannot ride
  // through to the API. The API normalises again on its side.
  const partsQuery = new URLSearchParams();
  if (applied.q) partsQuery.set('q', applied.q);
  if (applied.make) partsQuery.set('make', applied.make);
  if (applied.model) partsQuery.set('model', applied.model);
  if (applied.year) partsQuery.set('year', applied.year);
  if (applied.manufacturer) partsQuery.set('manufacturer', applied.manufacturer);
  if (applied.category) partsQuery.set('category', applied.category);

  const mechanicQuery = new URLSearchParams();
  if (applied.mechanicQuery) mechanicQuery.set('q', applied.mechanicQuery);

  // One round of parallel reads. Sequential would add four round trips to the
  // first page anyone ever sees, on the domain they actually typed.
  const [statsResult, facetsResult, partsResult, mechanicsResult, vinResult] =
    await Promise.all([
      fetchStats(),
      fetchFacets(),
      fetchParts(partsQuery.toString()),
      fetchMechanics(mechanicQuery.toString()),
      vinQuery ? fetchVin(vinQuery) : Promise.resolve(null),
    ]);

  // A failed section is NAMED and the rest still renders. One error screen for
  // any failure means a broken mechanic directory hides a working catalogue.
  const problems: string[] = [];
  if (!statsResult.ok) problems.push(`Marketplace totals: ${statsResult.reason}`);
  if (!facetsResult.ok) problems.push(`Search filters: ${facetsResult.reason}`);
  if (!partsResult.ok) problems.push(`Parts: ${partsResult.reason}`);
  if (!mechanicsResult.ok) problems.push(`Mechanics: ${mechanicsResult.reason}`);
  if (vinResult && !vinResult.ok) problems.push(`VIN check: ${vinResult.reason}`);

  return (
    <MarketplaceLanding
      // This app mounts the landing INSIDE `WorkspaceShell`, which already
      // renders the `<main>` landmark. Two of them is invalid HTML and breaks
      // the skip link — the one control a keyboard user has for getting past
      // the navigation.
      ownsMainLandmark={false}
      stats={statsResult.ok ? statsResult.data : null}
      facets={facetsResult.ok ? facetsResult.data : null}
      parts={partsResult.ok ? partsResult.data.parts : []}
      total={partsResult.ok ? partsResult.data.total : 0}
      mechanics={mechanicsResult.ok ? mechanicsResult.data : []}
      applied={applied}
      vinQuery={vinQuery}
      vinResult={vinResult && vinResult.ok ? vinResult.data : null}
      problems={problems}
      // This app serves the landing at the APEX.
      basePath="/"
      // Owner request 2026-08-06. Two mounts, one component, and the basket now
      // works on the address people actually visit.
      // 🔴 ABSOLUTE, AND ONLY WHEN CONFIGURED. The Request for Service form is a
      // CUSTOMER-WEB route, and this landing is served from the APEX
      // (workshop-web) — a different host. A relative path here would 404 on the
      // exact step the funnel exists to reach.
      //
      // 🔴 THIS DECISION USED TO BE INLINE HERE, AND THAT IS WHY IT FAILED. It
      // read `NEXT_PUBLIC_CUSTOMER_WEB_URL`, which was set on neither the Render
      // service nor the image build — so the owner's "Request repair service"
      // button, and "Request for Service" on every mechanic card, could not
      // render at all while every gate reported the feature shipped. It is now a
      // tested function with the refusals asserted; the reasoning lives there.
      requestServiceHref={requestServiceHrefFrom(process.env)}
      // ═══ THE TWO BUSINESS FUNNELS (owner, 2026-08-09) ═══════════════════
      //
      // 🔴 THE WORKSHOP ONE IS SAME-ORIGIN AND THE SUPPLIER ONE IS NOT, and
      // that asymmetry is the entire reason they are built differently rather
      // than by one shared helper.
      //
      // THIS APP IS THE APEX. Its `/home/dashboard` renders
      // `CreateWorkshopScreen` for a signed-in person with no membership, so a
      // literal same-origin sign-in href with a path-only `callbackUrl` is
      // exactly right and cannot be misconfigured.
      //
      // supplier-web is ANOTHER HOST. Auth.js cookies are per-origin, so its
      // sign-in must happen AT ITS OWN ORIGIN — signing in here and redirecting
      // there lands the person on a foreign host as a stranger. That is
      // `c586e38`, the bug the owner reported four times, and
      // `supplierRegisterHrefFrom` is where the rule is written down and
      // tested. It returns undefined unless SUPPLIER_WEB_URL is set, and the
      // button then does not render at all.
      //
      // ⚠️ READ AT RUNTIME, which works only because of `dynamic =
      // 'force-dynamic'` above. Without it Next would freeze the builder's
      // empty environment at build time and the supplier button would silently
      // vanish — the 2026-08-07 defect, exactly.
      setupWorkshopHref="/api/auth/signin?callbackUrl=%2Fhome%2Fdashboard"
      registerSupplierHref={supplierRegisterHrefFrom(process.env)}
      basketHref="/basket"
      renderAddToBasket={(part) => (
        <AddToBasket partId={part.id} partName={part.name} hasPrice={part.price !== null} />
      )}
      viewer={viewer}
    />
  );
}
