/**
 * Pure rules for the repair variation flow — Phase 5 slice 7b.
 *
 * `07.txt` §14 lists what a variation shall include; §3766 step 12 is the rule
 * the slice exists for:
 *
 *     "The technician PAUSES CHARGEABLE ADDITIONAL WORK UNTIL APPROVAL IS
 *      RECEIVED."
 *
 * Every constraint here exists in PostgreSQL too (migration 032). That
 * duplication is the standing pattern: the database is the enforcement point,
 * and these rules exist so a technician gets a sentence rather than a raw
 * `23514 check_violation`.
 */

export class VariationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariationInputError';
  }
}

export const VARIATION_STATUSES = [
  'draft',
  'internally_reviewed',
  'sent_to_customer',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];

export const DECISION_CHANNELS = ['in_person', 'phone', 'email', 'sms', 'portal'] as const;

/**
 * Who may RAISE a variation.
 *
 * §3764 step 11 puts it in the technician's hands, and that is the point: they
 * are the one with the car apart who can see the worn drop link. Supervisors and
 * above are included because they also work jobs.
 */
export const CAN_RAISE_VARIATION = new Set([
  'technician',
  'workshop_supervisor',
  'workshop_manager',
  'workshop_owner',
  'platform_administrator',
]);

/**
 * Who may REVIEW one internally, and who may record the customer's decision.
 *
 * 🔴 THE TECHNICIAN IS EXCLUDED, AND THAT IS THE WHOLE CONTROL. §3792 requires a
 * variation to be "reviewed internally" before it is sent to the customer — a
 * review the raiser performs on their own work is not a review. It is the same
 * independence shape as the diagnosis review and the QC inspection, and for the
 * same reason: the person who found more work to do should not also be the
 * person who decides it is worth billing for.
 */
export const CAN_REVIEW_VARIATION = new Set([
  'workshop_supervisor',
  'workshop_manager',
  'workshop_owner',
  'platform_administrator',
]);

/** Free-text ceilings. The COLUMNS are `TEXT` (CLAUDE.md forbids VARCHAR(n)). */
export const MAX_TEXT = 4000;
export const MAX_SANE_COST = 1_000_000;

export interface VariationInput {
  newFinding: string;
  additionalWork: string;
  additionalParts: string | null;
  additionalLabourHours: number | null;
  additionalCost: number;
  currency: string;
  effectOnCompletion: string | null;
}

function requiredText(raw: unknown, field: string): string {
  const text = String(raw ?? '').trim();
  if (text === '') throw new VariationInputError(`${field} is required`);
  if (text.length > MAX_TEXT) {
    throw new VariationInputError(`${field} must be ${MAX_TEXT} characters or fewer`);
  }
  return text;
}

function optionalText(raw: unknown, field: string): string | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (text.length > MAX_TEXT) {
    throw new VariationInputError(`${field} must be ${MAX_TEXT} characters or fewer`);
  }
  return text;
}

/**
 * ⚠️ `Number('')` IS 0. On this table that is not a rounding detail: an empty
 * cost field silently becomes a FREE variation, which skips the chargeable
 * consent rules entirely and lets work proceed with no signature against it.
 * Absent is refused; an explicit zero is accepted, because a no-charge variation
 * is a real and useful thing to record.
 */
function requiredNumber(raw: unknown, field: string): number {
  if (raw === undefined || raw === null) throw new VariationInputError(`${field} is required`);
  const text = String(raw).trim();
  if (text === '') throw new VariationInputError(`${field} is required`);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new VariationInputError(`${field} must be a number`);
  return value;
}

export function parseVariationInput(raw: Record<string, unknown>): VariationInput {
  const problems: string[] = [];
  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof VariationInputError) {
        problems.push(err.message);
        return fallback;
      }
      throw err;
    }
  };

  const newFinding = attempt(() => requiredText(raw['newFinding'], 'the new finding'), '');
  const additionalWork = attempt(
    () => requiredText(raw['additionalWork'], 'the additional work required'),
    '',
  );
  const additionalParts = attempt(
    () => optionalText(raw['additionalParts'], 'the additional parts'),
    null,
  );
  const effectOnCompletion = attempt(
    () => optionalText(raw['effectOnCompletion'], 'the effect on completion'),
    null,
  );

  const additionalCost = attempt(
    () => requiredNumber(raw['additionalCost'], 'the additional cost'),
    Number.NaN,
  );
  if (additionalCost < 0) problems.push('the additional cost cannot be negative');
  else if (additionalCost > MAX_SANE_COST) {
    problems.push(
      `the additional cost looks like a typo — ${MAX_SANE_COST.toLocaleString()} is the highest ` +
        'this screen accepts',
    );
  }

  let additionalLabourHours: number | null = null;
  const hoursRaw = raw['additionalLabourHours'];
  if (hoursRaw !== undefined && hoursRaw !== null && String(hoursRaw).trim() !== '') {
    const hours = attempt(
      () => requiredNumber(hoursRaw, 'the additional labour hours'),
      Number.NaN,
    );
    if (Number.isFinite(hours)) {
      if (hours < 0) problems.push('the additional labour hours cannot be negative');
      else additionalLabourHours = hours;
    }
  }

  const currency = String(raw['currency'] ?? 'GHS').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    problems.push('currency must be a three-letter ISO code, for example GHS');
  }

  if (problems.length > 0) throw new VariationInputError(problems.join('; '));

  return {
    newFinding,
    additionalWork,
    additionalParts,
    additionalLabourHours,
    additionalCost,
    currency,
    effectOnCompletion,
  };
}

export interface DecisionInput {
  decision: 'approved' | 'rejected' | 'modified';
  decidedByName: string | null;
  decisionChannel: string | null;
  decisionNote: string | null;
}

/**
 * The customer's answer, as recorded by staff.
 *
 * 🔴 A CHARGEABLE APPROVAL MUST NAME THE CUSTOMER AND THE CHANNEL. Consent with
 * nobody's name against it is not consent, and it is the only thing standing
 * between the workshop and an invoice the customer disputes. Migration 032's
 * `ck_variation_chargeable_consent` refuses it in the database too.
 *
 * ⚠️ NOT REQUIRED WHEN THE VARIATION IS FREE. Demanding a signature for a
 * no-charge courtesy notification would push staff to record £0 variations as
 * nothing at all, losing the record entirely — worse than the paperwork it saves.
 */
export function parseDecision(
  raw: Record<string, unknown>,
  chargeable: boolean,
): DecisionInput {
  const decision = String(raw['decision'] ?? '').trim();
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'modified') {
    throw new VariationInputError(
      'the decision must be approved, rejected, or modified (the customer wants it changed)',
    );
  }

  const problems: string[] = [];
  const decidedByName = String(raw['decidedByName'] ?? '').trim() || null;
  const decisionChannel = String(raw['decisionChannel'] ?? '').trim() || null;
  const decisionNote = String(raw['decisionNote'] ?? '').trim() || null;

  if (decisionChannel !== null && !(DECISION_CHANNELS as readonly string[]).includes(decisionChannel)) {
    problems.push(`the channel must be one of: ${DECISION_CHANNELS.join(', ')}`);
  }

  if (decision === 'approved' && chargeable) {
    if (!decidedByName) {
      problems.push('record WHO approved it — a chargeable approval needs a name against it');
    }
    if (!decisionChannel) {
      problems.push(`record HOW they approved it (${DECISION_CHANNELS.join(', ')})`);
    }
  }

  // A rejection the customer gave a reason for is worth far more to the next
  // conversation than a bare "no". The database agrees.
  if (decision === 'rejected' && !decisionNote) {
    problems.push('a rejection must give a reason, so the workshop knows what to offer instead');
  }

  if (decisionNote && decisionNote.length > MAX_TEXT) {
    problems.push(`the decision note must be ${MAX_TEXT} characters or fewer`);
  }

  if (problems.length > 0) throw new VariationInputError(problems.join('; '));

  return { decision, decidedByName, decisionChannel, decisionNote };
}
