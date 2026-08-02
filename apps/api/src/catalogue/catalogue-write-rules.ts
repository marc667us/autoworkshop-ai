/**
 * Pure input rules for CATALOGUE WRITES — Slice B (migrations 024, 025, 026).
 *
 * `public/catalogue-rules.ts` normalises what a stranger may READ. This module
 * normalises what a supplier may WRITE, which is a different problem: the
 * reader's input decides which rows come back, the writer's input becomes rows
 * other people will read and buy from.
 *
 * Separated from the service like every other `*-rules.ts` here, so the
 * decisions are testable without a database — and, more importantly, so the
 * lists below can be compared to the migration SQL by a drift test. Every
 * constraint here EXISTS IN POSTGRES TOO. That duplication is deliberate and is
 * the repository's standing pattern: the database is the enforcement point, and
 * these rules exist so a supplier gets a sentence explaining what is wrong
 * instead of a raw `23514 check_violation`.
 *
 * ⚠️ NOTHING HERE IS A SECURITY CONTROL. Who may write which row is decided by
 * RLS and the column-guard triggers, which deny independently of anything this
 * file returns. If a rule here disagrees with the database, the database wins
 * and the user sees an unfriendly error — a bug, but never a breach.
 */

/** Mirrors `ck_supplier_slug_shape` in migration 021. */
export const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Mirrors `ck_part_currency_shape` in migration 021. */
export const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/** Mirrors `ck_fitment_year_sane` in migration 021. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** Mirrors `ck_supplier_member_role` / `ck_supplier_member_status` in 023. */
export const SUPPLIER_MEMBER_ROLES = ['owner', 'staff'] as const;
export const SUPPLIER_MEMBER_STATUSES = ['active', 'revoked'] as const;

/**
 * Free-text ceilings.
 *
 * The COLUMNS are `TEXT`, deliberately — CLAUDE.md forbids `VARCHAR(n)` on
 * free text after Solar's truncation incident, where narrow columns met
 * generated content and silently cut it. Bounding the input here is therefore
 * not a schema constraint in disguise; it is a limit on what one supplier can
 * push into a page every buyer loads. A 40KB description would render.
 */
export const MAX_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_PART_NUMBER_LENGTH = 100;
export const MAX_BRAND_LENGTH = 120;

/** Raised when input cannot become a valid row. Carries a human sentence. */
export class CatalogueInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueInputError';
  }
}

/**
 * A real boolean, never a coercion.
 *
 * 🔴 `Boolean('false') === true`. `inStock` was read with `Boolean(raw['inStock'])`,
 * so a client marking a part OUT OF STOCK with the string `"false"` — the exact
 * thing a form post or a loosely-typed API client sends — set it IN STOCK.
 * `Boolean('0')`, `Boolean({})` and `Boolean([])` are all `true` too, so every
 * near-miss failed in the direction that keeps a part on sale.
 *
 * Found by Codex after the same bug was fixed on the three publication routes;
 * this one had been missed. Same trap as slice 9's quality gate, where a
 * coercing parse would have turned "the complaint was NOT addressed" into a
 * pass. Enumerate what is accepted; never reinterpret.
 */
export function strictBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new CatalogueInputError(`${field} must be true or false`);
  }
  return value;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A required free-text field.
 *
 * Rejects empty rather than storing `''`. An empty part name is a card with no
 * title on a public page, and `NOT NULL` does not catch it — the empty string
 * is a value.
 */
export function requiredText(value: unknown, field: string, max: number): string {
  const v = text(value);
  if (v === '') throw new CatalogueInputError(`${field} is required`);
  if (v.length > max) {
    throw new CatalogueInputError(`${field} must be ${max} characters or fewer`);
  }
  return v;
}

/** An optional free-text field. Absent and empty both mean NULL, never `''`. */
export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  const v = text(value);
  if (v === '') return null;
  if (v.length > max) {
    throw new CatalogueInputError(`${field} must be ${max} characters or fewer`);
  }
  return v;
}

/**
 * A price.
 *
 * NULL is legal and means "quote only" (021). Zero is NOT: `ck_part_price_positive`
 * refuses it in the database, and the reason is presentational as much as
 * numeric — a card showing 0.00 reads as "free" to a buyer.
 *
 * Rounded to 2 decimals to match `NUMERIC(14,2)`. Sending 10.005 would otherwise
 * be stored as 10.01 by Postgres and the supplier would see a price they did not
 * type.
 */
export function cleanPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new CatalogueInputError('price must be a number');
  if (n <= 0) {
    throw new CatalogueInputError('price must be greater than zero, or left blank for quote-only');
  }
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 99_999_999_999.99) throw new CatalogueInputError('price is too large');
  return rounded;
}

/** A three-letter currency code, upper-cased for the caller's convenience. */
export function cleanCurrency(value: unknown, fallback = 'GHS'): string {
  if (value === undefined || value === null || value === '') return fallback;
  const v = text(value).toUpperCase();
  if (!CURRENCY_SHAPE.test(v)) {
    throw new CatalogueInputError('currency must be a three-letter code, such as GHS');
  }
  return v;
}

/**
 * A fitment year range.
 *
 * `to` is nullable and means "still current". An INVERTED range is refused here
 * as well as by `ck_fitment_year_order`, because the symptom of an inverted
 * range is not an error — it is a part that silently matches no search, which
 * reads to the supplier as "the marketplace is broken".
 */
export function cleanYearRange(from: unknown, to: unknown): { from: number; to: number | null } {
  const f = Number(from);
  if (!Number.isInteger(f) || f < MIN_YEAR || f > MAX_YEAR) {
    throw new CatalogueInputError(`the first year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  if (to === undefined || to === null || to === '') return { from: f, to: null };
  const t = Number(to);
  if (!Number.isInteger(t) || t < MIN_YEAR || t > MAX_YEAR) {
    throw new CatalogueInputError(`the last year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  if (t < f) {
    throw new CatalogueInputError(
      'the last year cannot be before the first year — a part with an inverted range matches nothing',
    );
  }
  return { from: f, to: t };
}

/**
 * Derive a URL slug from a supplier's name.
 *
 * ⚠️ DERIVED, NEVER ACCEPTED FROM THE CLIENT. Migration 024 freezes `slug`
 * against supplier edits because it is the public URL and changing it breaks
 * every link already shared. A field the supplier cannot change later must not
 * be a field they can choose freely at creation either — otherwise the one
 * chance to get it wrong is unguarded and the only remedy is an administrator.
 *
 * Returns `''` when the name has no slug-able characters at all (e.g. a name
 * written entirely in a non-Latin script). The caller must handle that rather
 * than storing an empty slug, which would violate `ck_supplier_slug_shape`.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    // Strip combining marks so "Ámé" becomes "Ame" rather than losing the letters.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, '');
}

export interface SupplierApplicationInput {
  name: string;
  country: string;
  city: string | null;
  website: string | null;
}

export function parseSupplierApplication(raw: Record<string, unknown>): SupplierApplicationInput {
  const name = requiredText(raw['name'], 'supplier name', MAX_NAME_LENGTH);
  if (slugify(name) === '') {
    throw new CatalogueInputError(
      'the supplier name must contain at least one letter or digit that can form a web address',
    );
  }
  return {
    name,
    country: requiredText(raw['country'], 'country', 80),
    city: optionalText(raw['city'], 'city', 120),
    website: optionalText(raw['website'], 'website', 300),
  };
}

export interface PartInput {
  partNumber: string;
  name: string;
  brand: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  inStock: boolean;
}

export function parsePart(raw: Record<string, unknown>): PartInput {
  return {
    partNumber: requiredText(raw['partNumber'], 'part number', MAX_PART_NUMBER_LENGTH),
    name: requiredText(raw['name'], 'part name', MAX_NAME_LENGTH),
    brand: optionalText(raw['brand'], 'brand', MAX_BRAND_LENGTH),
    description: optionalText(raw['description'], 'description', MAX_DESCRIPTION_LENGTH),
    price: cleanPrice(raw['price']),
    currency: cleanCurrency(raw['currency']),
    // Absent means IN STOCK, matching the column default. A supplier adding a
    // part is adding something they have.
    inStock: raw['inStock'] === undefined ? true : strictBoolean(raw['inStock'], 'inStock'),
  };
}

/**
 * A PARTIAL part update: absent means "leave alone", it does not mean "clear".
 *
 * ⚠️ THE DISTINCTION IS THE WHOLE FUNCTION. A PATCH that treated absent as null
 * would wipe every field the form did not send — the defect this repository has
 * already written up twice, in `diagnosis.service.ts` and in slice 3b's
 * `updateFinding`. `null` sent EXPLICITLY still clears, because a supplier must
 * be able to remove a wrong brand, and a rule with no way to undo it is the
 * unreachable-escape-hatch problem in miniature.
 */
export function parsePartPatch(raw: Record<string, unknown>): Partial<PartInput> {
  const patch: Partial<PartInput> = {};
  if ('partNumber' in raw) {
    patch.partNumber = requiredText(raw['partNumber'], 'part number', MAX_PART_NUMBER_LENGTH);
  }
  if ('name' in raw) patch.name = requiredText(raw['name'], 'part name', MAX_NAME_LENGTH);
  if ('brand' in raw) patch.brand = optionalText(raw['brand'], 'brand', MAX_BRAND_LENGTH);
  if ('description' in raw) {
    patch.description = optionalText(raw['description'], 'description', MAX_DESCRIPTION_LENGTH);
  }
  if ('price' in raw) patch.price = cleanPrice(raw['price']);
  if ('currency' in raw) patch.currency = cleanCurrency(raw['currency']);
  if ('inStock' in raw) patch.inStock = strictBoolean(raw['inStock'], 'inStock');
  return patch;
}

/**
 * The fields a supplier may change on its own profile.
 *
 * ⚠️ MIRRORS THE TRIGGER IN 024, WHICH IS THE ACTUAL GUARD. `slug`,
 * `is_published`, `is_verified`, `created_by` and `id` are frozen there and are
 * simply absent here — a supplier sending them gets them ignored rather than a
 * refusal, because the alternative is a form that fails when a browser helpfully
 * posts a hidden field.
 */
export const SUPPLIER_EDITABLE_FIELDS = ['name', 'country', 'city', 'website'] as const;

export function parseSupplierPatch(raw: Record<string, unknown>): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if ('name' in raw) patch['name'] = requiredText(raw['name'], 'supplier name', MAX_NAME_LENGTH);
  if ('country' in raw) patch['country'] = requiredText(raw['country'], 'country', 80);
  if ('city' in raw) patch['city'] = optionalText(raw['city'], 'city', 120);
  if ('website' in raw) patch['website'] = optionalText(raw['website'], 'website', 300);
  return patch;
}
