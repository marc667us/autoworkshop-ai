import { MarketplaceLanding } from '../../_public/marketplace-landing';
import { fetchFacets, fetchMechanics, fetchParts, fetchStats, fetchVin } from '../../_public/public-api';

/**
 * `/marketplace` — THE PUBLIC LANDING, REACHABLE WHILE SIGNED IN.
 *
 * Owner request 2026-08-03: "user must be able [to] access the landing even
 * when logged in by clicking [the] autoworkshop logo".
 *
 * ⚠️ WHY A SECOND ROUTE INSTEAD OF LOOSENING `/`. `/` must keep sending a
 * signed-in person to their dashboard — §18 makes the dashboard the default
 * landing for a workspace, and taking that away would mean every returning
 * customer arrives at a shop window instead of their own vehicles and orders.
 * But the parts marketplace is not marketing: it is the STORE, and a customer
 * who signs in loses the ability to browse it. Two addresses, two intentions,
 * one page.
 *
 * The wordmark in the top bar points here (`brandHref`), which is the
 * convention every storefront already uses.
 *
 * ⚠️ INSIDE THE `(app)` GROUP, SO IT KEEPS THE SHELL — and that was a fix, not
 * the first instinct. Placed outside it, the page rendered with NO TOP BAR AT
 * ALL: a signed-in customer could reach the store and then had no wordmark, no
 * sign-out and no navigation back to their own vehicles. Caught by a browser
 * check asserting the session "survives the trip", which read the landing's own
 * hero <header> and found no Sign out in it. Reaching a destination you cannot
 * leave is not access.
 *
 * It renders the SAME `MarketplaceLanding` from the SAME public endpoints, so
 * a signed-in visitor sees exactly what an anonymous one does. That is
 * deliberate: this page must never become a second, subtly different catalogue
 * that can disagree with the public one.
 */
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/** First value only — `?make=Ford&make=Kia` must not become "Ford,Kia". */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function Marketplace({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  // ⚠️ NO REDIRECT. That single omission is the entire difference between this
  // route and `/`, and it is the point of the route.

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
