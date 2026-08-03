import { redirect } from 'next/navigation';
import { viewerHasSession } from '@autoworkshop/next-shell';
import { MarketplaceLanding } from '@autoworkshop/marketplace-ui';
import { AddToBasket } from './_public/add-to-basket';
import { fetchFacets, fetchMechanics, fetchParts, fetchStats, fetchVin } from '@autoworkshop/marketplace-ui';

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
  if (await viewerHasSession('customer')) {
    redirect('/home/dashboard');
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
      // ⚠️ SUPPLIED BY THIS APP, not imported by the package. The basket is
      // customer-web's own client-side store; the shared landing must not know
      // it exists, or it could not be mounted anywhere else.
      renderAddToBasket={(part) => (
        <AddToBasket partId={part.id} partName={part.name} hasPrice={part.price !== null} />
      )}
    />
  );
}
