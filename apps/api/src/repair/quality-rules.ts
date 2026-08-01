/**
 * Pure rules for the independent quality inspection — Phase 5 slice 9.
 *
 * `2.txt` §563: "Following repair, an INDEPENDENT quality-control inspection
 * should verify that the ORIGINAL COMPLAINT HAS BEEN ADDRESSED and that NO NEW
 * DEFECT WAS INTRODUCED."
 *
 * Separated from the service like every other `*-rules.ts` here, so the
 * decisions are testable without a database. Every constraint below EXISTS IN
 * POSTGRES TOO (migration 030) — that duplication is deliberate and is this
 * repository's standing pattern: the database is the enforcement point, and
 * these rules exist so an inspector gets a sentence instead of a raw
 * `23514 check_violation`.
 *
 * ⚠️ NOTHING HERE IS THE INDEPENDENCE CONTROL. That is
 * `repair.user_worked_on_job_card()` plus the `trg_qc_independence` trigger,
 * which refuse a self-inspection even if every line of this file were deleted.
 */

export class QualityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualityInputError';
  }
}

/**
 * Who may carry out a quality inspection.
 *
 * ⚠️ MIRRORS `ROLE_TARGET_STAGES`, WHERE EACH OF THESE ROLES MAY REACH THE
 * `quality_control` STAGE — and the ABSENCES are the requirement. `technician`
 * is excluded because `1.txt` §394 forbids a technician bypassing
 * "approval, payment, parts or quality-control states"; `reception_staff` is
 * excluded because reception books cars in and hands them back, it does not
 * pass quality control.
 *
 * ⚠️ THE ROLE RULE IS NOT THE INDEPENDENCE RULE, AND BOTH ARE NEEDED. This list
 * stops a technician signing off ANY repair. The identity check stops a
 * supervisor signing off the repair THEY did. Either alone leaves a real hole:
 * the diagnosis slice documents the same pairing for the same reason.
 */
export const CAN_INSPECT = [
  'quality_control_inspector',
  'workshop_supervisor',
  'workshop_manager',
  'workshop_owner',
  'platform_administrator',
] as const;

export type QualityStatus = 'in_progress' | 'passed' | 'failed';

export const MAX_NOTES = 8000;
export const MAX_DEFECT_DESCRIPTION = 4000;

export interface QualityDecisionInput {
  complaintAddressed: boolean;
  newDefectFound: boolean;
  newDefectDescription: string | null;
  notes: string | null;
  /** Derived, never supplied: a pass IS the two answers. */
  status: Exclude<QualityStatus, 'in_progress'>;
}

function requiredBoolean(raw: unknown, field: string): boolean {
  // ⚠️ NOT `Boolean(raw)`. `Boolean('false')` is TRUE, and a form posts strings —
  // so a coercing parse would turn "the complaint was NOT addressed" into a
  // PASS. The accepted values are enumerated instead, and anything else is
  // refused rather than guessed at.
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  throw new QualityInputError(`${field} must be answered yes or no`);
}

function optionalText(raw: unknown, field: string, max: number): string | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (text.length > max) {
    throw new QualityInputError(`${field} must be ${max} characters or fewer`);
  }
  return text;
}

/**
 * Normalise an inspector's decision.
 *
 * 🔴 THE STATUS IS DERIVED, NOT ACCEPTED. §563 asks two questions, and the
 * verdict is their conjunction: a pass is "the complaint was addressed AND no
 * new defect was introduced", and nothing else. Taking `status` from the caller
 * would let a screen (or a future API consumer) record "complaint not addressed"
 * alongside "passed" — a contradiction that reads fine and is discovered by the
 * customer. Migration 030's `ck_qc_decision_consistent` refuses that pairing at
 * the database too; this is where it gets an explanation instead of a 500.
 *
 * Every problem is collected before throwing, so an inspector who left two
 * things out is told both.
 */
export function parseQualityDecision(raw: Record<string, unknown>): QualityDecisionInput {
  const problems: string[] = [];

  let complaintAddressed = false;
  let newDefectFound = false;
  try {
    complaintAddressed = requiredBoolean(raw['complaintAddressed'], 'whether the complaint was addressed');
  } catch (err) {
    problems.push((err as Error).message);
  }
  try {
    newDefectFound = requiredBoolean(raw['newDefectFound'], 'whether a new defect was found');
  } catch (err) {
    problems.push((err as Error).message);
  }

  let newDefectDescription: string | null = null;
  let notes: string | null = null;
  try {
    newDefectDescription = optionalText(
      raw['newDefectDescription'],
      'the new-defect description',
      MAX_DEFECT_DESCRIPTION,
    );
  } catch (err) {
    problems.push((err as Error).message);
  }
  try {
    notes = optionalText(raw['notes'], 'the notes', MAX_NOTES);
  } catch (err) {
    problems.push((err as Error).message);
  }

  // A new defect nobody described cannot be acted on by the technician it goes
  // back to. The mirror of the diagnosis rule that a rejection must say why.
  if (newDefectFound && newDefectDescription === null) {
    problems.push(
      'a new defect must be described, so the technician it goes back to knows what to look at',
    );
  }

  if (problems.length > 0) {
    throw new QualityInputError(problems.join('; '));
  }

  return {
    complaintAddressed,
    newDefectFound,
    newDefectDescription,
    notes,
    status: complaintAddressed && !newDefectFound ? 'passed' : 'failed',
  };
}

/** Whether this role may inspect at all. Not the whole rule — see CAN_INSPECT. */
export function mayInspect(role: string): boolean {
  return (CAN_INSPECT as readonly string[]).includes(role);
}
