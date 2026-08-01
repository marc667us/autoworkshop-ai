import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENCY_SHAPE,
  CatalogueInputError,
  MAX_YEAR,
  MIN_YEAR,
  SLUG_SHAPE,
  SUPPLIER_MEMBER_ROLES,
  SUPPLIER_MEMBER_STATUSES,
  cleanCurrency,
  cleanPrice,
  cleanYearRange,
  optionalText,
  parsePart,
  parsePartPatch,
  parseSupplierApplication,
  parseSupplierPatch,
  requiredText,
  slugify,
} from './catalogue-write-rules';

/**
 * These rules are the FRIENDLY half of a constraint that also exists in
 * Postgres. The database is the enforcement point; this module exists so a
 * supplier gets a sentence rather than `23514 check_violation`.
 *
 * So the tests come in two kinds: the behaviour a human sees, and a DRIFT check
 * that reads the migration SQL. Restating the SQL's values here in a literal
 * would prove only that this file agrees with itself.
 */

describe('required and optional text', () => {
  it('refuses an empty required field rather than storing an empty string', () => {
    // `NOT NULL` does not catch `''` — it is a value. An empty part name is a
    // card with no title on a public page.
    expect(() => requiredText('   ', 'part name', 50)).toThrow(CatalogueInputError);
    expect(() => requiredText(undefined, 'part name', 50)).toThrow(/required/);
  });

  it('treats absent, null and empty as NULL for an optional field', () => {
    // All three must land as SQL NULL, never `''`, or "no brand" and "a brand
    // that is the empty string" become two different states in the data.
    expect(optionalText(undefined, 'brand', 50)).toBeNull();
    expect(optionalText(null, 'brand', 50)).toBeNull();
    expect(optionalText('  ', 'brand', 50)).toBeNull();
  });

  it('bounds length even though the column is TEXT', () => {
    // The column is TEXT deliberately (CLAUDE.md forbids VARCHAR(n) on free
    // text). The bound here is about what one supplier can push onto a page
    // every buyer loads, not about the schema.
    expect(() => requiredText('x'.repeat(51), 'part name', 50)).toThrow(/50 characters/);
  });
});

describe('price', () => {
  it('accepts NULL as quote-only', () => {
    expect(cleanPrice(undefined)).toBeNull();
    expect(cleanPrice('')).toBeNull();
  });

  it('refuses zero, because a card showing 0.00 reads as free', () => {
    expect(() => cleanPrice(0)).toThrow(/greater than zero/);
  });

  it('refuses a negative price', () => {
    expect(() => cleanPrice(-1)).toThrow(CatalogueInputError);
  });

  it('rounds to the 2 decimals the column stores', () => {
    // NUMERIC(14,2) would round this anyway; doing it here means the supplier
    // is shown the number that will actually be saved.
    expect(cleanPrice(10.005)).toBe(10.01);
    expect(cleanPrice('49.999')).toBe(50);
  });

  it('refuses a value that is not a number at all', () => {
    expect(() => cleanPrice('cheap')).toThrow(/must be a number/);
  });
});

describe('currency', () => {
  it('defaults to GHS rather than the column default of GBP', () => {
    // Migration 021 shipped `currency DEFAULT 'GBP'` while the app prices in
    // GHS — recorded as issue 4 in the 07-30 outstanding list and fixed in 022.
    // The API must not reintroduce it by omission.
    expect(cleanCurrency(undefined)).toBe('GHS');
  });

  it('upper-cases a lower-case code instead of refusing it', () => {
    expect(cleanCurrency('ghs')).toBe('GHS');
  });

  it('refuses anything that is not three letters', () => {
    expect(() => cleanCurrency('GH')).toThrow(CatalogueInputError);
    expect(() => cleanCurrency('GH$')).toThrow(CatalogueInputError);
  });
});

describe('fitment year range', () => {
  it('accepts an open-ended range as "still current"', () => {
    expect(cleanYearRange(2015, null)).toEqual({ from: 2015, to: null });
  });

  it('refuses an INVERTED range, whose symptom is silence', () => {
    // An inverted range matches no search. To the supplier that looks like the
    // marketplace being broken, not like their own data being wrong.
    expect(() => cleanYearRange(2018, 2012)).toThrow(/cannot be before/);
  });

  it('refuses years outside the range the CHECK constraint allows', () => {
    expect(() => cleanYearRange(1899, null)).toThrow(CatalogueInputError);
    expect(() => cleanYearRange(2101, null)).toThrow(CatalogueInputError);
  });

  it('refuses a non-integer year', () => {
    expect(() => cleanYearRange('twenty twelve', null)).toThrow(CatalogueInputError);
  });
});

describe('slugify — the supplier cannot change this later', () => {
  it('produces a slug the database CHECK will accept', () => {
    for (const name of ['Abossey Okai Auto Parts', 'A&B  Spares!!', 'Ámé Motors', '123 Parts']) {
      const slug = slugify(name);
      expect(SLUG_SHAPE.test(slug), `${name} -> '${slug}'`).toBe(true);
    }
  });

  it('keeps accented letters as letters rather than dropping them', () => {
    // Stripping combining marks turns "Ámé" into "ame". Removing the whole
    // character would turn it into "m", which is a different company.
    expect(slugify('Ámé Motors')).toBe('ame-motors');
  });

  it('leaves no leading or trailing hyphen, including after truncation', () => {
    const slug = slugify(`${'a'.repeat(59)} tail`);
    expect(slug.startsWith('-')).toBe(false);
    expect(slug.endsWith('-')).toBe(false);
    expect(SLUG_SHAPE.test(slug)).toBe(true);
  });

  it('returns EMPTY for a name with no slug-able characters, rather than a bad slug', () => {
    // The caller must handle this. Returning something like '-' would violate
    // `ck_supplier_slug_shape` at INSERT time, which is a 500 rather than a
    // message about the name.
    expect(slugify('日本語')).toBe('');
    expect(() => parseSupplierApplication({ name: '日本語', country: 'JP' })).toThrow(
      /at least one letter or digit/,
    );
  });
});

describe('a PATCH must not clear what it does not mention', () => {
  it('leaves absent fields out of the patch entirely', () => {
    // The defect this guards is written up twice already in this repo
    // (diagnosis.service, slice 3b updateFinding): treating absent as null
    // wipes every field the form did not send.
    const patch = parsePartPatch({ price: 25 });
    expect(patch).toEqual({ price: 25 });
    expect('brand' in patch).toBe(false);
    expect('description' in patch).toBe(false);
  });

  it('still clears a field sent EXPLICITLY as null', () => {
    // A rule with no way to undo it is the unreachable-escape-hatch problem in
    // miniature: a supplier must be able to remove a wrong brand.
    const patch = parsePartPatch({ brand: null });
    expect('brand' in patch).toBe(true);
    expect(patch.brand).toBeNull();
  });

  it('does not admit is_published through the patch surface', () => {
    // Publication is an administrator decision (024). Even if the trigger were
    // removed, this shape carries no route to it.
    const patch = parsePartPatch({ isPublished: true, name: 'Disc' } as Record<string, unknown>);
    expect(Object.keys(patch)).toEqual(['name']);
  });

  it('does not admit slug, verification or publication on a supplier patch', () => {
    const patch = parseSupplierPatch({
      name: 'Real Name',
      slug: 'hijacked',
      is_verified: true,
      is_published: true,
    } as Record<string, unknown>);
    expect(Object.keys(patch)).toEqual(['name']);
  });
});

describe('parsePart', () => {
  it('defaults inStock to true, matching the column default', () => {
    const part = parsePart({ partNumber: 'BD-1', name: 'Brake Disc' });
    expect(part.inStock).toBe(true);
    expect(part.price).toBeNull();
    expect(part.currency).toBe('GHS');
  });
});

/**
 * DRIFT. Every constant above also exists in SQL. These read the migration text
 * rather than restating it — a test that restated the values would agree with
 * this file forever while the database said something else, which is exactly how
 * `current_role_name() = 'admin'` survived four migrations.
 */
describe('the rules match the migrations they mirror', () => {
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    expect(sqlPath, `could not locate ${name}`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }

  const CATALOGUE = () => migration('021_public_catalogue.sql');
  const ACCOUNTS = () => migration('023_supplier_accounts.sql');

  it('uses the slug shape the CHECK constraint enforces', () => {
    const sql = CATALOGUE();
    expect(sql).toContain("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
    // And the regex here accepts exactly what that pattern describes.
    expect(SLUG_SHAPE.test('abossey-okai-2')).toBe(true);
    expect(SLUG_SHAPE.test('-leading')).toBe(false);
    expect(SLUG_SHAPE.test('Trailing-')).toBe(false);
    expect(SLUG_SHAPE.test('Upper')).toBe(false);
  });

  it('uses the currency shape the CHECK constraint enforces', () => {
    expect(CATALOGUE()).toContain("currency ~ '^[A-Z]{3}$'");
    expect(CURRENCY_SHAPE.test('GHS')).toBe(true);
    expect(CURRENCY_SHAPE.test('ghs')).toBe(false);
  });

  it('uses the year bounds the CHECK constraint enforces', () => {
    const sql = CATALOGUE();
    const found = /year_from BETWEEN (\d+) AND (\d+)/.exec(sql);
    expect(found, 'ck_fitment_year_sane not found in 021').not.toBeNull();
    expect(Number(found?.[1])).toBe(MIN_YEAR);
    expect(Number(found?.[2])).toBe(MAX_YEAR);
  });

  it('carries exactly the supplier member roles and statuses the database accepts', () => {
    const sql = ACCOUNTS();
    const values = (column: string) => {
      const body = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`).exec(sql)?.[1] ?? '';
      return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
    };
    expect(values('member_role')).toEqual([...SUPPLIER_MEMBER_ROLES].sort());
    expect(values('status')).toEqual([...SUPPLIER_MEMBER_STATUSES].sort());
  });

  it('agrees with 024 about which supplier columns a supplier may NOT change', () => {
    // The trigger is the guard; `parseSupplierPatch` simply never offers these.
    // If a column is added to the trigger later, this test says so.
    const sql = migration('024_supplier_catalogue.sql');
    for (const frozen of ['is_published', 'is_verified', 'slug', 'created_by']) {
      expect(sql, `024 should freeze ${frozen}`).toContain(`NEW.${frozen} IS DISTINCT FROM OLD.${frozen}`);
      const patch = parseSupplierPatch({ [frozen]: 'x' } as Record<string, unknown>);
      expect(Object.keys(patch), `${frozen} must not be patchable`).toEqual([]);
    }
  });
});
