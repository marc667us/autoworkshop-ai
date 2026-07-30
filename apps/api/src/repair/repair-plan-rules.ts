/**
 * Repair plan rules — Phase 5, slice 4.
 *
 * `1.txt` §378-§384 is the plan's content — repair tasks, required tools, required
 * parts, labour allocation — and `07.txt` §22-§31 is the flow around it: planning
 * begins from a completed diagnosis, loads its CONFIRMED faults, and ends at a
 * supervisor's internal technical review before a quotation is priced from it.
 *
 * Transcribed in the order the specifications give them, not paraphrased, for the
 * same reason slice 3a's checklist and slice 3b's finding vocabulary are: this is
 * what a technician proposes, what a supervisor approves, and what a customer is
 * ultimately charged for.
 *
 * ⚠️ MIGRATION 014 IS THE AUTHORITY ON EVERY LIST BELOW. Each one restates a SQL
 * CHECK constraint, and a drifted transcription either rejects an answer the
 * database would accept or offers one it will refuse with a 500.
 * `repair-plan.spec.ts` compares each against the migration text — the same drift
 * test `diagnosis-rules.ts` and `inspection-checklist.ts` carry, for the same
 * reason.
 */

/**
 * The plan lifecycle — `07.txt` §29.10 and §30-§31's internal technical review.
 *
 * The same four states as a diagnosis, and deliberately so: both are a technician's
 * statement answered by a supervisor. There is no way back to `in_progress` — a
 * rejected plan stays as the record of what was PROPOSED and what the reviewer said
 * about it, and the next proposal is a NEW ATTEMPT. Reopening it would erase the
 * disagreement, which is the one thing a review exists to record. Enforced by
 * trigger in 014, not only here.
 */
export const REPAIR_PLAN_STATUSES = ['in_progress', 'submitted', 'approved', 'rejected'] as const;

export type RepairPlanStatus = (typeof REPAIR_PLAN_STATUSES)[number];

/**
 * The two answers a reviewer may record — `07.txt` §31.
 *
 * §31 offers the supervisor five verbs: Approve · Request Additional Test · Modify
 * Plan · Return to Technician · Escalate to Specialist. Only TWO of them are
 * outcomes of the review itself; the other three are what happens NEXT, and each
 * already has its own mechanism:
 *
 *   · "Request Additional Test" and "Return to Technician" are a REJECTION whose
 *     reason says which — and the reason is mandatory, so the technician gets the
 *     sentence rather than a bare status.
 *   · "Modify Plan" is a rejection followed by a new attempt. A supervisor editing
 *     the technician's plan in place would destroy the distinction between what was
 *     proposed and what was approved, which is precisely what the review records.
 *   · "Escalate to Specialist" is a job-card STAGE change
 *     (`specialist_consultation`), already built in slice 2 and audited there.
 *
 * Modelling five decisions where the database has two would put three statuses in
 * the record that nothing downstream could interpret.
 */
export const PLAN_REVIEW_DECISIONS = ['approved', 'rejected'] as const;

export type PlanReviewDecision = (typeof PLAN_REVIEW_DECISIONS)[number];

/**
 * `07.txt` §29's resource list, as a fixed vocabulary.
 *
 * §29 names: required technicians · required skills · service bay · tools ·
 * diagnostic equipment · lifting equipment · safety equipment · parts ·
 * consumables. The first three are properties of a TASK (who does it, what skill,
 * which bay) and live on `repair_plan_tasks`; the remaining six are things the job
 * consumes or borrows, and they are these.
 *
 * `part` and `consumable` stay distinct because the quotation flow prices them
 * separately (`07.txt` §9 lists "Parts" and "Consumables" as separate lines). The
 * four equipment kinds stay distinct because §12's conflict check — "required tool
 * unavailable" — will need to ask about each separately once the registries exist.
 */
export const RESOURCE_KINDS = [
  'part',
  'consumable',
  'tool',
  'diagnostic_equipment',
  'lifting_equipment',
  'safety_equipment',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** What a technician reads on the screen — `07.txt` §29's own wording. */
export const RESOURCE_KIND_LABEL: Record<string, string> = {
  part: 'Part',
  consumable: 'Consumable',
  tool: 'Tool',
  diagnostic_equipment: 'Diagnostic equipment',
  lifting_equipment: 'Lifting equipment',
  safety_equipment: 'Safety equipment',
};

/**
 * The label for a stored kind — including one no longer offered.
 *
 * Same judgement as `affectedSystemLabel` and `checkpointLabel`: falling back to the
 * raw value is ugly and truthful, where inventing a label or hiding the row would
 * quietly rewrite a historical plan.
 */
export function resourceKindLabel(value: string): string {
  return RESOURCE_KIND_LABEL[value] ?? value;
}

/**
 * The kinds a quotation prices as materials rather than as equipment.
 *
 * Declared here rather than re-derived at each call site, because slice 5 prices
 * from exactly this split and a second copy of it is a second place to disagree.
 */
export const MATERIAL_KINDS: ReadonlySet<string> = new Set(['part', 'consumable']);

/**
 * Roles that may BUILD a repair plan — `07.txt` pt2 §50.
 *
 * §50 gives the technician "assigned-job inspection, diagnosis, REPAIR PLANNING,
 * execution and testing", and puts the technical workflow under the supervisor. The
 * same set as `CAN_RECORD_DIAGNOSIS`, and for the same reasons.
 *
 * ⚠️ THE ABSENCES, restated because they are decisions:
 *   · `quality_control_inspector` — §50 gives them INDEPENDENT testing and quality
 *     review. Somebody who wrote the plan cannot be the independent check on the
 *     repair carried out from it (`2.txt` §563).
 *   · `storekeeper` — they supply the parts a plan asks for; deciding WHICH parts a
 *     repair needs is a technical judgement, not a stores one.
 *   · `reception_staff` — §50 scopes them to the customer-facing half.
 *   · `customer` — never a party to the technical record.
 */
export const CAN_PLAN_REPAIR = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'technician',
]);

/**
 * Roles that may READ a repair plan.
 *
 * Identical to `CAN_READ_DIAGNOSIS`, and the storekeeper's presence is the one
 * worth naming: §29's parts and consumables are exactly what stores must see to
 * reserve and order against (§24's "Create Purchase Requisition"). The cashier and
 * reception need to know what the job covers; the QC inspector reads the plan to
 * check the work done matches what was approved.
 *
 * `customer` is ABSENT for the reason `2.txt` §557 gives: the vehicle owner receives
 * a prepared QUOTATION, not the workshop's internal task list and labour estimates.
 * Publishing this directly would put the workshop's cost structure in front of the
 * person being charged.
 */
export const CAN_READ_REPAIR_PLAN = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'quality_control_inspector',
  'technician',
  'reception_staff',
  'storekeeper',
  'cashier',
]);

/**
 * Roles that may REVIEW a submitted plan — `07.txt` pt2 §50's "Workshop Supervisor:
 * technical review, REPAIR-PLAN APPROVAL", and §30-§31's internal technical review.
 *
 * ⚠️ `technician` IS ABSENT. §50 names the approval as the supervisor's, and a
 * technician approving a technician's plan is not the check the specification asks
 * for. The reviewer-is-not-the-submitter rule in the service is a SECOND, narrower
 * constraint — it stops a supervisor who built the plan themselves from also signing
 * it off (`2.txt` §563's independence).
 *
 * Both are needed and neither is sufficient. Role alone would let two technicians
 * sign each other's work; identity alone would let a technician sign a colleague's.
 */
export const CAN_REVIEW_REPAIR_PLAN = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
]);

/**
 * The stage a job card must be at for a plan to be STARTED.
 *
 * `07.txt` §22-§24 has planning begin once the diagnosis is complete, and slice 2's
 * lifecycle puts exactly one stage between diagnosis and quotation:
 * `diagnosis_in_progress → solution_preparation → quotation_preparation`. So
 * `solution_preparation` is where the solution is prepared, and §30's "after
 * approval, the repair plan is passed to quotation preparation" is the transition
 * out of it.
 *
 * ⚠️ WHY THIS IS ENFORCED. Without it a plan could be built against a card still at
 * `complaint_received` — labour and parts committed for a car nobody has examined.
 * Like the inspection and diagnosis rules, that is not a harmless early start: a
 * plan is what a customer quotation is priced from.
 *
 * A replan is not blocked. The lifecycle allows `awaiting_customer_approval →
 * solution_preparation`, so revising a plan after the customer asks for changes
 * means moving the card back and starting a NEW ATTEMPT — which is what slice 2's
 * rules already govern and log.
 */
export const REPAIR_PLAN_START_STAGE = 'solution_preparation';

/**
 * The state the source diagnosis must be in before a plan may consume it.
 *
 * ⚠️ THE RULE THIS SLICE EXISTS TO ENFORCE. `07.txt` §25 — "the application loads
 * CONFIRMED faults" — and §22 puts planning after the diagnosis is COMPLETE. A plan
 * built on an unreviewed diagnosis is a customer charged for a technician's
 * unchecked opinion, and a plan built on a REJECTED one is a repair for a fault a
 * supervisor said was not established.
 *
 * `02.txt` §1290's three standings exist precisely so downstream work can rely on
 * the distinction, and this is the first piece of downstream work that does.
 */
export const REQUIRED_DIAGNOSIS_STATUS = 'approved';
