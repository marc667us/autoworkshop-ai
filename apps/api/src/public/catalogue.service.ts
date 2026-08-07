import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  cleanIdList,
  escapeLike,
  parsePartsQuery,
  type PartsQuery,
} from './catalogue-rules';

/**
 * The public catalogue — parts, fitments and the mechanic directory.
 *
 * ⚠️ EVERY QUERY HERE USES `queryWithoutTenant`, WHICH IS NOT A BYPASS.
 * That helper opens a pooled connection with no `app.current_tenant` set. RLS
 * still applies in full: every tenant-owned table's policy compares against a
 * setting that is absent and therefore returns ZERO rows (the fail-closed
 * behaviour asserted in database.integration.spec.ts). Only migration 021's
 * `public_read` policies — which test `is_published` rather than a tenant —
 * return anything. So if a query in this file were ever pointed at a tenant
 * table by mistake, the result is an empty list, not a leak.
 *
 * ⚠️ THE JOIN TO `catalogue.suppliers` IS LOAD-BEARING AND IS NOT DECORATION.
 * Publishing a part does NOT publish its supplier: the two flags are
 * independent, and the database is right to allow a published part under an
 * unpublished supplier (a distributor pulled from the site should not
 * retroactively invalidate its catalogue rows). The RLS policy therefore
 * returns that part, and `infrastructure/migrations/verify/021_public_catalogue.sql`
 * check 7 asserts that it does. Excluding it is THIS layer's job. Drop the
 * join and a withdrawn supplier's parts reappear on the landing page with no
 * error anywhere.
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
  /** Part manufacturers (Bosch, MANN…) — the "manufacturer if known" control. */
  manufacturers: string[];
}

@Injectable()
export class CatalogueService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Search published parts.
   *
   * Filters are ANDed and each is optional. The fitment filters (make / model /
   * year) are applied with EXISTS rather than a JOIN so a part matching two
   * fitments is not returned twice — a DISTINCT would also work but would then
   * have to be carried through the aggregate below.
   */
  async searchParts(raw: Record<string, unknown>): Promise<{ parts: PublicPart[]; total: number }> {
    const q: PartsQuery = parsePartsQuery(raw);

    // Bound parameters only. `where` is assembled from literal fragments this
    // file controls; every VALUE goes through `values` and is never formatted
    // into the string.
    const where: string[] = ['p.is_published', 's.is_published'];
    const values: unknown[] = [];

    if (q.q !== null) {
      values.push(`%${escapeLike(q.q)}%`);
      const i = values.length;
      // ESCAPE '\' must be stated explicitly: it is not Postgres's default for
      // ILIKE, so without it the backslashes added by escapeLike would be
      // matched literally and a search for "100%" would find nothing.
      where.push(
        `(p.name ILIKE $${i} ESCAPE '\\' OR p.brand ILIKE $${i} ESCAPE '\\' OR p.part_number ILIKE $${i} ESCAPE '\\')`,
      );
    }

    if (q.category !== null) {
      values.push(q.category);
      where.push(`c.slug = $${values.length}`);
    }

    // The PART's manufacturer (Bosch, MANN) — a different field from the CAR's
    // make, which is handled by the fitment block below. See PartsQuery.
    // Exact match, case-insensitively: the value comes from the facet list, so
    // a substring match would let "MAN" (the truck maker) also select "MANN".
    if (q.manufacturer !== null) {
      values.push(q.manufacturer);
      where.push(`lower(p.brand) = lower($${values.length})`);
    }

    // Fitment predicates. `year_to IS NULL` means "still current" — see
    // fitmentCoversYear in catalogue-rules.ts for the same rule in executable
    // form, and its spec for why NULL is not "unknown".
    const fit: string[] = [];
    if (q.make !== null) {
      values.push(q.make);
      fit.push(`lower(f.make) = lower($${values.length})`);
    }
    if (q.model !== null) {
      values.push(q.model);
      fit.push(`lower(f.model) = lower($${values.length})`);
    }
    if (q.year !== null) {
      values.push(q.year);
      const i = values.length;
      fit.push(`f.year_from <= $${i} AND (f.year_to IS NULL OR f.year_to >= $${i})`);
    }
    if (fit.length > 0) {
      where.push(
        `EXISTS (SELECT 1 FROM catalogue.part_fitments f WHERE f.part_id = p.id AND ${fit.join(' AND ')})`,
      );
    }

    const whereSql = where.join(' AND ');

    // Total is counted with the SAME predicate, before paging, so the "N parts
    // found" line on the page describes the search rather than the page.
    const countRows = await this.db.queryWithoutTenant<{ total: string }>(
      `SELECT count(*)::text AS total
         FROM catalogue.parts p
         JOIN catalogue.suppliers s ON s.id = p.supplier_id
         JOIN catalogue.part_categories c ON c.id = p.category_id
        WHERE ${whereSql}`,
      values,
    );

    values.push(q.limit);
    const limitParam = values.length;
    values.push(q.offset);
    const offsetParam = values.length;

    const rows = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT p.id, p.part_number, p.name, p.brand, p.description,
              p.price::text AS price, p.currency, p.in_stock,
              c.slug AS category_slug, c.name AS category_name, c.display_order,
              s.name AS supplier_name, s.city AS supplier_city,
              s.country AS supplier_country, s.is_verified AS supplier_verified,
              COALESCE(
                (SELECT array_agg(
                          f.make || ' ' || f.model || ' ' ||
                          f.year_from::text || '–' || COALESCE(f.year_to::text, 'on')
                          ORDER BY f.make, f.model, f.year_from)
                   FROM catalogue.part_fitments f WHERE f.part_id = p.id),
                '{}'
              ) AS fitments
         FROM catalogue.parts p
         JOIN catalogue.suppliers s ON s.id = p.supplier_id
         JOIN catalogue.part_categories c ON c.id = p.category_id
        WHERE ${whereSql}
        ORDER BY c.display_order, p.name
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      values,
    );

    return {
      total: Number(countRows[0]?.total ?? '0'),
      parts: rows.map((r) => ({
        id: String(r.id),
        partNumber: String(r.part_number),
        name: String(r.name),
        brand: (r.brand as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        // Left as a STRING all the way to the page. `numeric(14,2)` does not fit
        // an IEEE double without loss, and a price that renders as 419.99999 is
        // the kind of defect nobody reports and everybody notices.
        price: (r.price as string | null) ?? null,
        currency: String(r.currency),
        inStock: Boolean(r.in_stock),
        categorySlug: String(r.category_slug),
        categoryName: String(r.category_name),
        supplierName: String(r.supplier_name),
        supplierCity: (r.supplier_city as string | null) ?? null,
        supplierCountry: String(r.supplier_country),
        supplierVerified: Boolean(r.supplier_verified),
        fitments: (r.fitments as string[] | null) ?? [],
      })),
    };
  }

  /**
   * The values the search controls may offer.
   *
   * ⚠️ DERIVED FROM `part_fitments`, NOT FROM `core.vehicle_makes`/`vehicle_models`.
   * Two reasons, and the second is the important one. First, `core.vehicle_models`
   * is empty, so a dropdown built from it would be blank. Second — and this
   * would still hold if it were full — those are TENANT tables behind RLS, so a
   * signed-out visitor reading them gets nothing. Deriving from fitments means
   * the dropdown can only ever offer a make or model that actually has parts:
   * every option returns at least one result, by construction.
   */
  async facets(): Promise<CatalogueFacets> {
    const [categories, makes, models, years, manufacturers] = await Promise.all([
      this.db.queryWithoutTenant<{ slug: string; name: string; part_count: string }>(
        // ⚠️ COUNTS s.id, NOT p.id — AND THAT ONE LETTER IS A REAL BUG FIXED.
        // The supplier join is a LEFT JOIN, so a published part under an
        // UNPUBLISHED supplier still produces a row; it just has s.id = NULL.
        // count(p.id) therefore counted the orphan part that verify check 7
        // exists to describe, and the chip read "Filters (4)" while the search
        // it linked to — which inner-joins suppliers — returned 3. Counting
        // s.id ignores the NULL rows and makes the chip agree with its results.
        // Caught by summing the chips (19) against /public/stats (18).
        `SELECT c.slug, c.name, count(s.id)::text AS part_count
           FROM catalogue.part_categories c
           LEFT JOIN catalogue.parts p
             ON p.category_id = c.id AND p.is_published
           LEFT JOIN catalogue.suppliers s
             ON s.id = p.supplier_id AND s.is_published
          GROUP BY c.slug, c.name, c.display_order
          -- Categories with nothing in them are dropped: a chip that reads
          -- "Body & Lighting (0)" is an invitation to a dead end.
         HAVING count(s.id) > 0
          ORDER BY c.display_order`,
        [],
      ),
      this.db.queryWithoutTenant<{ make: string }>(
        `SELECT DISTINCT f.make
           FROM catalogue.part_fitments f
           JOIN catalogue.parts p ON p.id = f.part_id AND p.is_published
           JOIN catalogue.suppliers s ON s.id = p.supplier_id AND s.is_published
          ORDER BY f.make`,
        [],
      ),
      this.db.queryWithoutTenant<{ make: string; model: string }>(
        `SELECT DISTINCT f.make, f.model
           FROM catalogue.part_fitments f
           JOIN catalogue.parts p ON p.id = f.part_id AND p.is_published
           JOIN catalogue.suppliers s ON s.id = p.supplier_id AND s.is_published
          ORDER BY f.make, f.model`,
        [],
      ),
      // The year list spans the whole catalogue's coverage. An open-ended
      // fitment (`year_to IS NULL`) runs to the current year, so the upper
      // bound is taken from the database clock rather than hardcoded — a
      // literal would quietly stop offering the current year next January.
      this.db.queryWithoutTenant<{ year: number }>(
        `SELECT DISTINCT gs.year
           FROM catalogue.part_fitments f
           JOIN catalogue.parts p ON p.id = f.part_id AND p.is_published
           JOIN catalogue.suppliers s ON s.id = p.supplier_id AND s.is_published
           -- ⚠️ THE ::int CASTS ARE LOAD-BEARING. year_from and year_to are
           -- SMALLINT, and generate_series has int/bigint/numeric overloads but
           -- no smallint one — Postgres cannot choose and fails the whole query
           -- with "function generate_series(smallint, smallint) is not unique".
           -- Same family as the uuid/text inference failure in
           -- execution.service.ts: an implicit type the planner will not guess.
           CROSS JOIN LATERAL generate_series(
             f.year_from::int,
             COALESCE(f.year_to, EXTRACT(YEAR FROM now())::smallint)::int
           ) AS gs(year)
          ORDER BY gs.year DESC`,
        [],
      ),
      // Part manufacturers. `brand` is nullable — some parts are unbranded —
      // and a NULL would render as an empty option that silently matches
      // nothing, so it is excluded rather than coalesced to a placeholder.
      this.db.queryWithoutTenant<{ brand: string }>(
        `SELECT DISTINCT p.brand
           FROM catalogue.parts p
           JOIN catalogue.suppliers s ON s.id = p.supplier_id AND s.is_published
          WHERE p.is_published AND p.brand IS NOT NULL
          ORDER BY p.brand`,
        [],
      ),
    ]);

    return {
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        partCount: Number(c.part_count),
      })),
      makes: makes.map((m) => m.make),
      models: models.map((m) => ({ make: m.make, model: m.model })),
      years: years.map((y) => Number(y.year)),
      manufacturers: manufacturers.map((m) => m.brand),
    };
  }

  /**
   * The mechanic directory — free to SEARCH without an account.
   *
   * ⚠️ WHAT THIS DELIBERATELY DOES NOT RETURN: `public_phone`. The spec is that
   * a visitor may search for a mechanic for free but must sign in to USE the
   * feature, and "use" means make contact. If the phone number were in this
   * response, the sign-in prompt on the page would be decoration over data the
   * browser already holds — the same class of mistake as hiding a nav entry and
   * calling it authorization. The contact details are served by a separate
   * guarded endpoint; this one returns what may be browsed.
   */
  async searchMechanics(raw: Record<string, unknown>): Promise<PublicMechanic[]> {
    const q = parsePartsQuery(raw);
    const where: string[] = ['m.is_published'];
    const values: unknown[] = [];

    if (q.q !== null) {
      values.push(`%${escapeLike(q.q)}%`);
      const i = values.length;
      where.push(
        `(m.trading_name ILIKE $${i} ESCAPE '\\' OR m.city ILIKE $${i} ESCAPE '\\'` +
          ` OR EXISTS (SELECT 1 FROM unnest(m.services) sv WHERE sv ILIKE $${i} ESCAPE '\\')` +
          ` OR EXISTS (SELECT 1 FROM unnest(m.specialisms) sp WHERE sp ILIKE $${i} ESCAPE '\\'))`,
      );
    }

    const rows = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT m.id, m.trading_name, m.city, m.country, m.services, m.specialisms
         FROM catalogue.mechanic_directory m
        WHERE ${where.join(' AND ')}
        ORDER BY m.trading_name
        LIMIT $${values.length + 1}`,
      [...values, q.limit],
    );

    return rows.map((r) => ({
      id: String(r.id),
      tradingName: String(r.trading_name),
      city: String(r.city),
      country: String(r.country),
      services: (r.services as string[] | null) ?? [],
      specialisms: (r.specialisms as string[] | null) ?? [],
    }));
  }

  /**
   * Resolve a specific set of parts — what the BASKET renders from.
   *
   * ⚠️ THE BASKET DELIBERATELY STORES ONLY PART IDS AND QUANTITIES, so it needs
   * somewhere to turn those into names and prices. Caching a price in the
   * browser instead would put a number the user can edit next to the thing they
   * are about to buy, and it would go stale the moment a supplier re-prices.
   * Reading them here keeps the displayed price LIVE and unforgeable.
   *
   * It is not a leak of anything: every field returned is already on the public
   * search response, and the same `is_published` gates apply — an id for an
   * unpublished part simply comes back missing, which is what lets the basket
   * say "this part is no longer available" instead of silently dropping it.
   *
   * Bounded by MAX_ORDER_LINES-worth of ids so it cannot be used as a bulk
   * export of the catalogue by someone enumerating uuids.
   */
  async partsByIds(rawIds: unknown): Promise<{ parts: unknown[] }> {
    const ids = cleanIdList(rawIds);
    if (ids.length === 0) return { parts: [] };

    const rows = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT p.id, p.part_number, p.name, p.brand, p.price, p.currency,
              s.id AS supplier_id, s.name AS supplier_name
         FROM catalogue.parts p
         JOIN catalogue.suppliers s ON s.id = p.supplier_id
        WHERE p.id = ANY($1::uuid[]) AND p.is_published AND s.is_published`,
      [ids],
    );

    return {
      parts: rows.map((r) => ({
        id: String(r.id),
        partNumber: String(r.part_number),
        name: String(r.name),
        brand: (r.brand as string | null) ?? null,
        price: r.price === null ? null : String(r.price),
        currency: String(r.currency),
        supplierId: String(r.supplier_id),
        supplierName: String(r.supplier_name),
      })),
    };
  }

  /** The KPI strip. Counts only what a visitor can actually reach. */
  async stats(): Promise<{ parts: number; suppliers: number; countries: number; mechanics: number }> {
    const rows = await this.db.queryWithoutTenant<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM catalogue.parts p
            JOIN catalogue.suppliers s ON s.id = p.supplier_id
           WHERE p.is_published AND s.is_published)::text        AS parts,
         (SELECT count(*) FROM catalogue.suppliers
           WHERE is_published)::text                              AS suppliers,
         (SELECT count(DISTINCT country) FROM catalogue.suppliers
           WHERE is_published)::text                              AS countries,
         (SELECT count(*) FROM catalogue.mechanic_directory
           WHERE is_published)::text                              AS mechanics`,
      [],
    );
    const r = rows[0] ?? {};
    return {
      parts: Number(r.parts ?? '0'),
      suppliers: Number(r.suppliers ?? '0'),
      countries: Number(r.countries ?? '0'),
      mechanics: Number(r.mechanics ?? '0'),
    };
  }

  /**
   * A workshop's PUBLIC profile — slice 6.
   *
   * 🔴 THE ONE SCREEN OUTSIDE THE WORKSPACE THAT READS `core.opening_hours`,
   * and the reason those two tables carry a `public_read` policy at all. The
   * slice's acceptance check is "change opening hours; they appear on the public
   * landing's workshop profile", and without this endpoint that check could not
   * pass however correct the settings screen was.
   *
   * `queryWithoutTenant` — there IS no tenant here; the reader is a stranger.
   * The `public_read` policies in 045 are what decide what comes back, gated on
   * `is_published`, so an unpublished row is invisible rather than filtered in
   * application code. Filtering here as well would be belt and braces; relying
   * on it INSTEAD would be the whole defect.
   */
  async workshopProfile(organizationId: string): Promise<{
    openingHours: { weekday: number; isClosed: boolean; opensAt: string | null; closesAt: string | null }[];
    serviceCategories: { name: string; description: string | null; indicativePrice: string | null; currency: string }[];
  }> {
    const hours = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT weekday, is_closed, opens_at::text AS opens_at, closes_at::text AS closes_at
         FROM core.opening_hours
        WHERE organization_id = $1 AND is_published
        ORDER BY weekday`,
      [organizationId],
    );
    const cats = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT name, description, indicative_price, currency
         FROM core.service_categories
        WHERE organization_id = $1 AND is_published AND is_active
        ORDER BY display_order, name`,
      [organizationId],
    );
    return {
      openingHours: hours.map((h) => ({
        weekday: Number(h.weekday),
        isClosed: h.is_closed as boolean,
        opensAt: (h.opens_at as string | null) ?? null,
        closesAt: (h.closes_at as string | null) ?? null,
      })),
      serviceCategories: cats.map((c) => ({
        name: c.name as string,
        description: (c.description as string | null) ?? null,
        indicativePrice: c.indicative_price === null ? null : String(c.indicative_price),
        currency: c.currency as string,
      })),
    };
  }
  /**
   * The published supplier directory — the marketplace's supply side.
   *
   * PUBLIC and unauthenticated for the same reason the mechanic directory is:
   * finding each other is the free half of the product, and a directory behind a
   * login cannot connect anybody. `is_published` is the whole gate — an
   * unpublished supplier is not someone a workshop can transact with, and the
   * `public_read` policies test exactly that rather than a tenant.
   *
   * ⚠️ NO CONTACT DETAILS. The same rule the mechanic cards follow: the address
   * and phone number are genuinely ABSENT from this response, not hidden in it,
   * so there is nothing for a devtools inspector to reveal.
   */
  async suppliers(): Promise<{ id: string; name: string; city: string | null; country: string | null }[]> {
    // `queryWithoutTenant`, like every other public read in this file — the
    // directory has no tenant by design, and the `public_read` policies gate it
    // on `is_published` instead.
    const rows = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT id, name, city, country
         FROM catalogue.suppliers
        WHERE is_published
        ORDER BY name ASC
        LIMIT 500`,
    );
    // Returns the ROWS directly — not a pg result object. Reading `.rows` off
    // it typechecks as `any` in looser positions and yields undefined at run
    // time, which is the shape of a list that is silently always empty.
    return rows.map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      city: (r['city'] as string | null) ?? null,
      country: (r['country'] as string | null) ?? null,
    }));
  }

}
