/**
 * Diagnosis rules — Phase 5, slice 3b.
 *
 * `07.txt` §3026-§3046 is the DIAGNOSIS FLOW's recordable content and `02.txt`
 * §1260-§1294 is the rule set around it. Both are transcribed here in the order
 * the specifications give them, not paraphrased, for the same reason slice 3a's
 * checklist is: this is what a technician signs their name to, what a supervisor
 * reviews, and what a customer quotation is later built from.
 *
 * ⚠️ MIGRATION 012 IS THE AUTHORITY ON EVERY LIST BELOW. Each one restates a SQL
 * CHECK constraint, and a drifted transcription either rejects an answer the
 * database would accept or offers one it will refuse with a 500. `diagnosis.spec.ts`
 * compares all four against the migration text — the same drift test
 * `inspection-checklist.ts` carries, for the same reason.
 */

/**
 * The diagnosis lifecycle — `02.txt` §1292's review, made explicit.
 *
 * `submitted` is the technician's statement; `approved` and `rejected` are the
 * supervisor's answer to it.
 *
 * ⚠️ THERE IS NO WAY BACK TO `in_progress`, and that is the design rather than an
 * omission. A rejected diagnosis stays as the record of what was claimed and what
 * the reviewer said about it; the next look is a NEW ATTEMPT. Reopening it would
 * erase the disagreement, which is the one thing a review exists to record — and
 * it is enforced by trigger in 012, not only here.
 */
export const DIAGNOSIS_STATUSES = ['in_progress', 'submitted', 'approved', 'rejected'] as const;

export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

/** The two answers a reviewer may give (§1292). */
export const REVIEW_DECISIONS = ['approved', 'rejected'] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * `02.txt` §1290 — "identify CONFIRMED, SUSPECTED and EXCLUDED faults".
 *
 * A STATUS on each finding, not a boolean. `excluded` is the one that is easy to
 * drop and expensive to lose: a fault ruled out is the most useful thing on the
 * sheet when the same car comes back with the same symptom, and without it the
 * only record of the test is its absence.
 */
export const FINDING_STATUSES = ['confirmed', 'suspected', 'excluded'] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * `02.txt` §1294 — "the system shall preserve the distinction between AI
 * SUGGESTIONS and technician-confirmed findings."
 *
 * ⚠️ `ai_suggestion` IS DECLARED AND DELIBERATELY UNREACHABLE FROM THIS SERVICE.
 * There is no AI in this build; Phase 8 brings it, and it will write findings
 * through its own path. `DiagnosisService` hardcodes `technician` on every write
 * rather than accepting a `source` field — a caller that could name its own source
 * could file a machine's guess as a technician's finding, which is exactly the
 * distinction §1294 asks to be preserved.
 *
 * The column and the constraint land NOW anyway: once findings exist with no
 * source, no migration can say which of them a machine proposed.
 */
export const FINDING_SOURCES = ['technician', 'ai_suggestion'] as const;

export type FindingSource = (typeof FINDING_SOURCES)[number];

/**
 * `07.txt` §3032's affected system, constrained to `08.txt` §9's Fault Condition
 * Library categories.
 *
 * A fixed vocabulary rather than free text, so findings can later be indexed
 * against that library (Phase 9) instead of matched on spelling. `other` is
 * present on purpose: without it a technician facing a fault that fits none of the
 * five would pick the nearest, and a wrong category is worse than an honest
 * unknown.
 */
export const AFFECTED_SYSTEMS = [
  'electrical',
  'sensor_actuator',
  'network_module',
  'mechanical',
  'fluid_thermal',
  'other',
] as const;

export type AffectedSystem = (typeof AFFECTED_SYSTEMS)[number];

/** What a technician reads on the screen — `08.txt` §9's own wording. */
export const AFFECTED_SYSTEM_LABEL: Record<string, string> = {
  electrical: 'Electrical',
  sensor_actuator: 'Sensor / actuator',
  network_module: 'Network / control module',
  mechanical: 'Mechanical',
  fluid_thermal: 'Fluid / thermal',
  other: 'Other',
};

/**
 * The label for a stored category — including one no longer offered.
 *
 * Same judgement as `checkpointLabel`: falling back to the raw value is ugly and
 * truthful, where inventing a label or hiding the row would quietly rewrite a
 * historical diagnosis.
 */
export function affectedSystemLabel(value: string): string {
  return AFFECTED_SYSTEM_LABEL[value] ?? value;
}

/**
 * Roles that may RECORD a diagnosis — `07.txt` pt2 §50.
 *
 * The same set as `CAN_RECORD_INSPECTION`, and for the same reasons: §50 gives the
 * technician "ASSIGNED-JOB inspection, DIAGNOSIS, repair planning, execution and
 * testing", and puts the technical workflow under the supervisor.
 *
 * ⚠️ THE ABSENCES, restated because they are decisions:
 *   · `quality_control_inspector` — §50 gives them INDEPENDENT testing and quality
 *     review. A person who wrote the diagnosis cannot be the independent check on
 *     the repair that followed from it (`2.txt` §563).
 *   · `reception_staff` — §50 scopes them to the customer-facing half. A complaint
 *     is what the customer said; a diagnosis is what the workshop found.
 *   · `customer` — never a party to the technical record.
 */
export const CAN_RECORD_DIAGNOSIS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'technician',
]);

/**
 * Roles that may READ a diagnosis.
 *
 * Identical to `CAN_READ_INSPECTION`. The storekeeper needs the confirmed faults
 * to know what to order, the cashier and reception need to know what the job
 * covers, and the QC inspector reads the diagnosis to check the confirmed fault
 * was actually addressed (`2.txt` §563).
 *
 * `customer` is ABSENT for the reason `2.txt` §557 gives: the vehicle owner
 * receives a prepared diagnostic report and a quotation, not the technician's
 * working notes. Publishing this sheet directly would put a `suspected` fault in
 * front of a customer as though it were established.
 */
export const CAN_READ_DIAGNOSIS = new Set([
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
 * Roles that may REVIEW a submitted diagnosis — `02.txt` §1292's "supervisor
 * review".
 *
 * ⚠️ `technician` IS ABSENT, and this is the one role boundary that is not shared
 * with slice 3a. §1292 names a SUPERVISOR review; a technician approving a
 * technician's diagnosis is not the check the specification asks for. The
 * reviewer-is-not-the-submitter rule in the service is a SECOND, narrower
 * constraint — it stops a supervisor who recorded the diagnosis themselves from
 * also signing it off (`2.txt` §563's independence).
 *
 * Both are needed. Role alone would let two technicians sign each other's work;
 * identity alone would let a technician sign a colleague's.
 */
export const CAN_REVIEW_DIAGNOSIS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
]);

/**
 * The stage a job card must be at for a diagnosis to be STARTED.
 *
 * `07.txt` §3020-§3024 has the technician opening an assigned job already at
 * diagnosis. In this lifecycle that means the inspection has happened:
 * `STAGE_TRANSITIONS` only reaches `diagnosis_in_progress` from
 * `initial_inspection`, `further_information_required` or the hold/resume paths.
 *
 * ⚠️ WHY THIS IS ENFORCED. Without it a diagnosis could be recorded against a card
 * at `complaint_received` — a fault attributed to a car nobody has examined. Like
 * the inspection rule, that is not a harmless early start: a confirmed fault is
 * what a quotation charges for.
 *
 * A second look is not blocked. The lifecycle allows
 * `further_information_required → diagnosis_in_progress`, so re-diagnosing means
 * moving the card back and starting a NEW ATTEMPT — which is what slice 2's rules
 * already govern and log.
 */
export const DIAGNOSIS_START_STAGE = 'diagnosis_in_progress';
