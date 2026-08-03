/**
 * VIN DECODING, OFFLINE — the public landing page's hook.
 *
 * Owner request 2026-08-03: the free-to-view landing must let anyone search
 * vehicle and engine information by VIN, show part of the answer, and ask them
 * to sign up for the rest.
 *
 * ── WHY THE OFFLINE DECODE IS THE PRIMARY, NOT THE FALLBACK ────────────────
 *
 * A VIN is not an opaque key. ISO 3779 fixes what several positions MEAN, so
 * make, region, model year and plant code are readable from the 17 characters
 * themselves — no service, no key, no cost, no rate limit, and an answer in
 * microseconds. That matters here more than usual: this runs on the FRONT DOOR
 * of the product, for people who are not signed in and have no reason to be
 * patient. An external lookup on that path makes the magnet as reliable as
 * somebody else's uptime.
 *
 * `vpic.service.ts` adds engine, model and body from the NHTSA service when it
 * is reachable. It ENRICHES this; it never replaces it. If it is slow or down,
 * the page still answers.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CLAIM ──────────────────────────────────
 *
 * Positions 4-8 are the "vehicle descriptor section" and every manufacturer
 * assigns them differently — decoding a model or an engine variant from them
 * requires licensed per-manufacturer tables, which this project does not have
 * and (CLAUDE.md §1) will not buy. So this returns what the standard actually
 * guarantees and says nothing about the rest. A confident wrong engine is worse
 * for a workshop than an honest "not known from the VIN alone".
 */

/** What the 17 characters themselves prove. */
export interface VinDecoded {
  vin: string;
  /** False when the length, alphabet or check digit is wrong. */
  valid: boolean;
  /** Why it is not valid, for a message a human can act on. */
  problem?: string;
  /** World Manufacturer Identifier — positions 1-3. */
  wmi: string;
  manufacturer?: string;
  /** Where it was BUILT, from position 1. Not where it was sold. */
  region?: string;
  country?: string;
  /** Position 10. */
  modelYear?: number;
  /** Position 11 — meaningful only against a manufacturer's own plant list. */
  plantCode?: string;
  /** Positions 12-17. */
  serial?: string;
  /**
   * ⚠️ NORTH-AMERICAN VINs ONLY. The check digit is mandatory in the US and
   * Canada and optional elsewhere, so a European VIN failing it proves nothing.
   * `valid` therefore does NOT depend on it outside that region — treating a
   * legitimate German VIN as fake on the landing page would be worse than not
   * checking at all.
   */
  checkDigitValid?: boolean;
}

/**
 * Position 1 → where the vehicle was built (ISO 3780 region blocks).
 *
 * Ranges, not a per-country table: the second character narrows it to a country
 * and those assignments run to hundreds of entries, most of which this product
 * will never see. The region plus the manufacturer name is what a person
 * actually reads.
 */
const REGION_BY_FIRST: ReadonlyArray<{ match: RegExp; region: string; country?: string }> =
  Object.freeze([
    { match: /^[1-5]$/, region: 'North America' },
    { match: /^1$/, region: 'North America', country: 'United States' },
    { match: /^2$/, region: 'North America', country: 'Canada' },
    { match: /^3$/, region: 'North America', country: 'Mexico' },
    { match: /^[6-7]$/, region: 'Oceania' },
    { match: /^[89]$/, region: 'South America' },
    { match: /^[A-H]$/, region: 'Africa' },
    { match: /^[J-R]$/, region: 'Asia' },
    { match: /^[S-Z]$/, region: 'Europe' },
  ]);

/**
 * WMI (positions 1-3) → manufacturer.
 *
 * A DELIBERATELY PARTIAL LIST, covering what is actually on the road in Ghana:
 * Japanese and Korean imports, German marques, and the American and European
 * makes that arrive used. An unknown WMI returns no manufacturer rather than a
 * guess — and the region still resolves, so the answer is never empty.
 *
 * Not a database table on purpose: these assignments change on the order of
 * years, a migration to add one is heavier than an edit here, and a lookup
 * table in Postgres would put a query on the landing page's critical path for
 * data that never varies per request.
 */
const MANUFACTURER_BY_WMI: Readonly<Record<string, string>> = Object.freeze({
  // Japan
  JHM: 'Honda', JHL: 'Honda', JH4: 'Acura',
  JTD: 'Toyota', JTE: 'Toyota', JTF: 'Toyota', JTG: 'Toyota',
  JTH: 'Lexus', JTJ: 'Lexus', JTK: 'Toyota', JTL: 'Toyota', JTM: 'Toyota', JTN: 'Toyota',
  JN1: 'Nissan', JN6: 'Nissan', JN8: 'Nissan', JNK: 'Infiniti', JNR: 'Infiniti',
  JM1: 'Mazda', JM3: 'Mazda', JMZ: 'Mazda',
  JF1: 'Subaru', JF2: 'Subaru',
  JS2: 'Suzuki', JS3: 'Suzuki',
  JMB: 'Mitsubishi', JA3: 'Mitsubishi', JA4: 'Mitsubishi',
  // Korea
  KMH: 'Hyundai', KM8: 'Hyundai', KMF: 'Hyundai',
  KNA: 'Kia', KND: 'Kia', KNE: 'Kia', KNM: 'Renault Samsung',
  KL1: 'Chevrolet (GM Korea)', KLA: 'Daewoo',
  // Germany
  WVW: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', WVG: 'Volkswagen',
  WAU: 'Audi', WA1: 'Audi', TRU: 'Audi',
  WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i', WMW: 'MINI',
  WDB: 'Mercedes-Benz', WDC: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDF: 'Mercedes-Benz',
  W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz',
  WP0: 'Porsche', WP1: 'Porsche',
  WF0: 'Ford (Europe)',
  // Rest of Europe
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën',
  ZFA: 'Fiat', ZAR: 'Alfa Romeo',
  SAL: 'Land Rover', SAJ: 'Jaguar', SCC: 'Lotus',
  YS3: 'Saab', YV1: 'Volvo', VSS: 'SEAT', TMB: 'Škoda',
  // North America
  '1FA': 'Ford', '1FB': 'Ford', '1FC': 'Ford', '1FD': 'Ford', '1FM': 'Ford', '1FT': 'Ford',
  '2FA': 'Ford (Canada)', '3FA': 'Ford (Mexico)',
  '1G1': 'Chevrolet', '1GC': 'Chevrolet', '1GB': 'Chevrolet', '1GT': 'GMC',
  '1GK': 'GMC', '1G6': 'Cadillac', '1GY': 'Cadillac',
  '1C3': 'Chrysler', '1C4': 'Jeep', '1C6': 'Ram', '2C3': 'Chrysler', '3C4': 'Chrysler',
  '1J4': 'Jeep', '1J8': 'Jeep',
  '1N4': 'Nissan (USA)', '1N6': 'Nissan (USA)', '3N1': 'Nissan (Mexico)',
  '4T1': 'Toyota (USA)', '4T3': 'Toyota (USA)', '5TD': 'Toyota (USA)', '5TF': 'Toyota (USA)',
  '2T1': 'Toyota (Canada)', '2T3': 'Toyota (Canada)',
  '1HG': 'Honda (USA)', '2HG': 'Honda (Canada)', '5FN': 'Honda (USA)', '5J6': 'Honda (USA)',
  '19U': 'Acura', '19X': 'Honda (USA)',
  '5YJ': 'Tesla', '7SA': 'Tesla',
  // India / China, increasingly present as new imports
  MA1: 'Mahindra', MA3: 'Suzuki (India)', MAL: 'Hyundai (India)', MAT: 'Tata',
  LSV: 'Volkswagen (China)', LFV: 'FAW-Volkswagen', LGB: 'Dongfeng', LVS: 'Ford (China)',
  LBV: 'BMW Brilliance', LSG: 'SAIC-GM',
});

/**
 * Position 10 → model year.
 *
 * ⚠️ THE CODE REPEATS EVERY 30 YEARS, so a letter alone is ambiguous — `J` is
 * both 1988 and 2018. Resolved against the current year: the later reading wins
 * whenever it is not in the future. That is right for a workshop, where a 2018
 * vehicle is overwhelmingly more likely to arrive than a 1988 one, and it stops
 * a 2018 car being labelled thirty years old.
 *
 * `I`, `O`, `Q`, `U` and `Z` never appear; `0` is not used for a year.
 */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function modelYearFrom(code: string, now = 2026): number | undefined {
  const i = YEAR_CODES.indexOf(code.toUpperCase());
  if (i === -1) return undefined;
  // The cycle began in 1980 (code A).
  let year = 1980 + i;
  while (year + 30 <= now) year += 30;
  return year;
}

/** Characters a VIN may never contain — I, O and Q, to stop 1/0 confusion. */
const VIN_ALPHABET = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * The North-American check digit (position 9), per 49 CFR 565.
 *
 * Computed for every VIN but only ENFORCED for regions where it is mandatory —
 * see `checkDigitValid` on the interface for why.
 */
const TRANSLIT: Readonly<Record<string, number>> = Object.freeze({
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
});
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function checkDigitOf(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const c = vin[i]!;
    const value = /[0-9]/.test(c) ? Number(c) : (TRANSLIT[c] ?? 0);
    sum += value * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * Decode a VIN from the characters alone. Pure, synchronous, never throws.
 *
 * Never throwing is deliberate: this is reached from an unauthenticated GET on
 * the landing page, where the input is whatever somebody typed. An invalid VIN
 * is an ANSWER — `valid: false` with a problem a person can act on — not an
 * exception, and certainly not a 500 on the front door of the product.
 */
export function decodeVin(raw: string, now = 2026): VinDecoded {
  // Uppercased and stripped of spaces and hyphens: people copy VINs off
  // documents and insurance papers, where they are routinely grouped.
  const vin = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  const base: VinDecoded = { vin, valid: false, wmi: vin.slice(0, 3) };

  if (vin.length !== 17) {
    return {
      ...base,
      problem:
        vin.length < 17
          ? `A VIN has 17 characters; this has ${vin.length}.`
          : `A VIN has 17 characters; this has ${vin.length}.`,
    };
  }
  if (!VIN_ALPHABET.test(vin)) {
    return {
      ...base,
      // Names the actual rule rather than "invalid characters": people
      // mistype 0 for O constantly, and knowing WHY is what lets them fix it.
      problem: 'A VIN never contains the letters I, O or Q — check for a 1 or a 0.',
    };
  }

  const first = vin[0]!;
  const region = REGION_BY_FIRST.filter((r) => r.match.test(first));
  // Last match wins: the country-specific entries are listed after the block
  // ranges deliberately, so `1` resolves to United States rather than stopping
  // at North America.
  const resolved = region[region.length - 1];

  const northAmerican = /^[1-5]$/.test(first);
  const expected = checkDigitOf(vin);
  const checkDigitValid = vin[8] === expected;

  if (northAmerican && !checkDigitValid) {
    return {
      ...base,
      region: resolved?.region,
      country: resolved?.country,
      checkDigitValid: false,
      problem:
        'This VIN fails its own check digit. One character is probably mistyped.',
    };
  }

  return {
    vin,
    valid: true,
    wmi: vin.slice(0, 3),
    manufacturer: MANUFACTURER_BY_WMI[vin.slice(0, 3)],
    region: resolved?.region,
    country: resolved?.country,
    modelYear: modelYearFrom(vin[9]!, now),
    plantCode: vin[10],
    serial: vin.slice(11),
    checkDigitValid,
  };
}
