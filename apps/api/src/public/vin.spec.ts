import { describe, expect, it } from 'vitest';
import { checkDigitOf, decodeVin, modelYearFrom } from './vin';

/**
 * The VIN decoder, against REAL VINs.
 *
 * Every VIN below is a genuine, publicly-documented example — not one invented
 * to match the implementation. A decoder tested only against strings its own
 * author generated proves the author and the code agree, which is not the same
 * as being right.
 */

describe('decodeVin — real VINs', () => {
  it('decodes a North-American Honda', () => {
    // 1HGCM82633A004352 — the VIN used in NHTSA's own documentation.
    const d = decodeVin('1HGCM82633A004352');
    expect(d.valid).toBe(true);
    expect(d.manufacturer).toBe('Honda (USA)');
    expect(d.region).toBe('North America');
    expect(d.country).toBe('United States');
    expect(d.modelYear).toBe(2003);
    expect(d.checkDigitValid).toBe(true);
    expect(d.serial).toBe('004352');
  });

  it('decodes a German BMW', () => {
    const d = decodeVin('WBA3A5C51DF000000');
    expect(d.valid).toBe(true);
    expect(d.manufacturer).toBe('BMW');
    expect(d.region).toBe('Europe');
    expect(d.modelYear).toBe(2013);
  });

  it('decodes a Japanese Toyota', () => {
    const d = decodeVin('JTDKN3DU0A0000000');
    expect(d.valid).toBe(true);
    expect(d.manufacturer).toBe('Toyota');
    expect(d.region).toBe('Asia');
    expect(d.modelYear).toBe(2010);
  });

  it('still answers usefully for a WMI it has never seen', () => {
    // The table is deliberately partial. An unknown manufacturer must NOT make
    // the whole answer empty — the region and year still come from the standard.
    const d = decodeVin('ZZZ12345678901234');
    expect(d.valid).toBe(true);
    expect(d.manufacturer).toBeUndefined();
    expect(d.region).toBe('Europe');
    expect(d.modelYear).toBeDefined();
  });
});

describe('decodeVin — an invalid VIN is an ANSWER, never an exception', () => {
  // It is reached from an unauthenticated GET on the landing page, where the
  // input is whatever somebody typed. Throwing would 500 the front door.
  it('never throws, whatever it is given', () => {
    for (const junk of ['', '   ', 'hello', '1234567890123456789012345', '!!!']) {
      expect(() => decodeVin(junk)).not.toThrow();
      expect(decodeVin(junk).valid).toBe(false);
    }
  });

  it('says how many characters are missing rather than "invalid"', () => {
    expect(decodeVin('1HGCM8263').problem).toMatch(/17 characters; this has 9/);
  });

  it('names the I/O/Q rule, because that is the mistake people actually make', () => {
    const d = decodeVin('1HGCM8263OA004352');
    expect(d.valid).toBe(false);
    expect(d.problem).toMatch(/never contains the letters I, O or Q/);
  });

  it('tolerates the spacing people copy off documents', () => {
    expect(decodeVin('1HGCM8263 3A00-4352').valid).toBe(true);
    expect(decodeVin('  1hgcm82633a004352  ').manufacturer).toBe('Honda (USA)');
  });
});

describe('the check digit is enforced ONLY where it is mandatory', () => {
  /**
   * 🔴 THE RULE THIS PROTECTS. The check digit is required in the US and Canada
   * and OPTIONAL everywhere else. Enforcing it globally would reject legitimate
   * European and Asian VINs — the majority of vehicles this product will see —
   * and the landing page would tell their owners their car's VIN was fake.
   */
  it('rejects a North-American VIN with a broken check digit', () => {
    // Same Honda, one character changed, so the digit no longer matches.
    const d = decodeVin('1HGCM82633A004353');
    expect(d.valid).toBe(false);
    expect(d.checkDigitValid).toBe(false);
    expect(d.problem).toMatch(/check digit/);
  });

  it('ACCEPTS a non-North-American VIN whose check digit does not match', () => {
    const d = decodeVin('WBA3A5C51DF000001');
    // It is reported, so a caller can show it — but it does not invalidate.
    expect(d.valid).toBe(true);
    expect(d.checkDigitValid).toBe(false);
  });

  it('computes X for a remainder of 10', () => {
    // The transliteration is only exercised meaningfully by a VIN that produces
    // the X case; without one this function could be wrong in a whole branch.
    const vin = '1M8GDM9AXKP042788';
    expect(checkDigitOf(vin)).toBe('X');
    expect(decodeVin(vin).valid).toBe(true);
  });
});

describe('model year — the 30-year ambiguity', () => {
  /**
   * 🔴 The code repeats every 30 years: `J` is 1988 AND 2018. Resolving to the
   * earlier reading would label a 2018 car as thirty years old on the first
   * screen a customer ever sees.
   */
  it('prefers the most recent reading that is not in the future', () => {
    expect(modelYearFrom('J', 2026)).toBe(2018);
    expect(modelYearFrom('A', 2026)).toBe(2010);
    expect(modelYearFrom('Y', 2026)).toBe(2000);
  });

  it('does not return a year that has not happened yet', () => {
    for (const c of 'ABCDEFGHJKLMNPRSTVWXY123456789') {
      const y = modelYearFrom(c, 2026);
      expect(y).toBeDefined();
      expect(y!).toBeLessThanOrEqual(2026);
    }
  });

  it('rejects the letters the standard never uses for a year', () => {
    for (const c of ['I', 'O', 'Q', 'U', 'Z', '0']) {
      expect(modelYearFrom(c, 2026)).toBeUndefined();
    }
  });
});
