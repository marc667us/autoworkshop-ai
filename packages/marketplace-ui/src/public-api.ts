import { apiBaseUrl } from '@autoworkshop/auth';

/**
 * Fetch helper for the PUBLIC catalogue endpoints.
 *
 * ⚠️ DELIBERATELY NOT `apiGet` FROM `@autoworkshop/next-shell`. That helper
 * attaches the viewer's Keycloak access token and fails when there is no
 * session — which is every visitor this page exists for. These endpoints take
 * no token, and sending one would not change the response.
 *
 * ⚠️ AND IT MUST NOT BE GIVEN ONE LATER. The API's `PublicController` is the
 * only business controller without `TenantGuard`; what keeps it safe is that it
 * reads nothing tenant-owned. A caller that starts passing credentials here
 * would be the first step toward "just read the customer's vehicles too".
 */

export interface PublicPart {
  id: string;
  partNumber: string;
  name: string;
  brand: string | null;
  description: string | null;
  price: string | null;
  currency: string;
  inStock: boolean;
  categorySlug: string;
  categoryName: string;
  supplierName: string;
  supplierCity: string | null;
  supplierCountry: string;
  supplierVerified: boolean;
  fitments: string[];
}

export interface PublicMechanic {
  /** The DIRECTORY listing's id. Not the workshop. */
  id: string;
  /**
   * The WORKSHOP this listing belongs to — what a service request is addressed
   * to. Distinct from `id`, and conflating them was a real defect: the Request
   * for Service link passed the listing id and every request would have been
   * refused with "that workshop was not found".
   */
  organizationId: string;
  tradingName: string;
  city: string;
  country: string;
  services: string[];
  specialisms: string[];
}

export interface PublicInsuranceProduct {
  id: string;
  insurer: string;
  name: string;
  summary: string | null;
  coverType: string;
  /** A STRING. `numeric` loses precision through `number`, and this is money. */
  premium: string;
  currency: string;
  termMonths: number;
  excess: string | null;
  termsUrl: string | null;
}

export interface CatalogueFacets {
  categories: { slug: string; name: string; partCount: number }[];
  makes: string[];
  models: { make: string; model: string }[];
  years: number[];
  manufacturers: string[];
}

export interface CatalogueStats {
  parts: number;
  suppliers: number;
  countries: number;
  mechanics: number;
}

export type PublicResult<T> = { ok: true; data: T } | { ok: false; reason: string };

async function get<T>(path: string): Promise<PublicResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/v1/public${path}`, {
      // The catalogue changes when a supplier publishes, not per request. But
      // `no-store` is correct HERE because the search results depend on the
      // query string and a cached empty result would outlive the fix for it.
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, reason: `The parts service answered ${res.status}.` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    // The reason is deliberately vague to the VISITOR and specific in kind: a
    // stranger cannot act on a connection error, and the alternative — printing
    // the API's host and port on a public page — describes the internal network
    // to anyone who loads it.
    return { ok: false, reason: 'The parts service is not reachable right now.' };
  }
}

export function fetchParts(search: string): Promise<PublicResult<{ parts: PublicPart[]; total: number }>> {
  return get(`/parts${search ? `?${search}` : ''}`);
}

export function fetchFacets(): Promise<PublicResult<CatalogueFacets>> {
  return get('/parts/facets');
}

export function fetchMechanics(search: string): Promise<PublicResult<PublicMechanic[]>> {
  return get(`/mechanics${search ? `?${search}` : ''}`);
}

export function fetchStats(): Promise<PublicResult<CatalogueStats>> {
  return get('/stats');
}

/**
 * The FREE half of a VIN lookup — what a signed-out visitor may see.
 *
 * ⚠️ IT IS THE ENDPOINT THAT WITHHOLDS THE REST, NOT THIS FUNCTION AND NOT THE
 * PAGE. `/public/vin/:vin` returns manufacturer, region, country and year and
 * simply does not send engine, plant or serial. If this ever appears to be
 * "filtering" a fuller response, something has gone wrong at the API — a page
 * that receives the full decode and renders half of it has no gate at all.
 *
 * The signed-in half is `GET /vin/:vin`, which needs a token and therefore uses
 * `apiGet` from next-shell, not this helper.
 */
export interface PublicVin {
  vin: string;
  valid: boolean;
  problem?: string;
  manufacturer?: string;
  region?: string;
  country?: string;
  modelYear?: number;
  /** Named field by field, so "see more" is not a request to register on faith. */
  moreAvailable?: string[];
}

export function fetchVin(vin: string): Promise<PublicResult<PublicVin>> {
  // Encoded because it reaches a URL PATH and the value is whatever somebody
  // typed into a public form. The API validates the alphabet again on its side.
  return get(`/vin/${encodeURIComponent(vin.trim().toUpperCase())}`);
}

/**
 * The published insurance products — slice 17, the shopper's half.
 *
 * The endpoint has been anonymous since 082 and NO SCREEN IN THE PRODUCT
 * RENDERED IT until this was added: the insurer could list, the platform could
 * levy, and the shopper could not see any of it.
 */
export function fetchInsuranceProducts(): Promise<PublicResult<PublicInsuranceProduct[]>> {
  return get('/insurance-products');
}

/**
 * One product, for the detail page.
 *
 * 🔴 IT DISTINGUISHES "NOT LISTED" FROM "COULD NOT ASK", and the caller must
 * keep them apart. The detail page originally mapped BOTH to `notFound()`, so a
 * perfectly live product would have rendered as nonexistent for the duration of
 * an API outage — telling a shopper a real insurer's cover does not exist. That
 * is worse than an error page, because it is a confident wrong answer. Caught by
 * Codex, 2026-08-19.
 *
 * `get()` cannot make this distinction for every caller — a 404 from the parts
 * search means something different — so it is drawn here, where the route's own
 * semantics are known: the API answers 404 for a product that is absent,
 * unpublished or unverified, and those are genuinely one answer by design.
 */
export async function fetchInsuranceProduct(
  id: string,
): Promise<
  | { ok: true; data: PublicInsuranceProduct }
  | { ok: false; missing: true }
  | { ok: false; missing: false; reason: string }
> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/api/v1/public/insurance-products/${encodeURIComponent(id)}`,
      { cache: 'no-store', headers: { accept: 'application/json' } },
    );
    if (res.status === 404) return { ok: false, missing: true };
    if (!res.ok) {
      return { ok: false, missing: false, reason: `The insurance service answered ${res.status}.` };
    }
    return { ok: true, data: (await res.json()) as PublicInsuranceProduct };
  } catch {
    return { ok: false, missing: false, reason: 'The insurance service is not reachable right now.' };
  }
}

/**
 * Lodge an enquiry with the insurer — the ONLY write on this public surface.
 *
 * ⚠️ THE ONE POST IN A FILE OF GETs, AND IT IS ON A DIFFERENT CONTROLLER.
 * `PublicController` states "nothing here writes" as part of what makes it safe
 * unguarded; the API keeps that true by serving this from
 * `PublicInsuranceController` instead. What makes the write safe is in the
 * database — `insurance.submit_enquiry()` derives the tenant, organisation and
 * price from the product, and 086's INSERT policy adjudicates the row
 * relationally rather than with `WITH CHECK (true)`.
 *
 * ⚠️ NOTHING HERE NAMES AN INSURER, A TENANT OR AN AMOUNT, and nothing may be
 * added that does. Those are derived server-side precisely so a caller cannot
 * choose them.
 */
export async function submitInsuranceEnquiry(input: {
  productId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  vehicleRegistration?: string;
  message?: string;
}): Promise<PublicResult<{ received: true }>> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/v1/public/insurance-enquiries`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      // 🔴 THE REFUSAL IS READ OUT OF THE BODY WHERE THERE IS ONE. The API's
      // 404 for an unlisted product names what the visitor can do instead
      // ("browse the published products"), and replacing that with a status
      // code would throw away the only actionable half of the answer — the
      // failure this repository records as its most expensive class.
      let reason = `The insurance service answered ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const m = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
        if (m) reason = m;
      } catch {
        // A non-JSON error body is not itself an error; the status stands.
      }
      return { ok: false, reason };
    }
    return { ok: true, data: (await res.json()) as { received: true } };
  } catch {
    return { ok: false, reason: 'The insurance service is not reachable right now.' };
  }
}
