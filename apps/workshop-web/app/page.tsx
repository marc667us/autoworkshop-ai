import {
  MarketplaceLanding,
  fetchFacets,
  fetchMechanics,
  fetchParts,
  fetchStats,
  fetchVin,
} from '@autoworkshop/marketplace-ui';

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
 * ── NO BASKET HERE ─────────────────────────────────────────────────────────
 *
 * `renderAddToBasket` is omitted. The basket belongs to `customer-web`; a
 * workshop's staff browse the catalogue and buy through procurement, not a
 * consumer basket. The shared component renders cards without the button rather
 * than showing one that goes nowhere.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** First value only — `?make=Ford&make=Kia` must not become "Ford,Kia". */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function Index({ searchParams }: { searchParams?: Promise<SearchParams> }) {
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
      stats={statsResult.ok ? statsResult.data : null}
      facets={facetsResult.ok ? facetsResult.data : null}
      parts={partsResult.ok ? partsResult.data.parts : []}
      total={partsResult.ok ? partsResult.data.total : 0}
      mechanics={mechanicsResult.ok ? mechanicsResult.data : []}
      applied={applied}
      vinQuery={vinQuery}
      vinResult={vinResult && vinResult.ok ? vinResult.data : null}
      problems={problems}
    />
  );
}
