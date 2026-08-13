/**
 * What a CUSTOMER is told about where their repair has got to.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM `job-card-stages.ts` ───────────────
 *
 * The lifecycle has 20 stages (`1.txt` §322-§360) and they are named for the
 * WORKSHOP: `diagnosis_in_progress`, `specialist_consultation`,
 * `awaiting_deposit`. Rendering those to a vehicle owner would be honest and
 * useless — nobody outside a garage knows whether `solution_preparation` means
 * their car is being fixed or has not been looked at yet.
 *
 * So this maps the workshop's vocabulary onto the four things a customer
 * actually wants to know:
 *
 *     where is it · is anyone waiting on ME · when do I get it back · is it done
 *
 * 🔴 THIS IS PRESENTATION, NOT AUTHORIZATION, AND NOT A SECOND LIFECYCLE.
 * It decides wording and which list a card appears in. It grants nothing, it
 * moves nothing, and it must never become the place a stage rule is expressed —
 * `job-card-stages.ts` on the API side is the authority and re-derives every
 * judgement server-side (CLAUDE.md §8: hidden is not secure).
 *
 * ⚠️ EVERY STAGE IN THE API'S `STAGES` ARRAY MUST APPEAR IN `CUSTOMER_STAGES`.
 * A stage this file has never heard of falls through to a generic label, which
 * is survivable — but a stage missing from the PHASE map would silently drop
 * the card out of every list and the customer would be told they have no
 * repairs at all. `repair-journey.test.ts` asserts the two agree, so adding a
 * stage to the lifecycle without teaching this file fails the build rather than
 * hiding somebody's car.
 */

/** The four buckets the customer's own screens divide their repairs into. */
export type JourneyPhase =
  /** Logged, not yet being worked on. */
  | 'requested'
  /** The workshop is doing something. */
  | 'in_progress'
  /** The workshop is waiting on the CUSTOMER — the only phase that needs them. */
  | 'needs_you'
  /** Finished. */
  | 'finished';

export interface CustomerStage {
  /** What the customer reads. Plain language, no workshop jargon. */
  label: string;
  /** One sentence of what is actually happening, in the customer's terms. */
  detail: string;
  phase: JourneyPhase;
  /** `StatusBadge` has a FIXED set of kinds — an invented one renders nothing. */
  badge: 'draft' | 'active' | 'complete' | 'attention' | 'blocked';
}

/**
 * The 20 lifecycle stages, in the customer's words.
 *
 * ⚠️ `awaiting_customer_approval`, `awaiting_deposit` and
 * `further_information_required` are the three that are `needs_you`. Getting
 * one of those wrong is the expensive mistake in this file: a car sits still
 * while its owner is never told they are the thing holding it up. That is
 * exactly the "waiting on someone outside the workshop" set the API already
 * names in `isWaitingStage()` — but NOT identical to it, because
 * `awaiting_parts` is also a waiting stage there and is emphatically not the
 * customer's problem to solve.
 */
export const CUSTOMER_STAGES: Record<string, CustomerStage> = {
  complaint_received: {
    label: 'Request received',
    detail: 'We have your report and will book the vehicle in.',
    phase: 'requested',
    badge: 'draft',
  },
  appointment_confirmed: {
    label: 'Appointment confirmed',
    detail: 'Your slot is booked. Bring the vehicle in at the agreed time.',
    phase: 'requested',
    badge: 'draft',
  },
  vehicle_received: {
    label: 'Vehicle received',
    detail: 'Your vehicle is with us and is queued for inspection.',
    phase: 'in_progress',
    badge: 'active',
  },
  initial_inspection: {
    label: 'Being inspected',
    detail: 'A technician is carrying out the first inspection.',
    phase: 'in_progress',
    badge: 'active',
  },
  diagnosis_in_progress: {
    label: 'Finding the fault',
    detail: 'A technician is diagnosing the cause of the problem you reported.',
    phase: 'in_progress',
    badge: 'active',
  },
  further_information_required: {
    label: 'We need something from you',
    detail: 'The workshop has asked you a question and cannot continue until you answer.',
    phase: 'needs_you',
    badge: 'attention',
  },
  solution_preparation: {
    label: 'Preparing your options',
    detail: 'We are working out how to fix it and what each option involves.',
    phase: 'in_progress',
    badge: 'active',
  },
  quotation_preparation: {
    label: 'Preparing your quote',
    detail: 'We are pricing the work. Your proposal will arrive shortly.',
    phase: 'in_progress',
    badge: 'active',
  },
  awaiting_customer_approval: {
    label: 'Waiting for your approval',
    detail: 'A repair proposal is waiting for your decision. Nothing starts until you approve it.',
    phase: 'needs_you',
    badge: 'attention',
  },
  awaiting_deposit: {
    label: 'Waiting for your deposit',
    detail: 'The work is approved and starts once the deposit is paid.',
    phase: 'needs_you',
    badge: 'attention',
  },
  awaiting_parts: {
    // NOT `needs_you`: the workshop is chasing this, not the customer.
    label: 'Waiting for parts',
    detail: 'The workshop is waiting on parts to arrive. Nothing is needed from you.',
    phase: 'in_progress',
    badge: 'blocked',
  },
  authorized_to_start: {
    label: 'Approved, starting soon',
    detail: 'Everything is agreed. Your repair is queued to begin.',
    phase: 'in_progress',
    badge: 'active',
  },
  repair_in_progress: {
    label: 'Being repaired',
    detail: 'A technician is working on your vehicle now.',
    phase: 'in_progress',
    badge: 'active',
  },
  specialist_consultation: {
    label: 'With a specialist',
    detail: 'A senior technician is reviewing the job before it goes further.',
    phase: 'in_progress',
    badge: 'active',
  },
  testing: {
    label: 'Being tested',
    detail: 'The repair is done and is being tested to confirm the fault is gone.',
    phase: 'in_progress',
    badge: 'active',
  },
  quality_control: {
    label: 'Final checks',
    detail: 'An inspector is checking the work before your vehicle is released.',
    phase: 'in_progress',
    badge: 'active',
  },
  ready_for_collection: {
    label: 'Ready to collect',
    detail: 'Your vehicle is finished and ready for you to pick up.',
    phase: 'needs_you',
    badge: 'complete',
  },
  completed: {
    label: 'Completed',
    detail: 'This repair is finished and the vehicle has been handed back.',
    phase: 'finished',
    badge: 'complete',
  },
  warranty_follow_up: {
    label: 'Completed — under warranty follow-up',
    detail: 'Finished. The workshop is following up on the warranty for this work.',
    phase: 'finished',
    badge: 'complete',
  },
  on_hold: {
    label: 'On hold',
    detail: 'This job is paused. Contact the workshop if you were not told why.',
    phase: 'in_progress',
    badge: 'blocked',
  },
};

/**
 * A stage this build has never heard of.
 *
 * ⚠️ DELIBERATELY NOT A THROW. A newer API deploying a 21st stage must not blank
 * a customer's repair list — they would be told they have no vehicles in for
 * repair, which is a far worse failure than a vague label. It lands in
 * `in_progress` because "something is happening" is the honest reading of an
 * open card, and never in `needs_you`, which would tell someone to act on a
 * thing this build cannot describe.
 */
export function customerStage(stage: string): CustomerStage {
  return (
    CUSTOMER_STAGES[stage] ?? {
      label: 'In progress',
      detail: 'Your repair is with the workshop. Contact them for detail.',
      phase: 'in_progress',
      badge: 'active',
    }
  );
}

/** Is the customer the thing holding this job up? */
export function needsCustomer(stage: string): boolean {
  return customerStage(stage).phase === 'needs_you';
}
