import { describe, expect, it } from 'vitest';
import {
  CAN_INSPECT,
  QualityInputError,
  mayInspect,
  parseQualityDecision,
} from './quality-rules';
import { ROLE_TARGET_STAGES } from './job-card-stages';

/**
 * The independent quality inspection — Phase 5 slice 9 (`2.txt` §563).
 *
 * ⚠️ THESE ARE NOT THE INDEPENDENCE CONTROL. The identity half of §563 —
 * "the inspector must not be anyone who did the work" — is enforced by
 * `repair.user_worked_on_job_card()` and the `trg_qc_independence` trigger, and
 * proved against a real database by `verify/030` from BOTH sides: somebody who
 * did the work is refused, somebody who did not is accepted. No mocked test can
 * prove a trigger fires.
 *
 * What this file covers is the ROLE half and the decision logic.
 */

const answered = {
  complaintAddressed: 'true',
  newDefectFound: 'false',
  newDefectDescription: '',
  notes: 'Checked on the ramp; the noise is gone.',
};

describe('mayInspect — the ROLE half of §563', () => {
  it('admits the roles that may reach the quality_control stage', () => {
    for (const role of CAN_INSPECT) {
      expect(mayInspect(role), role).toBe(true);
    }
  });

  /**
   * 🔴 THE ABSENCE IS THE REQUIREMENT. `1.txt` §394 forbids a technician
   * bypassing "approval, payment, parts or quality-control states". A technician
   * passing their own repair is the exact failure §563 exists to prevent.
   */
  it('REFUSES a technician — no technician signs off any repair', () => {
    expect(mayInspect('technician')).toBe(false);
  });

  it('refuses reception, the customer, and an unknown role', () => {
    for (const role of ['reception_staff', 'customer', 'storekeeper', 'cashier', '', 'admin']) {
      expect(mayInspect(role), role).toBe(false);
    }
  });

  /**
   * ⚠️ PINNED TO THE STAGE MACHINE RATHER THAN RESTATED. `CAN_INSPECT` and
   * `ROLE_TARGET_STAGES` are two lists that must agree: a role allowed to
   * inspect but unable to reach `quality_control` could never act on its
   * verdict, and one able to reach the stage but not inspect would find the
   * screen refuses them. Migration 025 exists because two copies of a role list
   * drifted; this catches the same class here.
   */
  it('agrees with ROLE_TARGET_STAGES about who reaches quality_control', () => {
    const canReachStage = Object.entries(ROLE_TARGET_STAGES)
      .filter(([, stages]) => (stages as readonly string[]).includes('quality_control'))
      .map(([role]) => role)
      .sort();
    expect([...CAN_INSPECT].sort()).toEqual(canReachStage);
  });
});

describe('parseQualityDecision — §563 two questions', () => {
  it('derives PASSED from complaint addressed AND no new defect', () => {
    const out = parseQualityDecision(answered);
    expect(out.status).toBe('passed');
    expect(out.complaintAddressed).toBe(true);
    expect(out.newDefectFound).toBe(false);
  });

  it('derives FAILED when the complaint was not addressed', () => {
    const out = parseQualityDecision({ ...answered, complaintAddressed: 'false' });
    expect(out.status).toBe('failed');
  });

  it('derives FAILED when a new defect was introduced, even if the complaint was fixed', () => {
    // The two questions fail INDEPENDENTLY: a repair can fix the original fault
    // and break something else. One field could not express that.
    const out = parseQualityDecision({
      ...answered,
      newDefectFound: 'true',
      newDefectDescription: 'Nearside indicator now intermittent.',
    });
    expect(out.status).toBe('failed');
    expect(out.complaintAddressed).toBe(true);
  });

  /**
   * 🔴 THE STATUS IS NEVER TAKEN FROM THE CALLER. A supplied `status` would let
   * a screen or a future API consumer record "complaint not addressed" alongside
   * "passed" — a contradiction that reads fine and is discovered by the
   * customer. Migration 030's `ck_qc_decision_consistent` refuses it in the
   * database too.
   */
  it('IGNORES a status supplied by the caller', () => {
    const out = parseQualityDecision({
      ...answered,
      complaintAddressed: 'false',
      status: 'passed',
    });
    expect(out.status).toBe('failed');
  });

  /**
   * 🔴 `Boolean('false')` IS TRUE. A form posts strings, so a coercing parse
   * would turn "the complaint was NOT addressed" into a PASS — the worst
   * possible direction for this particular bug.
   */
  it('does not coerce the string "false" into true', () => {
    expect(parseQualityDecision({ ...answered, complaintAddressed: 'false' }).complaintAddressed)
      .toBe(false);
    expect(parseQualityDecision({ ...answered, newDefectFound: 'false' }).newDefectFound)
      .toBe(false);
  });

  it('refuses an unanswered question rather than assuming an answer', () => {
    for (const missing of [undefined, null, '', 'yes', '1', 0]) {
      expect(
        () => parseQualityDecision({ ...answered, complaintAddressed: missing }),
        String(missing),
      ).toThrow(QualityInputError);
    }
  });

  it('requires a new defect to be DESCRIBED', () => {
    expect(() =>
      parseQualityDecision({ ...answered, newDefectFound: 'true', newDefectDescription: '  ' }),
    ).toThrow(/must be described/i);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      parseQualityDecision({ complaintAddressed: 'maybe', newDefectFound: 'perhaps' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/complaint was addressed/i);
    expect(message).toMatch(/new defect was found/i);
  });

  it('bounds free text, because both columns are TEXT and unbounded', () => {
    expect(() => parseQualityDecision({ ...answered, notes: 'x'.repeat(8001) }))
      .toThrow(/8000 characters/i);
    expect(() =>
      parseQualityDecision({
        ...answered,
        newDefectFound: 'true',
        newDefectDescription: 'x'.repeat(4001),
      }),
    ).toThrow(/4000 characters/i);
  });

  it('stores absent optional text as null, not as an empty string', () => {
    const out = parseQualityDecision({ ...answered, notes: '   ' });
    expect(out.notes).toBeNull();
    expect(out.newDefectDescription).toBeNull();
  });
});
