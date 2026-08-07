import { STAGES, isWaitingStage, type Stage } from './job-card-stages';

/**
 * THE REPAIR ORCHESTRATOR — the owner's value chain, step 9: "an ochestrated
 * agen the takes over and work with other gaents run with the workshop to fix
 * the car".
 *
 * ── 🔴 DETERMINISTIC, NOT GOOGLE ADK, AND THAT IS THE OWNER'S DECISION ─────
 *
 * Root `CLAUDE.md` §0.1 names Google ADK as the agent framework. The owner has
 * instructed, and restated when asked, that ADK is NOT to be used here — for
 * building, not merely for opening as a tool. This follows the house precedent
 * set by Solar, this project's reference implementation (ADR-011): **ADR-0008
 * (AI-SOC)** and **ADR-0009 (Billing Agent)** both shipped deterministic and
 * ADK-free. `docs/02-architecture/adr/ADR-018-REPAIR-ORCHESTRATOR-NO-ADK.md`
 * records this instance.
 *
 * ── WHAT "ORCHESTRATION" MEANS HERE, CONCRETELY ────────────────────────────
 *
 * Every repair already moves through a 20-stage machine that says which moves
 * are LEGAL (`STAGE_TRANSITIONS`) and who may make them (`ROLE_TARGET_STAGES`).
 * What no code answered was the operational question a workshop actually asks:
 *
 *     "Of everything open right now, what needs doing next, by whom, and what
 *      is nobody doing anything about?"
 *
 * That is the gap this closes. It is a pure function of stage — no model, no
 * reasoning loop, no hidden state — so the same card always produces the same
 * instruction, and a wrong instruction is a bug somebody can find and fix
 * rather than a prompt somebody has to re-tune.
 *
 * ⚠️ IT DIRECTS; IT DOES NOT DECIDE. Nothing here moves a stage or writes a
 * row. The stage machine remains the only thing that changes a repair's state,
 * and every move still goes through the role checks that already exist. An
 * orchestrator that silently advanced work would be a second authority on the
 * lifecycle, and two authorities drift.
 */

/** Who the workshop is waiting ON. The distinction the board could not make. */
export type WaitingOn =
  /** The workshop itself — this is work somebody here should be doing. */
  | 'workshop'
  /** The customer. Chasing is the action; doing the repair is not. */
  | 'customer'
  /** A supplier. Neither party can move it by trying harder. */
  | 'supplier'
  /** Nobody — the repair is finished or closed. */
  | 'nobody';

export interface NextAction {
  /** What to do next, in the workshop's words. */
  action: string;
  /**
   * The role that owns it. Advisory — `ROLE_TARGET_STAGES` remains the
   * authority on who may actually make the move, and this must never be used to
   * permit one.
   */
  ownerRole: string;
  waitingOn: WaitingOn;
}

/**
 * The next action for every stage.
 *
 * ⚠️ EXHAUSTIVE OVER `STAGES`, AND A TEST ASSERTS IT. A stage with no entry
 * would silently produce "no action" on a live repair — a car sitting in a bay
 * that the orchestrator reports nothing about is worse than no orchestrator,
 * because the screen implies it has been considered.
 */
const NEXT: Record<Stage, NextAction> = {
  complaint_received: {
    action: 'Book the vehicle in, or confirm an appointment with the customer.',
    ownerRole: 'reception_staff',
    waitingOn: 'workshop',
  },
  appointment_confirmed: {
    action: 'Receive the vehicle when it arrives.',
    ownerRole: 'reception_staff',
    waitingOn: 'customer',
  },
  vehicle_received: {
    action: 'Carry out the initial inspection.',
    ownerRole: 'technician',
    waitingOn: 'workshop',
  },
  initial_inspection: {
    action: 'Record the inspection findings and start diagnosis.',
    ownerRole: 'technician',
    waitingOn: 'workshop',
  },
  diagnosis_in_progress: {
    action: 'Confirm the fault and record the diagnosis.',
    ownerRole: 'technician',
    waitingOn: 'workshop',
  },
  further_information_required: {
    action: 'Ask the customer for what is missing, and chase if it has been a while.',
    ownerRole: 'reception_staff',
    waitingOn: 'customer',
  },
  solution_preparation: {
    action: 'Prepare the repair options in Solution Studio.',
    ownerRole: 'workshop_supervisor',
    waitingOn: 'workshop',
  },
  quotation_preparation: {
    action: 'Price the work and produce the quotation.',
    ownerRole: 'workshop_manager',
    waitingOn: 'workshop',
  },
  awaiting_customer_approval: {
    action: 'Chase the customer for a decision on the proposal.',
    ownerRole: 'reception_staff',
    waitingOn: 'customer',
  },
  awaiting_deposit: {
    action: 'Chase the deposit before work starts.',
    ownerRole: 'cashier',
    waitingOn: 'customer',
  },
  awaiting_parts: {
    action: 'Follow up the supplier order.',
    ownerRole: 'storekeeper',
    waitingOn: 'supplier',
  },
  authorized_to_start: {
    action: 'Assign a technician and a bay, and begin the repair.',
    ownerRole: 'workshop_supervisor',
    waitingOn: 'workshop',
  },
  repair_in_progress: {
    action: 'Continue the repair and record what was done.',
    ownerRole: 'technician',
    waitingOn: 'workshop',
  },
  specialist_consultation: {
    action: 'Follow up the specialist for an answer.',
    ownerRole: 'workshop_supervisor',
    waitingOn: 'workshop',
  },
  testing: {
    action: 'Run the tests and record the results.',
    ownerRole: 'technician',
    waitingOn: 'workshop',
  },
  quality_control: {
    action: 'Carry out the quality inspection.',
    ownerRole: 'quality_control_inspector',
    waitingOn: 'workshop',
  },
  ready_for_collection: {
    action: 'Tell the customer the car is ready, and take payment on release.',
    ownerRole: 'reception_staff',
    waitingOn: 'customer',
  },
  completed: {
    action: 'Nothing outstanding.',
    ownerRole: 'workshop_manager',
    waitingOn: 'nobody',
  },
  warranty_follow_up: {
    action: 'Check in with the customer on the warranty follow-up.',
    ownerRole: 'reception_staff',
    waitingOn: 'workshop',
  },
  on_hold: {
    action: 'Find out what put this on hold and resume it, or close it.',
    ownerRole: 'workshop_manager',
    waitingOn: 'workshop',
  },
};

/**
 * What to do next with a repair at this stage.
 *
 * An unrecognised stage degrades to a REVIEW instruction owned by the manager
 * rather than to silence. A stage this build has never heard of means the
 * database moved ahead of the code, and the honest response is "a person should
 * look at this", not to omit the card from the list.
 */
export function nextActionFor(stage: string): NextAction {
  return (
    NEXT[stage as Stage] ?? {
      action: `This repair is at an unrecognised stage (${stage}). Review it.`,
      ownerRole: 'workshop_manager',
      waitingOn: 'workshop',
    }
  );
}

/**
 * How overdue a repair is, in whole days since it last moved.
 *
 * ⚠️ SINCE IT LAST MOVED, NOT SINCE IT OPENED. A three-week repair that moved
 * this morning is healthy; a two-day repair that has not moved in two days is
 * not. Age since opening measures the job's size, and stalling is what wants
 * attention.
 */
export function daysStalled(stageChangedAt: string, now: Date): number {
  const moved = new Date(stageChangedAt).getTime();
  if (Number.isNaN(moved)) return 0;
  const days = Math.floor((now.getTime() - moved) / 86_400_000);
  return days > 0 ? days : 0;
}

/**
 * Which repairs need attention first.
 *
 * The rule is deliberately simple and stated rather than tuned: work the
 * WORKSHOP owns outranks work it is waiting on somebody else for, because the
 * first kind is the kind trying harder actually fixes. Within each, the
 * longest-stalled comes first.
 *
 * ⚠️ A WAITING STAGE IS NOT AN IDLE ONE. `isWaitingStage` already knows which
 * stages are parked on an outside party; this sorts by it rather than
 * re-deriving it, so the board and this list cannot disagree about what
 * "waiting" means.
 */
export function orchestrationRank(stage: string, stalledDays: number): number {
  const own = isWaitingStage(stage) ? 0 : 1_000_000;
  return own + stalledDays;
}

/** Every stage has an instruction — asserted by the spec, not assumed. */
export const ORCHESTRATED_STAGES: readonly string[] = STAGES;
