import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUSTOMER_STAGES, customerStage, needsCustomer } from './repair-journey';

/**
 * 🔴 A STAGE THIS FILE HAS NEVER HEARD OF HIDES SOMEBODY'S CAR.
 *
 * The customer's four screens are built by FILTERING on `JourneyPhase`. A stage
 * missing from `CUSTOMER_STAGES` therefore does not throw, does not warn and
 * does not render an error — the card falls into the fallback, and if the
 * fallback ever changed it would fall out of every list and the owner would be
 * told they have no repairs at all. That is indistinguishable from "you are not
 * a customer here", and it is invisible in exactly the case where somebody is
 * waiting for their vehicle.
 *
 * The identical class already bit this repo twice: the mobile detail screen read
 * `stageOptions` when the API returns `allowedStages` (an empty list, rendered
 * as "your role cannot move this job"), and a web queue keyed on
 * `awaiting_internal_review`, which is a BOARD COLUMN and not a stage at all.
 *
 * The authority is migration 006's CHECK constraint, transcribed into
 * `job-card-stages.ts`. This reads that file rather than restating the list,
 * because a hand-copied list drifts with the same edit that breaks it.
 */
describe('customer stage vocabulary', () => {
  const source = readFileSync(
    join(__dirname, '../../../../api/src/repair/job-card-stages.ts'),
    'utf8',
  );

  const block = /export const STAGES = \[([\s\S]*?)\] as const;/.exec(source);
  // `.filter(Boolean)` with the predicate spelled out: `noUncheckedIndexedAccess`
  // types a capture group as `string | undefined`, and an `undefined` sliding
  // into this list would silently shrink the coverage this file exists to prove.
  const known: string[] = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((s): s is string => typeof s === 'string');

  it('found the real stage list to compare against', () => {
    // Guards the regex itself. Without this, every assertion below would run
    // against an empty list and pass while proving nothing — the "check that
    // walks through its own gap" failure this repo keeps paying for. A nav
    // audit once reported 21 false gaps for exactly this reason.
    expect(block, 'could not find STAGES in job-card-stages.ts').toBeTruthy();
    expect(known.length).toBeGreaterThan(15);
    expect(known).toContain('repair_in_progress');
  });

  it.each(known)('%s has customer-facing wording', (stage) => {
    expect(
      CUSTOMER_STAGES[stage],
      `stage "${stage}" exists in the lifecycle but the customer screens cannot describe it`,
    ).toBeTruthy();
  });

  it('invents no stage the database would refuse', () => {
    // The other direction. A typo'd key here is dead weight that reads like
    // coverage — it would make the test above pass for a stage nobody can ever
    // be in, while the real one stays unhandled.
    const invented = Object.keys(CUSTOMER_STAGES).filter((s) => !known.includes(s));
    expect(invented, `not real stages: ${invented.join(', ')}`).toEqual([]);
  });

  /**
   * The three stages where the workshop genuinely cannot proceed without the
   * customer. Getting this set wrong is the expensive mistake in the file: too
   * narrow and a car sits still while its owner is never told they are the
   * hold-up; too wide and every screen nags about things they cannot action.
   */
  it('asks the customer to act on exactly the stages that need them', () => {
    const asks = known.filter((s) => needsCustomer(s)).sort();
    expect(asks).toEqual(
      [
        'awaiting_customer_approval',
        'awaiting_deposit',
        'further_information_required',
        'ready_for_collection',
      ].sort(),
    );
  });

  it('does NOT ask the customer to chase parts', () => {
    // `awaiting_parts` IS a waiting stage in the API's `isWaitingStage()`, and
    // deliberately is NOT the customer's problem. Borrowing that helper wholesale
    // would have told every owner to act on a delivery they cannot influence.
    expect(needsCustomer('awaiting_parts')).toBe(false);
    expect(customerStage('awaiting_parts').phase).toBe('in_progress');
  });

  it('survives a stage from a newer API rather than blanking the list', () => {
    // A 21st stage deploying ahead of this build must degrade to a vague label,
    // never to "you have no repairs".
    const unknown = customerStage('teleportation_pending');
    expect(unknown.phase).toBe('in_progress');
    expect(unknown.label).toBeTruthy();
    // And it must never claim the customer has something to do — that would
    // send someone to a workshop over a stage this build cannot describe.
    expect(unknown.phase).not.toBe('needs_you');
  });
});
