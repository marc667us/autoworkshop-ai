import { describe, it, expect } from 'vitest';
import {
  nextActionFor,
  daysStalled,
  orchestrationRank,
  ORCHESTRATED_STAGES,
} from './repair-orchestration';
import { STAGES, isWaitingStage } from './job-card-stages';

/**
 * The repair orchestrator's rules.
 *
 * These are pure functions, so the tests can be exhaustive rather than
 * representative — and the exhaustive one is the point. A stage with no
 * instruction would leave a real car sitting in a bay that the orchestrator
 * reports nothing about, which is worse than having no orchestrator at all,
 * because the screen implies the case was considered.
 */
describe('nextActionFor', () => {
  it('🔴 covers EVERY stage the database allows — no silent gaps', () => {
    const missing = STAGES.filter((s) => {
      const a = nextActionFor(s);
      // The fallback names the stage, so its presence is detectable.
      return a.action.includes('unrecognised stage');
    });
    expect(missing, `stages with no instruction: ${missing.join(', ')}`).toEqual([]);
  });

  it('names an owning role for every stage', () => {
    for (const s of STAGES) {
      expect(nextActionFor(s).ownerRole.length, s).toBeGreaterThan(0);
    }
  });

  it('an UNKNOWN stage asks a human to look, rather than going silent', () => {
    // The database is the authority on which stages exist; this code is a
    // transcription. If they drift, the honest answer is "review this".
    const a = nextActionFor('teleported_to_mars');
    expect(a.action).toContain('unrecognised stage');
    expect(a.waitingOn).toBe('workshop');
  });

  it('attributes the CUSTOMER-blocked stages to the customer', () => {
    // These are the three where the car sits still because its owner has not
    // answered. Getting them wrong means the workshop chases itself while the
    // customer is never told they are the hold-up.
    for (const s of ['awaiting_customer_approval', 'awaiting_deposit', 'further_information_required']) {
      expect(nextActionFor(s).waitingOn, s).toBe('customer');
    }
  });

  it('attributes parts to the SUPPLIER, not the workshop', () => {
    // `awaiting_parts` is a waiting stage but emphatically not the customer's
    // problem — and not one the workshop fixes by trying harder either.
    expect(nextActionFor('awaiting_parts').waitingOn).toBe('supplier');
  });

  it('only `completed` is owed to nobody', () => {
    const nobody = STAGES.filter((s) => nextActionFor(s).waitingOn === 'nobody');
    expect(nobody).toEqual(['completed']);
  });
});

describe('daysStalled', () => {
  const NOW = new Date('2026-08-07T12:00:00Z');

  it('measures from the last MOVE, not from opening', () => {
    expect(daysStalled('2026-08-04T12:00:00Z', NOW)).toBe(3);
  });

  it('is 0 for something that moved moments ago', () => {
    expect(daysStalled('2026-08-07T11:00:00Z', NOW)).toBe(0);
  });

  it('never goes negative on a clock skew', () => {
    // A row stamped slightly in the future must not sort as the most urgent
    // thing in the workshop.
    expect(daysStalled('2026-08-09T12:00:00Z', NOW)).toBe(0);
  });

  it('survives an unparseable timestamp instead of producing NaN', () => {
    // NaN would poison every comparison it touched and scramble the ordering
    // of the whole list, silently.
    expect(daysStalled('not a date', NOW)).toBe(0);
  });
});

describe('orchestrationRank', () => {
  it('ranks work the WORKSHOP owns above work it is waiting on', () => {
    // A one-day job the workshop can act on outranks a 30-day wait on a
    // customer, because the first is the kind trying harder actually fixes.
    const ours = orchestrationRank('repair_in_progress', 1);
    const theirs = orchestrationRank('awaiting_customer_approval', 30);
    expect(ours).toBeGreaterThan(theirs);
  });

  it('within the same kind, the longest-stalled comes first', () => {
    expect(orchestrationRank('repair_in_progress', 9)).toBeGreaterThan(
      orchestrationRank('repair_in_progress', 2),
    );
  });

  it('agrees with `isWaitingStage` rather than re-deriving "waiting"', () => {
    // Two definitions of waiting would let the board and this list disagree
    // about the same card.
    for (const s of STAGES) {
      const waiting = isWaitingStage(s);
      const rank = orchestrationRank(s, 0);
      expect(rank < 1_000_000, s).toBe(waiting);
    }
  });
});

describe('ORCHESTRATED_STAGES', () => {
  it('is the database stage list, not a second copy that can drift', () => {
    expect(ORCHESTRATED_STAGES).toEqual([...STAGES]);
  });
});
