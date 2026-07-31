/**
 * Pure input rules for the PUBLIC catalogue (migration 021).
 *
 * Separated from the service, like every other `*-rules.ts` in this repository,
 * so the decisions can be tested without a database. Nothing here touches
 * Postgres and nothing here is async.
 *
 * ⚠️ THIS IS THE ONLY MODULE IN THE API THAT NORMALISES INPUT FROM AN
 * UNAUTHENTICATED STRANGER. Every other controller sits behind `TenantGuard`
 * and can assume a validated Keycloak claim upstream; these endpoints can
 * assume nothing at all. The query string is attacker-controlled in the plain
 * sense — anyone on the internet can send anything.
 *
 * The defence against injection is that the service passes every value as a
 * BOUND PARAMETER and never interpolates one into SQL. What this module does is
 * different and additional: it bounds the SHAPE of the input so a caller cannot
 * ask for a million rows or drive the query with a 4KB string.
 */

/** Hard ceiling on rows returned, whatever the caller asks for. */
export const MAX_PAGE_SIZE = 60;
export const DEFAULT_PAGE_SIZE = 24;

/**
 * Hard ceiling on how far into the result set an anonymous caller may skip.
 *
 * 5000 is ~83 pages of `MAX_PAGE_SIZE`. Nobody browses a parts catalogue that
 * deep; a search that needs to would use the facets. See `cleanOffset` for why
 * an unbounded offset is not free even when it returns nothing.
 */
export const MAX_OFFSET = 5000;

/** Longest free-text search accepted. Longer input is truncated, not rejected —
 *  a stranger typing into a search box should get results, not a 400. */
export const MAX_QUERY_LENGTH = 80;

/** The range a vehicle year may plausibly fall in; mirrors migration 021's CHECK. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

export interface PartsQuery {
  q: string | null;
  /** Vehicle make — Toyota, Ford. Matched against `part_fitments.make`. */
  make: string | null;
  /** Vehicle model — Corolla, Focus. Matched against `part_fitments.model`. */
  model: string | null;
  year: number | null;
  /**
   * The PART's manufacturer — Bosch, MANN, NGK. Matched against `parts.brand`.
   *
   * ⚠️ NOT THE SAME FIELD AS `make`, AND CONFUSING THEM IS THE OBVIOUS BUG HERE.
   * `make` is who built the CAR; `manufacturer` is who built the PART. A driver
   * searching "Toyota" wants parts that FIT a Toyota, which is a fitment
   * lookup; a driver searching manufacturer "Bosch" wants parts BUILT by Bosch,
   * which fits many makes. They are independent filters and combining them
   * ("Bosch pads for a Corolla") is the useful case.
   *
   * Optional by design — the owner's phrasing was "manufacturer if known", and
   * most drivers do not know it. It must never be a required control.
   */
  manufacturer: string | null;
  category: string | null;
  limit: number;
  offset: number;
}

/**
 * Trim, collapse whitespace and cap length. Returns null for anything that is
 * empty after cleaning, so the service can test `!== null` rather than
 * repeating truthiness rules that treat `'0'` and `''` differently.
 */
export function cleanText(value: unknown, maxLength = MAX_QUERY_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, maxLength);
}

/**
 * A vehicle year, or null.
 *
 * ⚠️ REJECTS RATHER THAN CLAMPS, and that distinction is deliberate. Clamping
 * `year=1` to 1900 would silently answer a different question than the one
 * asked and show the visitor parts for a car they do not own. An unparseable or
 * out-of-range year means "no year filter", which shows MORE parts — visibly
 * wrong to the person reading the page, rather than invisibly wrong.
 */
export function cleanYear(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) return null;
  if (n < MIN_YEAR || n > MAX_YEAR) return null;
  return n;
}

/** Page size, bounded to [1, MAX_PAGE_SIZE]. */
export function cleanLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Offset, bounded to [0, MAX_OFFSET].
 *
 * ⚠️ THE OLD COMMENT HERE SAID "No upper bound: deep paging returns nothing,
 * which is correct and costs one index probe." THAT REASONING WAS WRONG, and
 * Codex caught it 2026-07-31. It is true that a large offset RETURNS nothing —
 * `offset=999999999999` was measured returning 200 with zero rows. But the cost
 * is not one index probe:
 *
 *   - `searchParts` runs an uncached `count(*)` over the whole filtered set
 *     BEFORE it pages, so the count is paid in full at every offset;
 *   - Postgres reaches OFFSET n by generating and DISCARDING n rows, so a broad
 *     `ILIKE` search with a huge offset makes the server sort and skip the
 *     entire match set to return an empty page.
 *
 * This controller is unauthenticated and has no rate limit, so that work is
 * reachable by anyone on the internet. Today the catalogue holds 18 published
 * parts and the cost is trivial — this is a latent scaling defect, fixed now
 * because the cap is one line and the incident would not be.
 *
 * CLAMPED, not rejected — the opposite of `cleanYear` above, deliberately.
 * A year is a question about the visitor's CAR and answering a different one
 * shows parts for a car they do not own. An offset is a position in a result
 * list: past the end there is nothing to be wrong about, and every offset above
 * the true total already returns the same empty page. Rejecting would turn a
 * bookmarked deep link into a 400 for no benefit.
 *
 * Genuine deep paging past MAX_OFFSET wants keyset/cursor paging, not a bigger
 * number. If the catalogue ever grows enough for that to matter, change the
 * mechanism rather than raising this constant.
 */
export function cleanOffset(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, MAX_OFFSET);
}

/**
 * Escape the LIKE metacharacters in a user's search term.
 *
 * ⚠️ NOT AN INJECTION DEFENCE — the value is a bound parameter, so it can never
 * become SQL. This is a CORRECTNESS fix: a visitor searching for the literal
 * string "100%" would otherwise have the `%` read as a wildcard and match
 * every part in the catalogue. `\` must be escaped first or it would double up
 * the escapes added after it.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Normalise a whole query string into the shape the service consumes. */
export function parsePartsQuery(raw: Record<string, unknown>): PartsQuery {
  return {
    q: cleanText(raw.q),
    make: cleanText(raw.make, 40),
    model: cleanText(raw.model, 40),
    year: cleanYear(raw.year),
    manufacturer: cleanText(raw.manufacturer, 40),
    category: cleanText(raw.category, 40),
    limit: cleanLimit(raw.limit),
    offset: cleanOffset(raw.offset),
  };
}

/**
 * Does a fitment row cover the requested year?
 *
 * ⚠️ `yearTo === null` MEANS "STILL CURRENT", NOT "UNKNOWN". Treating it as a
 * missing value — the instinct — would exclude every part still in production
 * from every year search, which is most of the catalogue. Exported so the SQL
 * predicate in the service has an executable statement of the same rule to be
 * tested against.
 */
export function fitmentCoversYear(
  yearFrom: number,
  yearTo: number | null,
  year: number,
): boolean {
  if (year < yearFrom) return false;
  if (yearTo === null) return true;
  return year <= yearTo;
}

/**
 * Parse a comma-separated list of part ids from a query string.
 *
 * ⚠️ SILENTLY DROPS ANYTHING THAT IS NOT A UUID rather than rejecting the whole
 * request, because the caller is a basket that may hold a stale id from a
 * previous visit. Failing the lookup would leave the buyer with a basket they
 * cannot render and no way to remove the bad entry; dropping it means the part
 * comes back missing and the basket can say so.
 *
 * Bounded so this cannot become a bulk catalogue export driven by uuid
 * enumeration.
 */
export function cleanIdList(value: unknown, max = MAX_ORDER_LINE_IDS): string[] {
  const raw =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value
        : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
    if (UUID_SHAPE.test(id)) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Matches `MAX_ORDER_LINES` in the marketplace rules — a basket cannot exceed it. */
export const MAX_ORDER_LINE_IDS = 50;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
