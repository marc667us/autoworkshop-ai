import { describe, expect, it } from 'vitest';
import {
  cleanLimit,
  cleanOffset,
  cleanText,
  cleanYear,
  escapeLike,
  fitmentCoversYear,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  parsePartsQuery,
} from './catalogue-rules';

/**
 * These rules normalise input from an UNAUTHENTICATED stranger — the only such
 * input in the API. The tests are written against the behaviour that matters at
 * that boundary, not against the implementation.
 */

describe('cleanText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanText('  brake   pads  ')).toBe('brake pads');
  });

  it('returns null for a string that is empty after cleaning', () => {
    // The service tests `!== null`; returning '' would make an empty search box
    // add a predicate matching everything, which is slower and means the same.
    expect(cleanText('   ')).toBeNull();
    expect(cleanText('')).toBeNull();
  });

  it('returns null for non-strings rather than coercing them', () => {
    // `?q[]=a&q[]=b` arrives as an array. String(['a','b']) would be 'a,b' — a
    // search nobody typed.
    expect(cleanText(['a', 'b'])).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });

  it('truncates rather than rejecting an over-long search', () => {
    const long = 'a'.repeat(500);
    expect(cleanText(long)).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('cleanYear', () => {
  it('accepts a year as a string or a number', () => {
    expect(cleanYear('2016')).toBe(2016);
    expect(cleanYear(2016)).toBe(2016);
  });

  it('REJECTS an out-of-range year instead of clamping it', () => {
    // Clamping 1 to 1900 would answer a different question than the one asked
    // and show parts for a car the visitor does not own. Null means "no year
    // filter", which shows MORE parts — visibly wrong rather than silently so.
    expect(cleanYear(1)).toBeNull();
    expect(cleanYear(9999)).toBeNull();
  });

  it('rejects fractional and non-numeric input', () => {
    expect(cleanYear('2016.5')).toBeNull();
    expect(cleanYear('twenty sixteen')).toBeNull();
    expect(cleanYear('')).toBeNull();
  });
});

describe('cleanLimit and cleanOffset', () => {
  it('caps the page size no matter what is asked for', () => {
    expect(cleanLimit(100000)).toBe(MAX_PAGE_SIZE);
  });

  it('falls back to the default for nonsense rather than throwing', () => {
    expect(cleanLimit('all')).toBeGreaterThan(0);
    expect(cleanLimit(-5)).toBeGreaterThan(0);
  });

  it('never returns a negative offset', () => {
    expect(cleanOffset(-1)).toBe(0);
    expect(cleanOffset('x')).toBe(0);
  });
});

describe('escapeLike', () => {
  it('stops a literal % matching the whole catalogue', () => {
    // Not an injection defence — the value is a bound parameter. This is a
    // correctness fix: searching "100%" must not become a wildcard.
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('escapes the single-character wildcard too', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes backslashes FIRST so later escapes are not doubled', () => {
    expect(escapeLike('a\\%')).toBe('a\\\\\\%');
  });
});

describe('fitmentCoversYear', () => {
  it('covers a year inside a closed range', () => {
    expect(fitmentCoversYear(2014, 2019, 2016)).toBe(true);
  });

  it('is inclusive at both ends', () => {
    expect(fitmentCoversYear(2014, 2019, 2014)).toBe(true);
    expect(fitmentCoversYear(2014, 2019, 2019)).toBe(true);
  });

  it('excludes a year outside the range', () => {
    expect(fitmentCoversYear(2014, 2019, 2013)).toBe(false);
    expect(fitmentCoversYear(2014, 2019, 2020)).toBe(false);
  });

  it('treats a NULL year_to as STILL CURRENT, not as unknown', () => {
    // The important one. Reading NULL as "missing" and excluding it would drop
    // every part still in production from every year search — most of the
    // catalogue — and the page would look correct while returning too little.
    expect(fitmentCoversYear(2016, null, 2026)).toBe(true);
    expect(fitmentCoversYear(2016, null, 2016)).toBe(true);
    expect(fitmentCoversYear(2016, null, 2015)).toBe(false);
  });
});

describe('parsePartsQuery', () => {
  it('keeps the vehicle make and the part manufacturer separate', () => {
    // The obvious bug in this module: `make` is who built the CAR, taken from
    // part_fitments; `manufacturer` is who built the PART, taken from
    // parts.brand. Combining them would make "Bosch pads for a Corolla"
    // impossible to express.
    const q = parsePartsQuery({ make: 'Toyota', manufacturer: 'Bosch' });
    expect(q.make).toBe('Toyota');
    expect(q.manufacturer).toBe('Bosch');
  });

  it('leaves every filter null when nothing was asked for', () => {
    const q = parsePartsQuery({});
    expect(q.q).toBeNull();
    expect(q.make).toBeNull();
    expect(q.model).toBeNull();
    expect(q.year).toBeNull();
    expect(q.manufacturer).toBeNull();
    expect(q.category).toBeNull();
  });

  it('ignores unknown keys entirely', () => {
    const q = parsePartsQuery({ tenantId: 'other-tenant', q: 'pads' });
    expect(q.q).toBe('pads');
    expect(Object.keys(q)).not.toContain('tenantId');
  });
});
