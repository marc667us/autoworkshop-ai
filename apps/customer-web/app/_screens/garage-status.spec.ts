import { describe, it, expect } from 'vitest';
import { currentRepairByVehicle } from './garage-status';
import { customerStage, needsCustomer } from './repair-journey';

/**
 * The garage card's repair status.
 *
 * The card previously showed the VEHICLE RECORD's status — `active` / `draft` —
 * so a customer whose car was being repaired read "active" and learned nothing.
 * These cases pin the two decisions that make the replacement honest rather than
 * merely present: a CLOSED repair must not colour a parked car, and two open
 * cards must resolve deterministically.
 */
/**
 * 🔴 THE STAGE NAMES HERE ARE THE REAL ONES, AND THE FIRST VERSION'S WERE NOT.
 * It used `in_repair` and `in_diagnosis`, which do not exist in
 * `CUSTOMER_STAGES` — the real keys are `repair_in_progress` and
 * `diagnosis_in_progress`. Every assertion therefore resolved through the
 * unknown-stage FALLBACK, so the test that claimed to prove "the customer
 * wording is rendered" proved only that the fallback exists. Caught by Codex.
 */
let seq = 0;
const card = (
  vehicleId: string,
  stage: string,
  stageChangedAt: string,
  closedAt: string | null = null,
  id = `card-${(seq += 1)}`,
) => ({ id, vehicleId, stage, stageChangedAt, closedAt });

describe('currentRepairByVehicle', () => {
  it('ignores CLOSED repairs — a finished car is parked, not "being repaired"', () => {
    const m = currentRepairByVehicle([
      card('v1', 'ready_for_collection', '2026-08-01T10:00:00Z', '2026-08-01T11:00:00Z'),
    ]);
    // The badge must fall back to the vehicle record, not claim a stale stage.
    expect(m.has('v1')).toBe(false);
  });

  it('prefers the most recently moved OPEN card', () => {
    const m = currentRepairByVehicle([
      card('v1', 'diagnosis_in_progress', '2026-08-01T10:00:00Z'),
      card('v1', 'repair_in_progress', '2026-08-02T10:00:00Z'),
    ]);
    expect(m.get('v1')?.stage).toBe('repair_in_progress');
  });

  it('is INDEPENDENT OF ROW ORDER when timestamps differ', () => {
    const a = card('v1', 'diagnosis_in_progress', '2026-08-01T10:00:00Z');
    const b = card('v1', 'repair_in_progress', '2026-08-02T10:00:00Z');
    expect(currentRepairByVehicle([a, b]).get('v1')?.stage).toBe(
      currentRepairByVehicle([b, a]).get('v1')?.stage,
    );
  });

  it('IS DETERMINISTIC ON AN EXACT TIMESTAMP TIE — the case the old test missed', () => {
    // Two cards written in the same transaction share a timestamp to the
    // millisecond. Before the tie-break the answer depended on row order, and
    // the badge would flip between "Being repaired" and "Waiting for your
    // approval" between refreshes.
    const SAME = '2026-08-02T10:00:00Z';
    const a = card('v1', 'repair_in_progress', SAME, null, 'card-aaa');
    const b = card('v1', 'awaiting_customer_approval', SAME, null, 'card-bbb');
    expect(currentRepairByVehicle([a, b]).get('v1')?.id).toBe(
      currentRepairByVehicle([b, a]).get('v1')?.id,
    );
  });

  it('keeps vehicles separate', () => {
    const m = currentRepairByVehicle([
      card('v1', 'repair_in_progress', '2026-08-02T10:00:00Z'),
      card('v2', 'awaiting_customer_approval', '2026-08-02T09:00:00Z'),
    ]);
    expect(m.get('v1')?.stage).toBe('repair_in_progress');
    expect(m.get('v2')?.stage).toBe('awaiting_customer_approval');
  });

  it('an empty list yields no statuses, and does not throw', () => {
    expect(currentRepairByVehicle([]).size).toBe(0);
  });

  it('a closed card does not mask an OPEN one on the same vehicle', () => {
    // The closed one is newer. It must still lose, because it is closed.
    const m = currentRepairByVehicle([
      card('v1', 'repair_in_progress', '2026-08-01T10:00:00Z'),
      card('v1', 'ready_for_collection', '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z'),
    ]);
    expect(m.get('v1')?.stage).toBe('repair_in_progress');
  });
});

describe('what the card actually renders', () => {
  it('renders the CUSTOMER wording for a REAL stage, not the fallback', () => {
    const s = customerStage('repair_in_progress');
    expect(s.label).not.toBe('repair_in_progress');
    // The distinguishing assertion: if the key were wrong this would be the
    // fallback's "In progress", which is exactly how the first version passed.
    expect(s.label).not.toBe('In progress');
    expect(s.label.length).toBeGreaterThan(0);
  });

  it('an unknown stage degrades to a safe label rather than blank', () => {
    // A stage this build has never heard of must not render an empty badge.
    expect(customerStage('a_stage_from_the_future').label).toBe('In progress');
  });

  it('emphasises the stages where the CUSTOMER is the hold-up', () => {
    expect(needsCustomer('awaiting_customer_approval')).toBe(true);
    expect(needsCustomer('repair_in_progress')).toBe(false);
  });
});
