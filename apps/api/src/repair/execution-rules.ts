/**
 * Repair execution rules — Phase 5, slice 7.
 *
 * `07.txt` §31-§33 is the REPAIR EXECUTION FLOW and TECHNICIAN TIME RECORDING;
 * `1.txt` §386 puts repair evidence in Domain 5.
 *
 * ⚠️ MIGRATION 019 IS THE AUTHORITY ON EVERY LIST BELOW — each restates a SQL CHECK,
 * and `execution.spec.ts` compares them against the migration text.
 */

/** The execution lifecycle. `abandoned` requires a reason — see migration 019. */
export const EXECUTION_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * What a single task can be.
 *
 * `blocked` and `skipped` both require a note, because they are the two states
 * somebody else has to act on — a bare status tells the supervisor nothing.
 * `skipped` exists separately from `blocked` because "we did not need to do this
 * after all" and "we cannot do this yet" lead to different conversations.
 */
export const EXECUTION_TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'skipped',
] as const;
export type ExecutionTaskStatus = (typeof EXECUTION_TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  skipped: 'Not required',
};

/**
 * §33's time categories, transcribed.
 *
 * §33 lists the verbs — Start Work, Pause Work, Resume Work, Complete Task, Record
 * Non-Productive Time, Waiting for Parts, Waiting for Approval, Tool Delay, Additional
 * Diagnosis. Start and Resume both OPEN a `productive` entry and Pause CLOSES it, so
 * the verbs are operations and these are the kinds of interval they produce.
 *
 * ⚠️ THE NON-PRODUCTIVE CATEGORIES ARE NOT A DUMPING GROUND. Each names something a
 * different person can fix: parts is procurement's, approval is reception's, a tool
 * delay is the workshop's, additional diagnosis is technical. Collapsing them into one
 * "delay" would record that time was lost and lose who could stop it happening again.
 */
export const TIME_ENTRY_KINDS = [
  'productive',
  'waiting_for_parts',
  'waiting_for_approval',
  'tool_delay',
  'additional_diagnosis',
  'other_non_productive',
] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

export const TIME_ENTRY_KIND_LABEL: Record<string, string> = {
  productive: 'Working',
  waiting_for_parts: 'Waiting for parts',
  waiting_for_approval: 'Waiting for approval',
  tool_delay: 'Tool or equipment delay',
  additional_diagnosis: 'Additional diagnosis',
  other_non_productive: 'Other non-productive time',
};

export function timeEntryKindLabel(value: string): string {
  return TIME_ENTRY_KIND_LABEL[value] ?? value;
}

/** Which kinds count as work done rather than time lost. */
export const PRODUCTIVE_KINDS: ReadonlySet<string> = new Set(['productive']);

/** §8-§9's evidence kinds. `measurement` is one of them — see migration 019. */
export const EVIDENCE_KINDS = [
  'measurement',
  'photo',
  'video',
  'document',
  'observation',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  measurement: 'Measurement',
  photo: 'Photograph',
  video: 'Video',
  document: 'Document',
  observation: 'Observation',
};

export function evidenceKindLabel(value: string): string {
  return EVIDENCE_KIND_LABEL[value] ?? value;
}

/**
 * Roles that may CARRY OUT a repair — `07.txt` pt2 §50.
 *
 * §50 gives the technician "assigned-job inspection, diagnosis, repair planning,
 * EXECUTION and testing". The supervisor is here because they cover the bench and
 * finish a job when a technician goes off shift; the manager and owner because they
 * hold every operational function.
 *
 * ⚠️ ABSENT, and each is a decision:
 *   · `reception_staff` — the customer-facing half. They record what a customer said,
 *     not what a spanner did.
 *   · `storekeeper` — issues the part; fitting it is not stores' work.
 *   · `quality_control_inspector` — §563's independence. Somebody who carried out the
 *     repair cannot be the independent check on it, and slice 9 depends on that
 *     separation being real rather than advisory.
 */
export const CAN_EXECUTE_REPAIR = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'technician',
]);

/**
 * Roles that may READ an execution record.
 *
 * Broad on purpose. The storekeeper reconciles parts fitted against parts issued, the
 * cashier and reception answer "is it ready yet", and the QC inspector reads the whole
 * record — that is what they inspect.
 *
 * `customer` is ABSENT: the vehicle owner receives a completion report, not the
 * technician's time sheet.
 */
export const CAN_READ_EXECUTION = new Set([
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
 * The stages at which a repair is actually being carried out.
 *
 * `authorized_to_start` is where §32's notification lands; `repair_in_progress` is
 * where the work happens. Both are permitted so a technician can press Start Repair
 * from the stage the board put them in without a separate stage move first.
 */
export const EXECUTION_STAGES = ['authorized_to_start', 'repair_in_progress'];

/** §7 — work shall not start until the customer's approval is received. */
export const REQUIRED_PROPOSAL_STATUS = 'approved';

/**
 * §32's five pre-start confirmations.
 *
 * Declared as data rather than five booleans in a form, so the screen, the service and
 * the tests cannot disagree about how many there are or what they are called.
 */
export const READINESS_CHECKS = [
  { key: 'customerApprovalConfirmed', column: 'customer_approval_confirmed', label: 'Customer approval received' },
  { key: 'partsAvailableConfirmed', column: 'parts_available_confirmed', label: 'Parts available' },
  { key: 'toolsAvailableConfirmed', column: 'tools_available_confirmed', label: 'Tools available' },
  { key: 'bayAvailableConfirmed', column: 'bay_available_confirmed', label: 'Service bay available' },
  { key: 'safetyConfirmed', column: 'safety_confirmed', label: 'Safety requirements met' },
] as const;
