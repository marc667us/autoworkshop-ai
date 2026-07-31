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
  id: string;
  tradingName: string;
  city: string;
  country: string;
  services: string[];
  specialisms: string[];
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
