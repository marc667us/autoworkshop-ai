import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  MAX_SANE_LABOUR_RATE,
  MAX_VALIDITY_DAYS,
  MIN_VALIDITY_DAYS,
  PricingInputError,
  parsePricingInput,
} from './pricing-rules';
import { PRICING_DEFAULTS } from './quotation-rules';
import { PricingService } from './pricing.service';
import { WORKSHOP_STAFF_ROLES } from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Input rules for the workshop's pricing — Slice D.
 *
 * These are not the security control. Migration 029's `owner_write` /
 * `owner_update` policies decide WHO may write the row and are proven against a
 * real database by `verify/029` (13 checks, every negative paired with a
 * control). This file covers what a valid rate IS, so an owner gets a sentence
 * rather than a raw `23514 check_violation`.
 */

const valid = {
  currency: 'GHS',
  defaultLabourRate: '120.50',
  taxName: 'VAT',
  taxRatePercent: '15',
  defaultValidityDays: '14',
  defaultWarrantyTerms: '3 months on parts and labour',
};

describe('parsePricingInput', () => {
  it('accepts a well-formed submission and returns numbers, not strings', () => {
    const out = parsePricingInput(valid);
    expect(out.defaultLabourRate).toBe(120.5);
    expect(out.taxRatePercent).toBe(15);
    expect(out.defaultValidityDays).toBe(14);
    expect(out.currency).toBe('GHS');
  });

  it('uppercases a lowercase currency rather than refusing it', () => {
    // `ghs` is unambiguous; rejecting it would be pedantry the CHECK constraint
    // does not require us to inflict on an owner.
    expect(parsePricingInput({ ...valid, currency: 'ghs' }).currency).toBe('GHS');
  });

  it('stores empty warranty terms as NULL, not as an empty string', () => {
    // An empty string renders as a blank clause on a quotation document; NULL
    // means "no standard terms", which is a legitimate answer.
    expect(parsePricingInput({ ...valid, defaultWarrantyTerms: '   ' }).defaultWarrantyTerms).toBeNull();
  });

  /**
   * 🔴 THE TRAP THIS FILE EXISTS FOR. `Number('')` is **0**, not NaN. A naive
   * parse turns a field the owner CLEARED into a labour rate of ZERO — silently
   * — and every later quotation charges nothing for labour. That is the same
   * zero as `PRICING_DEFAULTS.labourRate`, so it would be indistinguishable from
   * "never configured" while looking configured on screen.
   */
  it('REFUSES an empty labour rate instead of reading it as zero', () => {
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: '' })).toThrow(PricingInputError);
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: '   ' })).toThrow(/required/i);
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: undefined })).toThrow(/required/i);
  });

  it('confirms the zero it is guarding against is the real quotation fallback', () => {
    // Pinned so the guard above cannot quietly lose its reason: if this default
    // ever stops being 0, the empty-field trap changes shape and this test says so.
    expect(PRICING_DEFAULTS.labourRate).toBe(0);
  });

  it('ACCEPTS an explicit zero labour rate — refusing empty is not refusing free', () => {
    // A workshop that genuinely charges nothing for labour on a promotion must
    // be able to say so. The rule is about an ABSENT field, not a zero one.
    expect(parsePricingInput({ ...valid, defaultLabourRate: '0' }).defaultLabourRate).toBe(0);
  });

  it('refuses a negative labour rate', () => {
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: '-1' })).toThrow(/negative/i);
  });

  it('refuses a labour rate that is obviously a typo', () => {
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: String(MAX_SANE_LABOUR_RATE + 1) }))
      .toThrow(/typo/i);
    // …and accepts the boundary itself, so the guard is off-by-one-free.
    expect(parsePricingInput({ ...valid, defaultLabourRate: String(MAX_SANE_LABOUR_RATE) })
      .defaultLabourRate).toBe(MAX_SANE_LABOUR_RATE);
  });

  it('refuses text in a numeric field rather than coercing it', () => {
    expect(() => parsePricingInput({ ...valid, defaultLabourRate: '12abc' })).toThrow(/number/i);
  });

  it('refuses a currency that is not three letters', () => {
    for (const bad of ['GH', 'GHSS', 'G1S', '', 'GH$']) {
      expect(() => parsePricingInput({ ...valid, currency: bad }), bad).toThrow(/three-letter/i);
    }
  });

  it('holds the tax rate to 0-100 percent, matching the CHECK constraint', () => {
    expect(() => parsePricingInput({ ...valid, taxRatePercent: '-0.5' })).toThrow(/between 0 and 100/i);
    expect(() => parsePricingInput({ ...valid, taxRatePercent: '100.5' })).toThrow(/between 0 and 100/i);
    expect(parsePricingInput({ ...valid, taxRatePercent: '0' }).taxRatePercent).toBe(0);
    expect(parsePricingInput({ ...valid, taxRatePercent: '100' }).taxRatePercent).toBe(100);
  });

  it('holds validity to whole days within the CHECK constraint range', () => {
    expect(() => parsePricingInput({ ...valid, defaultValidityDays: '0' })).toThrow(/between/i);
    expect(() => parsePricingInput({ ...valid, defaultValidityDays: String(MAX_VALIDITY_DAYS + 1) }))
      .toThrow(/between/i);
    // A fractional day would be truncated by the integer column — refused with
    // an explanation instead.
    expect(() => parsePricingInput({ ...valid, defaultValidityDays: '14.5' })).toThrow(/whole number/i);
    expect(parsePricingInput({ ...valid, defaultValidityDays: String(MIN_VALIDITY_DAYS) })
      .defaultValidityDays).toBe(MIN_VALIDITY_DAYS);
  });

  it('refuses an empty tax name — a quotation line needs something to call it', () => {
    expect(() => parsePricingInput({ ...valid, taxName: '  ' })).toThrow(/required/i);
  });

  it('bounds the warranty terms, because the column is TEXT and unbounded', () => {
    expect(() => parsePricingInput({ ...valid, defaultWarrantyTerms: 'x'.repeat(2001) }))
      .toThrow(/2000 characters/i);
  });

  it('names the field in EVERY message, so the owner knows which one to fix', () => {
    // "invalid input" is not something anyone can act on. Each message has to
    // identify the field and the acceptable range.
    //
    // ⚠️ EVERY VALIDATION PATH, NOT A SAMPLE. The first version of this test
    // covered five of them while its name claimed "every message" — Codex
    // caught the overclaim. A test that asserts less than its name promises is
    // the same defect as a comment that does.
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['empty labour rate', { ...valid, defaultLabourRate: '' }, /labour rate/i],
      ['non-numeric labour rate', { ...valid, defaultLabourRate: '12abc' }, /labour rate/i],
      ['negative labour rate', { ...valid, defaultLabourRate: '-5' }, /labour rate/i],
      [
        'typo-high labour rate',
        { ...valid, defaultLabourRate: String(MAX_SANE_LABOUR_RATE + 1) },
        /labour rate/i,
      ],
      ['empty tax rate', { ...valid, taxRatePercent: '' }, /tax rate/i],
      ['out-of-range tax rate', { ...valid, taxRatePercent: '999' }, /tax rate/i],
      ['empty validity', { ...valid, defaultValidityDays: '' }, /validity/i],
      ['out-of-range validity', { ...valid, defaultValidityDays: '999' }, /validity/i],
      ['fractional validity', { ...valid, defaultValidityDays: '14.5' }, /validity/i],
      ['empty tax name', { ...valid, taxName: '' }, /tax name/i],
      ['over-long tax name', { ...valid, taxName: 'x'.repeat(41) }, /tax name/i],
      ['bad currency', { ...valid, currency: 'X' }, /currency/i],
      [
        'over-long warranty terms',
        { ...valid, defaultWarrantyTerms: 'x'.repeat(2001) },
        /warranty terms/i,
      ],
    ];
    for (const [label, input, pattern] of cases) {
      expect(() => parsePricingInput(input), label).toThrow(pattern);
    }
  });

  /**
   * 🔴 THE BEHAVIOUR THE DOCSTRING PROMISED AND THE CODE DID NOT DO. Codex found
   * `parsePricingInput` throwing on the FIRST bad field while its comment said it
   * validated the whole object — this repository's most-repeated defect, a
   * confident comment that stops the next reader checking. The behaviour was
   * fixed to match the promise; this pins it.
   */
  it('reports EVERY problem at once, not just the first', () => {
    let message = '';
    try {
      parsePricingInput({
        currency: 'XX',
        defaultLabourRate: '-5',
        taxName: '',
        taxRatePercent: '999',
        defaultValidityDays: '999',
        defaultWarrantyTerms: '',
      });
    } catch (err) {
      message = (err as Error).message;
    }
    for (const expected of [/currency/i, /labour rate/i, /tax name/i, /tax rate/i, /validity/i]) {
      expect(message, `missing from: ${message}`).toMatch(expected);
    }
  });

  it('does not pile a range complaint on top of an unparseable number', () => {
    // A field that could not be parsed must produce ONE message about being
    // required, not a second misleading one about being out of range — which is
    // what a naive `0` fallback would have caused.
    let message = '';
    try {
      parsePricingInput({ ...valid, taxRatePercent: '' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/tax rate is required/i);
    expect(message).not.toMatch(/between 0 and 100/i);
  });
});

/**
 * 🔴 WHO MAY *READ* THE RATES. `save()` called `assertGoverns` and `describe()`
 * called nothing at all, so a signed-in `customer` — a real membership role
 * inside this same organisation, which organisation-scoped RLS cannot tell
 * apart from staff — could read the workshop's labour rate, tax rate and
 * standard warranty terms off `GET .../pricing`.
 *
 * ⚠️ THE GATE IS `assertWorkshopStaff`, NOT `assertGoverns`, AND THE SECOND
 * TEST BELOW IS WHY. Reusing the owner-only WRITE rule for the READ would take
 * the screen away from reception, the manager and the supervisor, who quote
 * with these numbers daily — and would make `mayEdit` (the field that tells an
 * ordinary staff member the form is read-only for them) unreachable. A gate
 * that refuses everybody passes every refusal test and breaks the product.
 */
describe('the pricing screen is the workshop’s, not a customer’s', () => {
  const ctx = (activeRole: string): TenantContext =>
    ({
      tenantId: 't', organizationId: 'o', branchId: null,
      userId: 'u', activeRole, correlationId: 'c',
    }) as TenantContext;

  function makeService() {
    // Throws if entered, so a gate placed AFTER the SELECT — which would still
    // 403 having already read the rates — fails here rather than passing.
    const withTenant = vi.fn(async () => {
      throw new Error('withTenant was entered — the gate ran too late, or not at all');
    });
    return { svc: new PricingService({ withTenant } as never), withTenant };
  }

  it('REFUSES a customer, without touching the database', async () => {
    const { svc, withTenant } = makeService();
    await expect(svc.describe(ctx('customer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('admits EVERY workshop staff role, not only the owner', async () => {
    const { svc, withTenant } = makeService();
    for (const role of WORKSHOP_STAFF_ROLES) {
      withTenant.mockClear();
      await expect(svc.describe(ctx(role))).rejects.toThrow(/withTenant was entered/);
      expect(withTenant, role).toHaveBeenCalledTimes(1);
    }
  });

  it('still refuses the non-staff roles that share this tenancy', async () => {
    const { svc } = makeService();
    for (const role of ['supplier_user', 'fleet_manager', 'towing_operator', '']) {
      await expect(svc.describe(ctx(role)), role || '(empty)').rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it('keeps the WRITE narrower than the read', async () => {
    // The split migration 029 exists for. Reception may see the rates and may
    // not change them; if these two ever converge, one of them is wrong.
    const { svc } = makeService();
    await expect(svc.save(ctx('reception_staff'), { ...valid })).rejects.toThrow(
      /only the workshop owner/i,
    );
    await expect(svc.describe(ctx('reception_staff'))).rejects.toThrow(/withTenant was entered/);
  });
});
