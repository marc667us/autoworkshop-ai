import Link from 'next/link';
import { redirect } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  currentViewer,
  homeWorkspaceFor,
  needsWorkshop,
  registrationStatus,
  viewerHasSession,
} from '@autoworkshop/next-shell';
import { landingPathFor, workspaces } from '@autoworkshop/navigation';
import { MarketplaceLanding } from '@autoworkshop/marketplace-ui';
import { AddToBasket } from '@autoworkshop/marketplace-ui';

import { fetchFacets, fetchMechanics, fetchParts, fetchStats, fetchVin, REQUEST_SERVICE_PATH } from '@autoworkshop/marketplace-ui';

/**
 * `/` — the front door, and the ONLY route in this workspace that serves two
 * different audiences.
 *
 *   signed out → the public Abossey Okai Auto Parts Marketplace: view and
 *                search only, with sign in and sign up on the page.
 *   signed in  → the dashboard. §18 makes the dashboard the default landing
 *                page for a workspace, and that still holds — it just holds for
 *                people who have a workspace.
 *
 * ⚠️ THE BRANCH IS ON `viewerHasSession`, NOT ON WHETHER `/api/v1/me` RETURNED
 * A VIEWER. That distinction cost this repo a bug already (Codex finding M2):
 * the session lives in a cookie, the viewer comes from the API, and when the
 * API is down the second is absent while the first is perfectly valid.
 * Branching on the viewer would drop a signed-in customer onto the public
 * marketing page during an API outage — being offered a "Create an account"
 * button while holding a live session.
 *
 * ⚠️ `dynamic = 'force-dynamic'` IS LOAD-BEARING. This page reads the session
 * cookie and the query string; a cached render would serve one visitor's page
 * to the next. It is declared explicitly rather than left to arise as a side
 * effect of reading cookies further down the tree, because that is an implicit
 * dependency a refactor can quietly remove.
 */
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** First value only — `?make=Ford&make=Kia` must not become "Ford,Kia". */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function Index({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  /**
   * 🔴 SIGNED IN, BELONGS NOWHERE — THE STATE THE FRONT DOOR COULD NOT SEE.
   *
   * Signing up creates a Keycloak user and nothing else: no membership, so no
   * role, so `currentViewer` returns null and the branch below falls through to
   * the marketplace. That is CORRECT for a parts buyer and WRONG for somebody
   * who has just signed up meaning to register a workshop — and until now the
   * two were indistinguishable, so both got a storefront with a "Create an
   * account" button they had already used, and no way forward. It is the honest
   * reading of the owner's "access is denied to users".
   *
   * ⚠️ AN INVITATION, NOT A REDIRECT, AND THAT IS THE WHOLE DESIGN.
   * `hasWorkshop: false` means "no ACTIVE MEMBERSHIP AT ALL", and the parts
   * buyer who never joins a workshop lives in that set permanently — the file
   * comments on `registration.controller.ts:120` and the customer layout both
   * say so. Redirecting on it would take the storefront away from the exact
   * person the storefront is for, on every visit. Codex refused the redirect
   * design for this reason, and it is the same lesson as 2026-08-13, when
   * replacing this landing for a signed-in account with no workshop made the
   * free VIN tool unreachable for the people it converts.
   */
  let needsSetup = false;

  if (await viewerHasSession('customer')) {
    // ADR-021 — `main` DISPATCHES. Before the consolidation this line could
    // simply send everyone to `/home/dashboard`, because the only people who
    // ever reached this page were on the customer application's own hostname.
    // One artifact has one front door, and a workshop owner, a supplier and an
    // insurer all arrive here now.
    //
    // `homeWorkspaceFor` is the SAME map `isForeignToWorkspace` uses to decide
    // that a role does not belong in a pack. Reusing it is what stops the front
    // door sending somebody to a pack that will immediately 404 them — two
    // separate answers to "where does this role live" is precisely the
    // "two literals in two files" trap this repo has already paid for.
    const viewer = await currentViewer('customer');

    // 🔴 DO NOT DISPATCH ON AN UNRESOLVED VIEWER. Codex findings 4 and 5, which
    // are the same defect approached from two directions.
    //
    // `viewerHasSession` reads a COOKIE; `currentViewer` calls `/api/v1/me` with
    // a token. The second can fail while the first says yes — an API outage, a
    // cold start, or an access token that expired because middleware does not
    // run on `/` (it is deliberately public so a missing AUTH_SECRET cannot 500
    // the storefront). In all of those, `activeRole` is undefined.
    //
    // `homeWorkspaceFor(undefined)` answers `workshop`, correctly, because that
    // is the right default for STAFF whose role has not resolved yet. Used here
    // it would take a signed-in CUSTOMER — whose session is perfectly valid —
    // and send them to `/workshop/home/dashboard`, where the foreign-role guard
    // 404s them the moment their viewer DOES resolve. A guess about identity,
    // cashed at the one moment identity was unavailable.
    //
    // So it dispatches only when it actually knows. Otherwise it falls through
    // to the marketplace below, which renders for anyone, needs no viewer, and
    // is a page rather than a dead end. The shell resolves them on their next
    // navigation, by which time middleware has run and refreshed the token.
    if (viewer?.activeRole) {
      // 🔴 THE LANDING PATH IS ASKED OF THE NAVIGATION MODEL, NOT SPELLED OUT.
      //
      // This line read `/${homeWorkspaceFor(...)}/home/dashboard`, and TWO of
      // the seven packs do not serve that path:
      //
      //   · towing  — `02.txt` §52 gives it `operations`, so its dashboard is
      //     `/towing/operations/dashboard`
      //   · admin   — its Home group's only dashboard is `operations-dashboard`
      //
      // `renderModulePage` ends `if (!group || !item) notFound()`, so BOTH
      // roles were 404'd on their own dashboard by the front door. Each pack's
      // own `page.tsx` had it right the whole time — `app/admin/page.tsx`
      // redirects to `/admin/home/operations-dashboard` — so the two answers
      // disagreed, which is the "two literals in two files cannot be
      // type-checked into agreement" failure this repo has paid for repeatedly.
      //
      // 🔴 ADMIN HAS BEEN BROKEN ON PRODUCTION SINCE THE ADR-021 CONSOLIDATION
      // ON 2026-08-13, and the owner is a platform administrator. This is very
      // probably the "access is denied to users" report that the 08-13 handover
      // recorded as unverified against a session-cookie hypothesis.
      //
      // Towing was invisible for a different reason: no production path could
      // write a `towing_operator` membership until migration 080, so the line
      // had never once executed for that role.
      //
      // `landingPathFor` reads the tree the ROUTER resolves against, so the
      // dispatch and the router cannot disagree. `null` only when a workspace
      // is unknown or empty; falling through to the marketplace then is the
      // same safe default this function already uses for an unresolved viewer.
      //
      // 🔴 GRANTS ARE PASSED, AND WITHOUT THEM THIS WOULD 404 A REVOKED
      // ADMINISTRATOR. `adminGroups`' Home group is gated on `platform.admin`,
      // and since migration 078 that permission comes from a grant RECORD
      // rather than the role name — so a `platform_administrator` whose grant
      // was withdrawn still resolves `activeRole = 'platform_administrator'`,
      // still dispatches to the admin pack, and would be sent to a route their
      // own filtered tree hides. `renderModulePage` resolves against the
      // FILTERED tree and would call `notFound()`. Codex asked whether the
      // landing item is ever permission-gated; it is, in exactly one pack, and
      // that pack is the owner's.
      //
      // With no visible landing, `landingPathFor` returns null and this falls
      // through to the marketplace — a page rather than a dead end, which is
      // this repository's standing preference.
      const landing = landingPathFor(
        homeWorkspaceFor(viewer.activeRole),
        Object.values(workspaces),
        viewer.permissions,
      );
      if (landing) redirect(landing);
    }

    // Reached only when the session is live and no role resolved. Two very
    // different causes, and `needsWorkshop` is what separates them:
    //
    //   · the API positively answered "no active membership" -> true, invite.
    //   · the API could not be asked at all (expired access token — `/` is in
    //     `PUBLIC_PATHS` so middleware does not refresh here — or an outage)
    //     -> `registrationStatus` returns null and `needsWorkshop(null)` is
    //     false, so the page renders exactly as it does today.
    //
    // Fail to "unknown", never to "new": the opposite would show an
    // established workshop owner an invitation to set up the account they have
    // had for weeks, every time the API hiccuped.
    needsSetup = needsWorkshop(await registrationStatus('customer'));
  }

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

  // The VIN the visitor typed, if any. Kept OUT of `applied` because it drives
  // no part filter — mixing it in would make `anyFilter` true and hide the
  // catalogue behind a "clear filters" state for somebody who only checked a
  // vehicle.
  const vinQuery = one(params.vin).trim();

  // Rebuilt rather than forwarded: only the parameters the parts endpoint
  // understands are passed on, so an unrecognised query-string key cannot ride
  // through to the API. The API normalises again on its side — this is the
  // outer of two independent checks, not the only one.
  const partsQuery = new URLSearchParams();
  if (applied.q) partsQuery.set('q', applied.q);
  if (applied.make) partsQuery.set('make', applied.make);
  if (applied.model) partsQuery.set('model', applied.model);
  if (applied.year) partsQuery.set('year', applied.year);
  if (applied.manufacturer) partsQuery.set('manufacturer', applied.manufacturer);
  if (applied.category) partsQuery.set('category', applied.category);

  const mechanicQuery = new URLSearchParams();
  if (applied.mechanicQuery) mechanicQuery.set('q', applied.mechanicQuery);

  // Fetched together — four independent reads, and making them sequential would
  // add three round trips to the first page a visitor ever sees.
  // ⚠️ THE VIN LOOKUP JOINS THE SAME `Promise.all`, not a fifth sequential
  // await. It is on the first page a visitor ever sees, and adding a round trip
  // there is the difference between the tool feeling instant and feeling slow.
  // `fetchVin` is only called when something was typed — an empty VIN must not
  // spend a request to be told it is empty.
  const [statsResult, facetsResult, partsResult, mechanicsResult, vinResult] =
    await Promise.all([
      fetchStats(),
      fetchFacets(),
      fetchParts(partsQuery.toString()),
      fetchMechanics(mechanicQuery.toString()),
      vinQuery ? fetchVin(vinQuery) : Promise.resolve(null),
    ]);

  // A failed section is NAMED and the rest of the page still renders. The
  // alternative — one error screen for any failure — means a broken mechanic
  // directory hides a working parts catalogue.
  const problems: string[] = [];
  if (!statsResult.ok) problems.push(`Marketplace totals: ${statsResult.reason}`);
  if (!facetsResult.ok) problems.push(`Search filters: ${facetsResult.reason}`);
  if (!partsResult.ok) problems.push(`Parts: ${partsResult.reason}`);
  if (!mechanicsResult.ok) problems.push(`Mechanics: ${mechanicsResult.reason}`);
  if (vinResult && !vinResult.ok) problems.push(`VIN check: ${vinResult.reason}`);

  return (
    <>
      {/* 🔴 ABOVE THE LANDING, NEVER INSTEAD OF IT. The storefront still
          renders in full for this person — they may be here to buy a filter,
          which needs no organisation at all. This only tells them the other
          door exists, which nothing did before. */}
      {needsSetup && (
        <aside
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            background: themeVar.surfaceRaised,
            borderRadius: primitive.radius.md,
            padding: primitive.space[4],
            margin: `${primitive.space[4]} auto 0`,
            maxWidth: '58rem',
            fontSize: primitive.fontSize.sm,
            color: themeVar.textPrimary,
          }}
        >
          Your account is not attached to an organisation yet.{' '}
          <Link href="/onboarding" style={{ color: themeVar.actionPrimary }}>
            Finish setting it up
          </Link>{' '}
          to run a workshop, sell parts or manage a fleet — or carry on
          browsing, which needs no organisation.
        </aside>
      )}

      <MarketplaceLanding
      stats={statsResult.ok ? statsResult.data : null}
      facets={facetsResult.ok ? facetsResult.data : null}
      parts={partsResult.ok ? partsResult.data.parts : []}
      total={partsResult.ok ? partsResult.data.total : 0}
      mechanics={mechanicsResult.ok ? mechanicsResult.data : []}
      applied={applied}
      vinQuery={vinQuery}
      vinResult={vinResult && vinResult.ok ? vinResult.data : null}
      problems={problems}
      // This app serves the public landing at ITS root. Signed-in visitors are
      // redirected away before reaching here, so `/` is correct for this mount.
      basePath="/"
      // ⚠️ SUPPLIED BY THIS APP, not imported by the package. The basket is
      // customer-web's own client-side store; the shared landing must not know
      // it exists, or it could not be mounted anywhere else.
      // Same host, so a relative path. The apex mount is the one that needs an
      // absolute URL — it reads `CUSTOMER_WEB_URL` (the old
      // `NEXT_PUBLIC_CUSTOMER_WEB_URL` is only a deprecated fallback now) and
      // builds the href with `requestServiceHrefFrom`.
      //
      // The PATH is imported rather than retyped: a route rename would otherwise
      // break this mount silently while the apex kept working, because only one
      // of the two spellings would have been updated.
      requestServiceHref={REQUEST_SERVICE_PATH}
      // 🔴 THESE TWO WERE NEVER PASSED BY ANY CALLER, SO THE WHOLE
      // "Run a workshop, or sell parts?" BAND HAS NEVER RENDERED FOR ANYONE.
      //
      // Measured on production 2026-08-15: the served apex HTML contained
      // neither "Set up your workshop", nor "Register as parts supplier", nor
      // even the band's own heading — and its ONLY outbound links were customer
      // sign-in callbacks. The platform's two revenue-side audiences had no
      // route in from the front door at all. `grep -rn setupWorkshopHref` across
      // apps/ and packages/ returned the component and nothing else.
      //
      // WHY IT WAS OMITTED, AND WHY THAT REASON NO LONGER HOLDS. The prop
      // docstring says the supplier link "points at ANOTHER HOST and is
      // undefined unless SUPPLIER_WEB_URL is configured", because a cross-host
      // callbackUrl once signed people in on the wrong origin and took four
      // reports to find. That was correct when supplier-web was its own Render
      // service. **ADR-021 merged all seven packs into this one application on
      // one origin** — `/supplier/home/dashboard` answers 200 here — so there is
      // no foreign origin left to land on, and no env var to gate on. The guard
      // outlived its hazard.
      //
      // ⚠️ A FIRST DRAFT OF THIS COMMENT SAID `point-web-at-keycloak.yml`
      // "could never set SUPPLIER_WEB_URL again". THAT IS FALSE and Codex
      // caught it: that workflow probes `${CANON}/home/dashboard` and ACCEPTS
      // 3xx (`point-web-at-keycloak.yml:246`), so the apex redirecting the
      // legacy path satisfies it and the variable would be written. The
      // accurate statement is narrower and enough on its own — nothing sets it
      // today, and the band was therefore invisible to every visitor.
      //
      // BOTH POINT AT `/onboarding` — same-origin, and the chooser shipped
      // 2026-08-14 that presents the workshop, supplier, fleet, insurance and
      // towing doors with each one's verification caveat. Deep-linking a single
      // door would be better and is not possible today: the page takes no
      // `searchParams` and its cards carry no anchor ids. Two buttons naming
      // their own audience beats one generic link, and both beat nothing.
      setupWorkshopHref="/onboarding"
      registerSupplierHref="/onboarding"
      basketHref="/customer/parts-and-warranty/parts-orders"
      renderAddToBasket={(part) => (
        <AddToBasket partId={part.id} partName={part.name} hasPrice={part.price !== null} />
      )}
      />
    </>
  );
}
