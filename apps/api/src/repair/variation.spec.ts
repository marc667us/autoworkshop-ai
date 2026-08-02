import { describe, expect, it } from 'vitest';
import {
  CAN_RAISE_VARIATION,
  CAN_REVIEW_VARIATION,
  MAX_SANE_COST,
  VariationInputError,
  parseDecision,
  parseVariationInput,
} from './variation-rules';

/**
 * The repair variation flow — Phase 5 slice 7b (`07.txt` §14, §3766 step 12).
 *
 * ⚠️ THESE ARE NOT THE CONTROL. Migration 032's constraints and triggers refuse
 * an unapproved authorisation, a skipped internal review, and an edit to an
 * approved variation's cost — proven against a real database by `verify/032`
 * (15 checks, every negative paired with a control). This file covers the input
 * rules and the role split.
 */

const valid = {
  newFinding: 'Offside drop link badly worn.',
  additionalWork: 'Replace offside drop link.',
  additionalCost: '420.00',
  currency: 'GHS',
};

describe('the role split — §3792 internal review', () => {
  /**
   * 🔴 THE TECHNICIAN RAISES BUT DOES NOT REVIEW. A review the raiser performs
   * on their own work is not a review — the same independence shape as the
   * diagnosis review and the QC inspection. The person who found more work to do
   * should not also decide it is worth billing for.
   */
  it('lets a technician RAISE a variation', () => {
    expect(CAN_RAISE_VARIATION.has('technician')).toBe(true);
  });

  it('does NOT let a technician review one internally', () => {
    expect(CAN_REVIEW_VARIATION.has('technician')).toBe(false);
  });

  it('every reviewer may also raise — a supervisor who finds work can record it', () => {
    for (const role of CAN_REVIEW_VARIATION) {
      expect(CAN_RAISE_VARIATION.has(role), role).toBe(true);
    }
  });

  it('excludes reception, the customer and unknown roles from both', () => {
    for (const role of ['reception_staff', 'customer', 'cashier', 'storekeeper', '']) {
      expect(CAN_RAISE_VARIATION.has(role), role).toBe(false);
      expect(CAN_REVIEW_VARIATION.has(role), role).toBe(false);
    }
  });
});

describe('parseVariationInput', () => {
  it('accepts a well-formed variation and returns numbers, not strings', () => {
    const out = parseVariationInput(valid);
    expect(out.additionalCost).toBe(420);
    expect(out.currency).toBe('GHS');
    expect(out.additionalLabourHours).toBeNull();
  });

  /**
   * 🔴 `Number('')` IS 0, and on this table that is not a rounding detail. An
   * empty cost field would silently become a FREE variation, which skips the
   * chargeable-consent rules entirely and lets work proceed with no signature
   * against it. Absent is refused.
   */
  it('REFUSES an empty cost instead of reading it as free', () => {
    for (const empty of ['', '   ', undefined, null]) {
      expect(() => parseVariationInput({ ...valid, additionalCost: empty }), String(empty))
        .toThrow(VariationInputError);
    }
  });

  it('ACCEPTS an explicit zero — a no-charge variation is a real thing to record', () => {
    // Discovering a loose clip that needs re-seating is a variation the customer
    // should be told about, at no charge. Refusing empty is not refusing free.
    expect(parseVariationInput({ ...valid, additionalCost: '0' }).additionalCost).toBe(0);
  });

  it('refuses a negative cost and an obvious typo', () => {
    expect(() => parseVariationInput({ ...valid, additionalCost: '-1' })).toThrow(/negative/i);
    expect(() => parseVariationInput({ ...valid, additionalCost: String(MAX_SANE_COST + 1) }))
      .toThrow(/typo/i);
  });

  it('requires the §14 fields a variation cannot be understood without', () => {
    expect(() => parseVariationInput({ ...valid, newFinding: '' })).toThrow(/new finding/i);
    expect(() => parseVariationInput({ ...valid, additionalWork: '  ' })).toThrow(/additional work/i);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      parseVariationInput({ newFinding: '', additionalWork: '', additionalCost: '-5', currency: 'X' });
    } catch (err) {
      message = (err as Error).message;
    }
    for (const p of [/new finding/i, /additional work/i, /negative/i, /currency/i]) {
      expect(message, message).toMatch(p);
    }
  });

  it('treats absent labour hours as absent, not as zero', () => {
    expect(parseVariationInput({ ...valid, additionalLabourHours: '' }).additionalLabourHours)
      .toBeNull();
    expect(parseVariationInput({ ...valid, additionalLabourHours: '2.5' }).additionalLabourHours)
      .toBe(2.5);
  });
});

describe('parseDecision — recording the customer answer', () => {
  /**
   * 🔴 A CHARGEABLE APPROVAL MUST NAME THE CUSTOMER AND THE CHANNEL. It is the
   * only thing standing between the workshop and an invoice the customer
   * disputes. Migration 032 refuses it in the database too.
   */
  it('REFUSES a chargeable approval with no name or channel', () => {
    expect(() => parseDecision({ decision: 'approved' }, true)).toThrow(/name against it/i);
    expect(() => parseDecision({ decision: 'approved', decidedByName: 'Mr Mensah' }, true))
      .toThrow(/how they approved/i);
  });

  it('accepts a chargeable approval that names both', () => {
    const out = parseDecision(
      { decision: 'approved', decidedByName: 'Mr Mensah', decisionChannel: 'phone' },
      true,
    );
    expect(out.decision).toBe('approved');
    expect(out.decidedByName).toBe('Mr Mensah');
  });

  /**
   * ⚠️ NOT REQUIRED WHEN THE VARIATION IS FREE. Demanding a signature for a
   * no-charge courtesy notification would push staff to record £0 variations as
   * nothing at all, losing the record entirely.
   */
  it('does not demand a signature for a FREE variation', () => {
    expect(() => parseDecision({ decision: 'approved' }, false)).not.toThrow();
  });

  it('requires a rejection to say why, chargeable or not', () => {
    expect(() => parseDecision({ decision: 'rejected' }, true)).toThrow(/must give a reason/i);
    expect(() => parseDecision({ decision: 'rejected' }, false)).toThrow(/must give a reason/i);
    expect(
      parseDecision({ decision: 'rejected', decisionNote: 'Sourcing the part elsewhere.' }, true)
        .decisionNote,
    ).toBe('Sourcing the part elsewhere.');
  });

  it('accepts "modified" — the customer wants it changed, not refused', () => {
    // A modification returns the variation to draft rather than ending it, which
    // is why it is a decision in its own right and not a flavour of rejection.
    expect(parseDecision({ decision: 'modified' }, true).decision).toBe('modified');
  });

  it('refuses a channel outside the recorded set', () => {
    expect(() =>
      parseDecision(
        { decision: 'approved', decidedByName: 'X', decisionChannel: 'carrier_pigeon' },
        true,
      ),
    ).toThrow(/channel must be one of/i);
  });

  it('refuses a decision that is not one of the three', () => {
    for (const bad of ['', 'yes', 'accepted', undefined]) {
      expect(() => parseDecision({ decision: bad }, true), String(bad)).toThrow(/approved, rejected/i);
    }
  });
});
