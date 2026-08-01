/**
 * Pure input rules for the workshop's PRICING — Slice D.
 *
 * Every constraint here exists in PostgreSQL too, on
 * `repair.organization_pricing` (migration 016). That duplication is this
 * repository's standing pattern and it is deliberate: the database is the
 * enforcement point, and these rules exist so an owner gets a sentence
 * explaining what is wrong instead of a raw `23514 check_violation`.
 *
 * ⚠️ NOTHING HERE IS A SECURITY CONTROL. Who may write this row is decided by
 * migration 029's `owner_write` / `owner_update` policies, which key on the
 * ORGANIZATION and the ROLE together and deny independently of anything this
 * file returns. If a rule here disagrees with the database, the database wins
 * and the owner sees an unfriendly error — a bug, never a breach.
 */

export class PricingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingInputError';
  }
}

/** Mirrors `organization_pricing_currency_check`. */
export const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/** Mirrors `organization_pricing_default_validity_days_check`. */
export const MIN_VALIDITY_DAYS = 1;
export const MAX_VALIDITY_DAYS = 365;

/**
 * A ceiling on the labour rate, and it is NOT in the database.
 *
 * The column's own CHECK is only `>= 0`, which is right — there is no
 * defensible universal maximum hourly rate, and a schema that guessed one would
 * eventually refuse a legitimate workshop. But `numeric(14,2)` accepts values
 * with eleven digits before the decimal point, and a mistyped rate silently
 * becomes every subsequent quotation's labour cost.
 *
 * So this is a TYPO GUARD living at the application boundary where a human can
 * be told about it, not a business rule pretending to be one. Stated as its own
 * constant with this reasoning so nobody later "aligns" it into a migration.
 */
export const MAX_SANE_LABOUR_RATE = 100_000;

/** Mirrors `organization_pricing_tax_rate_percent_check`. */
export const MIN_TAX_PERCENT = 0;
export const MAX_TAX_PERCENT = 100;

/** Free-text ceiling on the warranty terms. The COLUMN is `TEXT` (CLAUDE.md). */
export const MAX_WARRANTY_TERMS = 2000;

export interface PricingInput {
  currency: string;
  defaultLabourRate: number;
  taxName: string;
  taxRatePercent: number;
  defaultValidityDays: number;
  defaultWarrantyTerms: string | null;
}

/**
 * A number from form input.
 *
 * ⚠️ `Number('')` IS 0, NOT NaN, and that is the trap this function exists for.
 * An HTML form submits an empty field as `''`, so a naive `Number(raw)` turns a
 * field the owner CLEARED into a labour rate of ZERO — silently, and with every
 * later quotation charging nothing for labour. Empty is rejected as missing.
 *
 * `Number(' ')` is also 0, and `Number('12abc')` is NaN; both are covered by
 * trimming first and testing `Number.isFinite`.
 */
function requiredNumber(raw: unknown, field: string): number {
  if (raw === undefined || raw === null) {
    throw new PricingInputError(`${field} is required`);
  }
  const text = String(raw).trim();
  if (text === '') {
    throw new PricingInputError(`${field} is required`);
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new PricingInputError(`${field} must be a number`);
  }
  return value;
}

function requiredText(raw: unknown, field: string, max: number): string {
  const text = String(raw ?? '').trim();
  if (text === '') throw new PricingInputError(`${field} is required`);
  if (text.length > max) {
    throw new PricingInputError(`${field} must be ${max} characters or fewer`);
  }
  return text;
}

/**
 * Normalise and check everything an owner submitted.
 *
 * Validates the WHOLE object rather than returning at the first problem — an
 * owner who mistyped two fields should be told about both, not sent round the
 * loop twice. The messages name the field and the acceptable range, because
 * "invalid input" is not something anyone can act on.
 */
export function parsePricingInput(raw: Record<string, unknown>): PricingInput {
  // ⚠️ EVERY PROBLEM IS COLLECTED, AND THIS USED TO BE A LIE. The comment above
  // promised whole-object validation while the code threw on the FIRST bad
  // field — caught by Codex. That is this repository's most-repeated defect: a
  // confident comment that stops the next reader checking. The comment described
  // the better behaviour, so the behaviour was fixed to match it rather than the
  // sentence being quietly weakened.
  const problems: string[] = [];

  /** Runs a check, records its message, and yields a fallback so parsing continues. */
  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof PricingInputError) {
        problems.push(err.message);
        return fallback;
      }
      throw err;
    }
  };

  const currency = String(raw['currency'] ?? '')
    .trim()
    // Uppercased rather than rejected: `ghs` is unambiguously GHS, and refusing
    // it would be pedantry the CHECK constraint does not require us to inflict.
    .toUpperCase();
  if (!CURRENCY_SHAPE.test(currency)) {
    problems.push('currency must be a three-letter ISO code, for example GHS, NGN or USD');
  }

  // `NaN` as the fallback, deliberately: it fails every comparison below, so a
  // field that could not be parsed cannot then trip a SECOND, misleading
  // message about being out of range.
  const defaultLabourRate = attempt(
    () => requiredNumber(raw['defaultLabourRate'], 'the labour rate'),
    Number.NaN,
  );
  if (defaultLabourRate < 0) {
    problems.push('the labour rate cannot be negative');
  } else if (defaultLabourRate > MAX_SANE_LABOUR_RATE) {
    problems.push(
      `the labour rate looks like a typo — ${MAX_SANE_LABOUR_RATE.toLocaleString()} per hour is the ` +
        'highest this screen accepts. Contact support if it is genuinely higher.',
    );
  }

  const taxRatePercent = attempt(
    () => requiredNumber(raw['taxRatePercent'], 'the tax rate'),
    Number.NaN,
  );
  if (taxRatePercent < MIN_TAX_PERCENT || taxRatePercent > MAX_TAX_PERCENT) {
    problems.push(`the tax rate must be between ${MIN_TAX_PERCENT} and ${MAX_TAX_PERCENT} percent`);
  }

  const defaultValidityDays = attempt(
    () => requiredNumber(raw['defaultValidityDays'], 'the quotation validity'),
    Number.NaN,
  );
  if (Number.isFinite(defaultValidityDays)) {
    if (!Number.isInteger(defaultValidityDays)) {
      problems.push('the quotation validity must be a whole number of days');
    } else if (
      defaultValidityDays < MIN_VALIDITY_DAYS ||
      defaultValidityDays > MAX_VALIDITY_DAYS
    ) {
      problems.push(
        `the quotation validity must be between ${MIN_VALIDITY_DAYS} and ${MAX_VALIDITY_DAYS} days`,
      );
    }
  }

  const taxName = attempt(() => requiredText(raw['taxName'], 'the tax name', 40), '');

  const warranty = String(raw['defaultWarrantyTerms'] ?? '').trim();
  if (warranty.length > MAX_WARRANTY_TERMS) {
    problems.push(`the warranty terms must be ${MAX_WARRANTY_TERMS} characters or fewer`);
  }

  if (problems.length > 0) {
    // Joined into one sentence because the screen renders a single message. The
    // separator is "; " rather than a newline so it survives being placed in a
    // paragraph without collapsing into an unreadable run-on.
    throw new PricingInputError(problems.join('; '));
  }

  return {
    currency,
    defaultLabourRate,
    taxName,
    taxRatePercent,
    defaultValidityDays,
    // Empty means "no standard terms", which is a legitimate answer and must be
    // stored as NULL rather than as an empty string that renders as a blank
    // clause on a quotation.
    defaultWarrantyTerms: warranty === '' ? null : warranty,
  };
}
