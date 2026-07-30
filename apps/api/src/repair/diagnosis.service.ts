import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { optionalOneOf, optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  AFFECTED_SYSTEMS,
  CAN_READ_DIAGNOSIS,
  CAN_RECORD_DIAGNOSIS,
  CAN_REVIEW_DIAGNOSIS,
  DIAGNOSIS_START_STAGE,
  FINDING_STATUSES,
  REVIEW_DECISIONS,
  affectedSystemLabel,
  type AffectedSystem,
  type DiagnosisStatus,
  type FindingSource,
  type FindingStatus,
  type ReviewDecision,
} from './diagnosis-rules';

export interface DiagnosticFinding {
  id: string;
  position: number;
  /** §3028 — nullable: plenty of real faults set no trouble code. */
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: AffectedSystem | string;
  /** Resolved from the stored value, so a retired category still renders. */
  affectedSystemLabel: string;
  observedSymptom: string | null;
  testPerformed: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  interpretation: string | null;
  findingStatus: FindingStatus | string;
  /** §1294 — `technician` or `ai_suggestion`. Never inferred; always stored. */
  source: FindingSource | string;
  /**
   * Who signed the confirmation, if it is confirmed. §1294 made visible: a
   * confirmed fault can always answer "who says so".
   */
  confirmedByName: string | null;
  confirmedAt: string | null;
  additionalInspectionRequired: boolean;
  recordedByName: string | null;
  recordedAt: string;
}

export interface Diagnosis {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  attemptNo: number;
  status: DiagnosisStatus;
  summary: string | null;
  startedByName: string | null;
  startedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  findings: DiagnosticFinding[];
  /**
   * Derived, never stored. A stored copy would be a second statement of the same
   * fact, free to drift the moment a finding's status changes.
   */
  confirmedCount: number;
  suspectedCount: number;
  excludedCount: number;
  /** §3046 — how many findings ask for another look. */
  additionalInspectionCount: number;
  /**
   * Whether THIS viewer may still write to THIS diagnosis.
   *
   * ⚠️ A UI CONVENIENCE, NEVER A CONTROL. Every write re-derives the whole
   * judgement server-side; a disabled button is a suggestion and anyone can call
   * the API directly (CLAUDE.md §8 — hidden is not secure).
   */
  editable: boolean;
  /**
   * Whether THIS viewer may review it. Same caveat — the service re-checks the
   * role AND that the reviewer is not the submitter on the write path.
   */
  reviewable: boolean;
}

/** What `addFinding`/`updateFinding` accept. Every field is §3026-§3046. */
interface FindingInput {
  faultCode?: string;
  faultDescription?: string;
  affectedSystem?: string;
  observedSymptom?: string;
  testPerformed?: string;
  expectedResult?: string;
  actualResult?: string;
  interpretation?: string;
  findingStatus?: string;
  additionalInspectionRequired?: boolean;
}

/**
 * The diagnosis record for a job card — `07.txt` §3026-§3046, `02.txt` §1260-§1294.
 *
 * ── HOW THIS DIFFERS FROM THE INSPECTION SHEET, AND WHY ────────────────────
 *
 * An inspection is a TEMPLATE: all 19 checkpoints are created with the header,
 * because a sheet must record what was ASKED as well as answered. A diagnosis is
 * the opposite — nobody knows in advance how many faults a car has, so findings
 * are ADDED as they are found and the header starts empty.
 *
 * That one difference drives the rest. There is no "every question answered" gate,
 * because there are no questions; the gate is that a submitted diagnosis says
 * SOMETHING (`submit` refuses zero findings). And an entry error cannot be fixed by
 * re-answering a row, so a finding can be removed while the diagnosis is open —
 * see migration 013 for why that grant exists.
 *
 * Everything else is slice 3a's shape unchanged: header plus child rows, attempts
 * rather than edits, immutable on submission in the service AND by trigger, role
 * rules in their own module with a drift test against the migration.
 */
@Injectable()
export class DiagnosisService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every diagnosis recorded against a job card, newest attempt first.
   *
   * Reads the card through the SAME scoping predicates `JobCardService` uses, so
   * the scopes are inherited rather than restated: staff see their organisation, a
   * technician only cards assigned to them.
   */
  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Diagnosis[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any diagnosis is read —
      // otherwise an empty list would mean both "none yet" and "not your card",
      // and the endpoint would confirm which cards exist.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readDiagnoses(client, ctx, { jobCardId: cardId });
    });
  }

  /**
   * Every diagnosis in the organisation, newest attempt first.
   *
   * Serves the diagnosis queue and the §47 review queue in one request rather than
   * one per card — the N+1 that is slowest exactly when the queue is longest.
   * Inherits the technician narrowing from `readDiagnoses`.
   */
  async list(ctx: TenantContext): Promise<Diagnosis[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readDiagnoses(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<Diagnosis> {
    this.assertMayRead(ctx);
    const diagnosisId = requireUuid(id, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readDiagnoses(client, ctx, { diagnosisId });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * §3020-§3024 — the technician opens the assigned job and begins diagnosing.
   *
   * Header only. Unlike an inspection there is nothing to pre-create: the findings
   * are what the diagnosis discovers.
   */
  async start(
    ctx: TenantContext,
    jobCardId: string,
    input: { summary?: string } = {},
  ): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    const summary = optionalText(input.summary, 'summary', 8000);

    return this.db.withTenant(ctx, async (client) => {
      // FOR UPDATE on the card: two technicians pressing Start at the same moment
      // would otherwise both read "highest attempt = 1" and both try to write
      // attempt 2. The unique constraint would catch the second, but as a 500
      // about a constraint name; locking the card turns it into a clean sequence.
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      // ── the inspection must have happened ────────────────────────────────
      // See DIAGNOSIS_START_STAGE: a confirmed fault recorded against a card at
      // `complaint_received` is a charge attributed to a car nobody examined.
      if (card.stage !== DIAGNOSIS_START_STAGE) {
        throw new BadRequestException(
          `a diagnosis may only be started while the job card is at ` +
            `'${DIAGNOSIS_START_STAGE}'; this card is at '${card.stage}'. ` +
            `Move the card to '${DIAGNOSIS_START_STAGE}' first.`,
        );
      }

      // ── ONE UNSETTLED DIAGNOSIS AT A TIME ────────────────────────────────
      //
      // Two in-progress records for one card is not a second opinion — it is two
      // people recording half a diagnosis each, and nothing says which one the
      // repair plan should be built from.
      //
      // ⚠️ `submitted` BLOCKS A NEW ATTEMPT TOO, and that is the half this slice
      // originally got wrong (Codex, HIGH — accepted). Allowing it made §1292's
      // review BYPASSABLE without deleting anything: submit attempt 1, immediately
      // start attempt 2, and because every queue and this service order by
      // `attempt_no DESC`, the in-progress attempt 2 becomes "the current record"
      // and the submitted attempt 1 stops being surfaced. The awaiting-review count
      // falls to zero while a diagnosis is still unreviewed. The row survived; the
      // obligation to review it did not, which is worse than a lost row because
      // nothing looks wrong.
      //
      // So a further opinion waits for the supervisor's answer. That is also the
      // honest workshop rule: re-diagnosing while somebody is still reading your
      // last diagnosis wastes both people's time.
      const unsettled = await client.query(
        `SELECT id, status FROM repair.diagnoses
          WHERE job_card_id = $1 AND tenant_id = $2
            AND status IN ('in_progress', 'submitted')
          ORDER BY attempt_no DESC
          LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const blocking = unsettled.rows[0] as { id: string; status: string } | undefined;
      if (blocking) {
        // Two different situations, two different sentences — the caller's next
        // action is not the same, and "already has a diagnosis" would leave a
        // technician pressing a button that cannot work.
        throw new ConflictException(
          blocking.status === 'in_progress'
            ? 'this job card already has a diagnosis in progress; submit it before starting another'
            : 'the previous diagnosis for this job card is awaiting supervisor review; ' +
              'a new attempt can only be started once it has been approved or rejected',
        );
      }

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.diagnoses
          WHERE job_card_id = $1 AND tenant_id = $2`,
        [cardId, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.diagnoses
           (tenant_id, organization_id, job_card_id, attempt_no, summary,
            started_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$6)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, cardId, attemptNo, summary, ctx.userId],
      );
      const diagnosisId = inserted.rows[0].id as string;

      await this.audit.write(client, ctx, {
        action: 'diagnosis.started',
        resourceType: 'diagnosis',
        resourceId: diagnosisId,
        // The job number and attempt, never the notes: a technician's working note
        // can contain anything, and the audit trail is read by people who need to
        // know a diagnosis happened (`1.txt` §1646).
        detail: { jobNumber: card.job_number, attemptNo },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * §3026-§3046 — record one finding.
   *
   * ONE AT A TIME, unlike the inspection's batch. A checklist is worked down in a
   * sweep, so batching nineteen answers saves nineteen round trips; a finding is a
   * paragraph of reasoning written once. A batch endpoint here would mean holding
   * several half-written findings in the browser and losing all of them together.
   */
  async addFinding(
    ctx: TenantContext,
    diagnosisId: string,
    input: FindingInput,
  ): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const id = requireUuid(diagnosisId, 'id');

    // §3030 — the one field that must be present. A finding with no description is
    // not a finding, and the migration's CHECK says the same thing.
    const faultDescription = requireText(input.faultDescription, 'faultDescription', 2000);
    const affectedSystem = requireOneOf(input.affectedSystem, AFFECTED_SYSTEMS, 'affectedSystem');
    const fields = this.validateOptionalFields(input);
    const findingStatus =
      optionalOneOf(input.findingStatus, FINDING_STATUSES, 'findingStatus') ?? 'suspected';

    return this.db.withTenant(ctx, async (client) => {
      const diagnosis = await this.assertWritable(client, ctx, id);

      // `position` is assigned server-side from what is already there rather than
      // taken from the caller: two findings claiming position 2 have no defined
      // order, and the order is how a reader follows the reasoning.
      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.diagnostic_findings
          WHERE diagnosis_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      const confirmed = findingStatus === 'confirmed';

      await client.query(
        `INSERT INTO repair.diagnostic_findings
           (tenant_id, organization_id, diagnosis_id, position,
            fault_code, fault_description, affected_system,
            observed_symptom, test_performed, expected_result, actual_result,
            interpretation, finding_status, source,
            confirmed_by, confirmed_at, additional_inspection_required, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 -- ⚠️ SOURCE IS HARDCODED, NOT ACCEPTED FROM THE CALLER. §1294 asks
                 -- the distinction between an AI suggestion and a technician's
                 -- finding to be PRESERVED; a caller free to name its own source
                 -- could file a machine's guess as a technician's finding, which is
                 -- the distinction collapsing rather than being preserved. Phase 8's
                 -- AI path will write its own value through its own code.
                 'technician',
                 $14,$15,$16,$17)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          id,
          Number(next.rows[0].n),
          fields.faultCode,
          faultDescription,
          affectedSystem,
          fields.observedSymptom,
          fields.testPerformed,
          fields.expectedResult,
          fields.actualResult,
          fields.interpretation,
          findingStatus,
          // §1294 made structural: a finding is `confirmed` only if a human is
          // named against it. The migration's CHECK refuses the row otherwise, so
          // these two are not optional decoration.
          confirmed ? ctx.userId : null,
          confirmed ? new Date() : null,
          fields.additionalInspectionRequired,
          ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'diagnosis.finding_recorded',
        resourceType: 'diagnosis',
        resourceId: id,
        // The CATEGORY and the standing, never the description: the affected
        // system and the status are a fixed vocabulary from the specification, so
        // they carry no free text into the audit trail.
        detail: {
          jobNumber: diagnosis.job_number,
          affectedSystem,
          findingStatus,
        },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * Correct a finding while the diagnosis is still open.
   *
   * PARTIAL, with three distinct meanings per field — and the third one is the point
   * (Codex, MEDIUM — accepted):
   *
   *   · ABSENT (`undefined`)  → leave the column alone. So a technician promoting a
   *     suspected fault to confirmed does not resend the paragraph they wrote.
   *   · `null` or `''`        → CLEAR the column, for the fields 012 makes nullable.
   *   · a value               → set it.
   *
   * ⚠️ WHY "CLEAR" HAD TO EXIST. The first version used `COALESCE($n, column)`
   * throughout, which collapses "clear this" and "not mentioned" into the same
   * request — so a fault code typed against a fault that turns out to have no DTC
   * could be overwritten with a DIFFERENT wrong code but never removed. The only way
   * out was deleting the finding and retyping the reasoning, which loses the
   * evidence to fix a single field and reads in the audit trail as though the whole
   * finding had been wrong. A capability whose only route is destroying the record
   * around it is the unreachable-alternative trap in another costume.
   *
   * ⚠️ AND WHY `undefined`-MEANS-LEAVE IS SAFE. `JSON.stringify` omits undefined
   * properties entirely, so a client cannot accidentally send `null` for a field it
   * never mentioned — the two are distinguishable on the wire, which is what makes
   * this contract implementable rather than merely desirable.
   *
   * `faultDescription`, `affectedSystem` and `findingStatus` are NOT clearable: 012
   * declares them NOT NULL, and `fault_description` additionally CHECKs that it is
   * non-blank. Sending `null` for one of those is a 400 naming the field rather than
   * a constraint violation surfacing as a 500.
   */
  async updateFinding(
    ctx: TenantContext,
    diagnosisId: string,
    findingId: string,
    input: FindingInput,
  ): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const id = requireUuid(diagnosisId, 'id');
    const targetId = requireUuid(findingId, 'findingId');

    // ── build the SET list from the fields the caller actually mentioned ────
    //
    // Assembled rather than a fixed statement of COALESCEs, because that is the
    // only way "omitted" and "cleared" stay different things. Column names come
    // from the literals below and NEVER from the request, so nothing caller-supplied
    // reaches the SQL text — every value is a bound parameter.
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    /** A nullable text column: absent leaves it, null/'' clears it. */
    const nullableText = (
      column: string,
      raw: unknown,
      field: string,
      max: number,
    ): void => {
      if (raw === undefined) return;
      set(column, raw === null || raw === '' ? null : optionalText(raw, field, max));
    };

    // The three NOT NULL columns. `requireText`/`requireOneOf` reject null with a
    // message naming the field, which is what makes an attempt to clear one a clean
    // 400 rather than a 23502 from Postgres.
    if (input.faultDescription !== undefined) {
      set('fault_description', requireText(input.faultDescription, 'faultDescription', 2000));
    }
    if (input.affectedSystem !== undefined) {
      set('affected_system', requireOneOf(input.affectedSystem, AFFECTED_SYSTEMS, 'affectedSystem'));
    }
    const findingStatus =
      input.findingStatus === undefined
        ? null
        : requireOneOf(input.findingStatus, FINDING_STATUSES, 'findingStatus');
    if (findingStatus !== null) {
      set('finding_status', findingStatus);
    }

    nullableText('fault_code', input.faultCode, 'faultCode', 64);
    nullableText('observed_symptom', input.observedSymptom, 'observedSymptom', 2000);
    nullableText('test_performed', input.testPerformed, 'testPerformed', 2000);
    nullableText('expected_result', input.expectedResult, 'expectedResult', 2000);
    nullableText('actual_result', input.actualResult, 'actualResult', 2000);
    nullableText('interpretation', input.interpretation, 'interpretation', 8000);

    if (input.additionalInspectionRequired !== undefined) {
      set('additional_inspection_required', input.additionalInspectionRequired === true);
    }

    // ⚠️ THE CONFIRMATION SIGNATURE MOVES WITH THE STATUS, IN BOTH DIRECTIONS.
    //
    // Setting `confirmed` stamps whoever confirmed it — that is §1294's whole point.
    // Setting anything ELSE clears the stamp, which is the half that is easy to
    // forget: a finding downgraded from confirmed to suspected while still naming a
    // confirmer would read as though someone had signed for a fault that is no
    // longer established. The CHECK constraint does not catch that, because it only
    // constrains rows that ARE confirmed.
    //
    // When the status is not being changed, both columns are left alone — the
    // attribution already agrees with the standing, and touching it would rewrite
    // WHEN a fault was confirmed every time an unrelated typo was fixed.
    if (findingStatus === 'confirmed') {
      // COALESCE, so re-saving a finding that is already confirmed does not move the
      // signature to whoever last edited it. The first person to confirm it is the
      // one who says so.
      values.push(ctx.userId);
      sets.push(`confirmed_by = COALESCE(confirmed_by, $${values.length})`);
      sets.push('confirmed_at = COALESCE(confirmed_at, now())');
    } else if (findingStatus !== null) {
      sets.push('confirmed_by = NULL', 'confirmed_at = NULL');
    }

    if (sets.length === 0) {
      throw new BadRequestException('nothing to update');
    }

    // Always, and after the caller's fields so it cannot be overwritten by one:
    // whoever last touched the row, and when.
    set('recorded_by', ctx.userId);
    sets.push('recorded_at = now()');

    // ⚠️ THE STATEMENT AND ITS PARAMETERS ARE FINISHED HERE, BEFORE THE
    // TRANSACTION. Appending to `values` inside the callback would make the query
    // depend on how many times the callback runs — correct today because
    // `withTenant` invokes it once, and silently wrong the day it retries. A
    // statement built from mutable state outside its own closure is the kind of
    // thing that works until it does not.
    values.push(targetId, id, ctx.tenantId);
    const sql = `UPDATE repair.diagnostic_findings
            SET ${sets.join(', ')}
          WHERE id = $${values.length - 2}
            AND diagnosis_id = $${values.length - 1}
            AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const diagnosis = await this.assertWritable(client, ctx, id);

      const updated = await client.query(sql, values);
      // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look
      // successful. Reported rather than silently skipped — the same lesson
      // `'ApiFailure' in 'describeApiFailure'` taught, in SQL form.
      if (updated.rowCount === 0) {
        throw new NotFoundException('finding not found on this diagnosis');
      }

      await this.audit.write(client, ctx, {
        action: 'diagnosis.finding_updated',
        resourceType: 'diagnosis',
        resourceId: id,
        detail: {
          jobNumber: diagnosis.job_number,
          findingId: targetId,
          findingStatus: findingStatus ?? 'unchanged',
        },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * Remove a finding entered in error, while the diagnosis is still open.
   *
   * ⚠️ THE ESCAPE HATCH FOR AN ENTRY ERROR, and it exists because the alternatives
   * are all worse. `excluded` means "a fault I ruled out" (§1290) and recording a
   * typo as one puts a false statement in the record; a second attempt cannot be
   * started while this one is open; and `update` can correct a finding but cannot
   * remove a duplicate. Without this the technician's only route was to leave a
   * wrong finding standing — a rule refusing something while naming an unreachable
   * alternative, which is the trap slice 3a paid for.
   *
   * Refused once the diagnosis is submitted, by `assertWritable` here AND by
   * trigger in the database. See migration 013.
   */
  async removeFinding(
    ctx: TenantContext,
    diagnosisId: string,
    findingId: string,
  ): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const id = requireUuid(diagnosisId, 'id');
    const targetId = requireUuid(findingId, 'findingId');

    return this.db.withTenant(ctx, async (client) => {
      const diagnosis = await this.assertWritable(client, ctx, id);

      const removed = await client.query(
        `DELETE FROM repair.diagnostic_findings
          WHERE id = $1 AND diagnosis_id = $2 AND tenant_id = $3`,
        [targetId, id, ctx.tenantId],
      );
      if (removed.rowCount === 0) {
        throw new NotFoundException('finding not found on this diagnosis');
      }

      await this.audit.write(client, ctx, {
        action: 'diagnosis.finding_removed',
        resourceType: 'diagnosis',
        resourceId: id,
        // The one audit entry that must exist: a row that is gone leaves no other
        // trace, so this is the only record that it was ever there.
        detail: { jobNumber: diagnosis.job_number, findingId: targetId },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  /** §376's technician notes and §3042's interpretation of the whole diagnosis. */
  async recordSummary(
    ctx: TenantContext,
    diagnosisId: string,
    input: { summary?: string },
  ): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const id = requireUuid(diagnosisId, 'id');
    const summary = optionalText(input.summary, 'summary', 8000);
    if (summary === null) {
      throw new BadRequestException('summary is required');
    }

    return this.db.withTenant(ctx, async (client) => {
      const diagnosis = await this.assertWritable(client, ctx, id);

      await client.query(
        `UPDATE repair.diagnoses
            SET summary = $1, updated_at = now(), updated_by = $2
          WHERE id = $3 AND tenant_id = $4`,
        [summary, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'diagnosis.summary_recorded',
        resourceType: 'diagnosis',
        resourceId: id,
        detail: { jobNumber: diagnosis.job_number },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * §1292 — submit the diagnosis for supervisor review.
   *
   * It stops being writable and becomes the claim the reviewer answers.
   */
  async submit(ctx: TenantContext, diagnosisId: string): Promise<Diagnosis> {
    this.assertMayRecord(ctx);
    const id = requireUuid(diagnosisId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const diagnosis = await this.assertWritable(client, ctx, id);

      // ⚠️ THE ZERO-FINDINGS GATE, GUARDED UP FRONT.
      //
      // Slice 3a shipped the mirror image of this and the Supervisor caught it:
      // "is any checkpoint unanswered" is FALSE for a sheet with no checkpoints, so
      // an empty inspection submitted cleanly and became a finding of record
      // stating a vehicle had been inspected against nothing. A vacuous truth in
      // the one gate the slice existed to provide.
      //
      // Here the same hole is wider, because a diagnosis legitimately starts empty
      // — there is no template to pre-create. So this is not a defensive count
      // against an unreachable state, it is THE completeness rule: a submitted
      // diagnosis with no findings is a supervisor being asked to approve silence,
      // and downstream it is a repair plan built from nothing.
      const findingCount = await client.query(
        `SELECT count(*)::int AS n
           FROM repair.diagnostic_findings
          WHERE diagnosis_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      if (Number(findingCount.rows[0].n) === 0) {
        throw new BadRequestException(
          'a diagnosis cannot be submitted with no findings recorded; record at least one ' +
            "finding — a fault ruled out is a finding too, recorded as 'excluded'",
        );
      }

      await client.query(
        `UPDATE repair.diagnoses
            SET status = 'submitted', submitted_by = $1, submitted_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      const byStatus = await client.query(
        `SELECT finding_status, count(*)::int AS n
           FROM repair.diagnostic_findings
          WHERE diagnosis_id = $1 AND tenant_id = $2
          GROUP BY finding_status`,
        [id, ctx.tenantId],
      );
      const counts: Record<string, number> = {};
      for (const row of byStatus.rows as Array<{ finding_status: string; n: number }>) {
        counts[row.finding_status] = Number(row.n);
      }

      await this.audit.write(client, ctx, {
        action: 'diagnosis.submitted',
        resourceType: 'diagnosis',
        resourceId: id,
        detail: {
          jobNumber: diagnosis.job_number,
          attemptNo: diagnosis.attempt_no,
          confirmed: counts.confirmed ?? 0,
          suspected: counts.suspected ?? 0,
          excluded: counts.excluded ?? 0,
        },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  /**
   * §1292's supervisor review — approve, or reject with a reason.
   *
   * ── THE INDEPENDENCE RULE (`2.txt` §563), IN TWO PARTS ─────────────────────
   *
   * Both are needed and neither is sufficient:
   *   · ROLE — `CAN_REVIEW_DIAGNOSIS` excludes `technician`, so two technicians
   *     cannot sign each other's work.
   *   · IDENTITY — the reviewer may not be the submitter, so a supervisor who
   *     recorded the diagnosis themselves cannot also approve it.
   *
   * The row keeps both names, so the claim is auditable rather than assumed.
   */
  async review(
    ctx: TenantContext,
    diagnosisId: string,
    input: { decision?: string; note?: string },
  ): Promise<Diagnosis> {
    this.assertMayReview(ctx);
    const id = requireUuid(diagnosisId, 'id');
    const decision: ReviewDecision = requireOneOf(input.decision, REVIEW_DECISIONS, 'decision');
    const note = optionalText(input.note, 'note', 8000);

    // A rejection must say why — the migration's CHECK agrees, and this is the
    // clear 400 rather than a constraint violation surfacing as a 500. An approval
    // needs no note: "it is correct" adds nothing, but a technician told only
    // "rejected" cannot act on it.
    if (decision === 'rejected' && note === null) {
      throw new BadRequestException('a rejection must give a reason; note is required');
    }

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT d.id, d.status, d.attempt_no, d.submitted_by, j.job_number
           FROM repair.diagnoses d
           JOIN repair.job_cards j
             ON j.id = d.job_card_id AND j.tenant_id = d.tenant_id
          WHERE d.id = $1 AND d.tenant_id = $2 AND d.organization_id = $3
          -- Serialises two supervisors answering the same diagnosis, so the second
          -- reads the status the first committed. Without it both could pass the
          -- status check and one write would land on a reviewed row — refused by
          -- the trigger, but as a 500.
          FOR UPDATE OF d`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as ReviewRow | undefined;
      // 404, not 403 — the same non-oracle rule as every other read here.
      if (!row) throw new NotFoundException('diagnosis not found');

      if (row.status === 'in_progress') {
        throw new ConflictException(
          'this diagnosis has not been submitted yet and cannot be reviewed',
        );
      }
      if (row.status !== 'submitted') {
        throw new ConflictException(
          `this diagnosis was already ${row.status} and cannot be reviewed again; ` +
            'a further opinion is recorded as a new attempt',
        );
      }
      // ⚠️ THE INDEPENDENCE CHECK. A 403 rather than a 409: what refuses the caller
      // here IS their standing on this particular record, unlike the status cases
      // above where the record's state is what refuses them.
      if (row.submitted_by !== null && row.submitted_by === ctx.userId) {
        throw new ForbiddenException(
          'you submitted this diagnosis and cannot also review it; ' +
            'another supervisor must review it',
        );
      }

      await client.query(
        `UPDATE repair.diagnoses
            SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3,
                updated_at = now(), updated_by = $2
          WHERE id = $4 AND tenant_id = $5`,
        [decision, ctx.userId, note, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: decision === 'approved' ? 'diagnosis.approved' : 'diagnosis.rejected',
        resourceType: 'diagnosis',
        resourceId: id,
        // The DECISION and the job, never the reviewer's free-text reason — the
        // audit trail records that a review happened, and the reason lives on the
        // record itself where the technician reads it.
        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
      });

      const rows = await this.readDiagnoses(client, ctx, { diagnosisId: id });
      return DiagnosisService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /**
   * One query for the headers, one for the findings — not one per diagnosis.
   *
   * Same reasoning as the inspection reads and the staging board's LATERAL join:
   * the N+1 shows up on the busiest day.
   */
  private async readDiagnoses(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; diagnosisId?: string },
  ): Promise<Diagnosis[]> {
    const headers = await client.query(
      `SELECT d.id, d.job_card_id, j.job_number, v.registration_number,
              d.attempt_no, d.status, d.summary,
              d.started_at, d.submitted_at, d.reviewed_at, d.review_note,
              d.submitted_by,
              sb.display_name AS started_by_name,
              su.display_name AS submitted_by_name,
              rv.display_name AS reviewed_by_name
         FROM repair.diagnoses d
         JOIN repair.job_cards j
           ON j.id = d.job_card_id AND j.tenant_id = d.tenant_id
         JOIN core.vehicles v
           ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         -- ⚠️ NO core.customers JOIN HERE, DELIBERATELY. Slice 3a shipped one that
         -- was never referenced in the WHERE clause: harmless in effect, but it
         -- read as though an OWNERSHIP predicate applied when none did, which is
         -- the most dangerous kind of dead code in an authorization path — the next
         -- person adding an owner-scoped role would assume the narrowing was done.
         --
         -- There is no customer scope to apply, because the customer role is absent from
         -- CAN_READ_DIAGNOSIS: 2.txt S557 gives the vehicle owner a prepared
         -- report, not the technician's working notes. If a role that must be
         -- owner-scoped is ever added to that set, the predicate goes HERE,
         -- consciously, and the join comes back with it.
         --
         -- (No backticks in this comment: it lives inside a template literal, and a
         -- stray one ends the SQL string. Cost one failed transform in slice 3a.)
         --
         -- LEFT: a user record can be withdrawn while the diagnosis they recorded
         -- remains the record. An inner join would delete the diagnosis from view
         -- along with the leaver.
         LEFT JOIN identity.users sb ON sb.id = d.started_by
         LEFT JOIN identity.users su ON su.id = d.submitted_by
         LEFT JOIN identity.users rv ON rv.id = d.reviewed_by
        WHERE d.tenant_id = $1
          AND d.organization_id = $2
          AND ($3::uuid IS NULL OR d.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR d.id = $4::uuid)
          -- THE SAME NARROWING THE JOB CARD ITSELF CARRIES. Without it a diagnosis
          -- id would read out a card a technician is not assigned to — the card
          -- would be unreachable and its diagnosis would not.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY d.attempt_no DESC`,
      [
        ctx.tenantId,
        ctx.organizationId,
        filter.jobCardId ?? null,
        filter.diagnosisId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const findings = await client.query(
      `SELECT f.id, f.diagnosis_id, f.position, f.fault_code, f.fault_description,
              f.affected_system, f.observed_symptom, f.test_performed,
              f.expected_result, f.actual_result, f.interpretation,
              f.finding_status, f.source, f.confirmed_at,
              f.additional_inspection_required, f.recorded_at,
              cb.display_name AS confirmed_by_name,
              rb.display_name AS recorded_by_name
         FROM repair.diagnostic_findings f
         LEFT JOIN identity.users cb ON cb.id = f.confirmed_by
         LEFT JOIN identity.users rb ON rb.id = f.recorded_by
        WHERE f.diagnosis_id = ANY($1::uuid[]) AND f.tenant_id = $2
        ORDER BY f.position`,
      [rows.map((r) => r.id), ctx.tenantId],
    );

    const byDiagnosis = new Map<string, DiagnosticFinding[]>();
    for (const raw of findings.rows as FindingRow[]) {
      const list = byDiagnosis.get(raw.diagnosis_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        faultCode: raw.fault_code,
        faultDescription: raw.fault_description,
        affectedSystem: raw.affected_system,
        affectedSystemLabel: affectedSystemLabel(raw.affected_system),
        observedSymptom: raw.observed_symptom,
        testPerformed: raw.test_performed,
        expectedResult: raw.expected_result,
        actualResult: raw.actual_result,
        interpretation: raw.interpretation,
        findingStatus: raw.finding_status,
        source: raw.source,
        confirmedByName: raw.confirmed_by_name,
        confirmedAt: raw.confirmed_at ? raw.confirmed_at.toISOString() : null,
        additionalInspectionRequired: raw.additional_inspection_required,
        recordedByName: raw.recorded_by_name,
        recordedAt: raw.recorded_at.toISOString(),
      });
      byDiagnosis.set(raw.diagnosis_id, list);
    }

    return rows.map((row) => {
      const list = byDiagnosis.get(row.id) ?? [];
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        attemptNo: row.attempt_no,
        status: row.status,
        summary: row.summary,
        startedByName: row.started_by_name,
        startedAt: row.started_at.toISOString(),
        submittedByName: row.submitted_by_name,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        reviewedByName: row.reviewed_by_name,
        reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
        reviewNote: row.review_note,
        findings: list,
        confirmedCount: list.filter((f) => f.findingStatus === 'confirmed').length,
        suspectedCount: list.filter((f) => f.findingStatus === 'suspected').length,
        excludedCount: list.filter((f) => f.findingStatus === 'excluded').length,
        additionalInspectionCount: list.filter((f) => f.additionalInspectionRequired).length,
        editable: row.status === 'in_progress' && CAN_RECORD_DIAGNOSIS.has(ctx.activeRole),
        // Mirrors the write path's BOTH conditions — role AND not the submitter.
        // A `reviewable: true` that the API then refuses is worse than no button.
        reviewable:
          row.status === 'submitted' &&
          CAN_REVIEW_DIAGNOSIS.has(ctx.activeRole) &&
          row.submitted_by !== ctx.userId,
      };
    });
  }

  /**
   * The job card, scoped exactly as `JobCardService` scopes it.
   *
   * ⚠️ 404, NOT 403 — a technician probing a card they are not assigned to gets
   * what they would get for an id that does not exist.
   */
  private async assertCardVisible(
    client: Client,
    ctx: TenantContext,
    cardId: string,
    opts: { lock?: boolean } = {},
  ): Promise<CardRow> {
    const found = await client.query(
      `SELECT j.id, j.job_number, j.stage
         FROM repair.job_cards j
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
      [
        cardId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  /**
   * The diagnosis exists, this viewer may reach it, and it is still open.
   *
   * A submitted or reviewed diagnosis is a 409 rather than a 403: the caller holds
   * the right to record diagnoses, and what refuses them is the state of this one.
   * "Forbidden" would send them looking for a permission problem that does not
   * exist. The message NAMES the way forward, and slice 3b's queue screen offers
   * that way — a refusal whose named alternative is unreachable is a wall.
   */
  private async assertWritable(
    client: Client,
    ctx: TenantContext,
    diagnosisId: string,
  ): Promise<{ job_number: string; attempt_no: number }> {
    const found = await client.query(
      `SELECT d.id, d.status, d.attempt_no, j.job_number
         FROM repair.diagnoses d
         JOIN repair.job_cards j
           ON j.id = d.job_card_id AND j.tenant_id = d.tenant_id
        WHERE d.id = $1 AND d.tenant_id = $2 AND d.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
        -- The row lock serialises two technicians recording against the same
        -- diagnosis, so the second reads the status the first committed.
        FOR UPDATE OF d`,
      [
        diagnosisId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );
    const row = found.rows[0] as
      | { id: string; status: DiagnosisStatus; attempt_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('diagnosis not found');
    if (row.status !== 'in_progress') {
      throw new ConflictException(
        `this diagnosis is ${row.status} and cannot be changed; ` +
          'start a new diagnosis to record a further opinion',
      );
    }
    return { job_number: row.job_number, attempt_no: row.attempt_no };
  }

  /**
   * The §3028-§3046 optional fields, validated together.
   *
   * Shared by `addFinding` and `updateFinding` so the two cannot disagree about
   * the length limit on `interpretation` — two copies of a bound is two places for
   * them to drift.
   */
  private validateOptionalFields(input: FindingInput) {
    return {
      faultCode: optionalText(input.faultCode, 'faultCode', 64),
      observedSymptom: optionalText(input.observedSymptom, 'observedSymptom', 2000),
      testPerformed: optionalText(input.testPerformed, 'testPerformed', 2000),
      expectedResult: optionalText(input.expectedResult, 'expectedResult', 2000),
      actualResult: optionalText(input.actualResult, 'actualResult', 2000),
      interpretation: optionalText(input.interpretation, 'interpretation', 8000),
      additionalInspectionRequired: input.additionalInspectionRequired === true,
    };
  }

  /**
   * The one diagnosis a read was for.
   *
   * `readDiagnoses` returns an array because it serves the list too. A shared
   * helper rather than a non-null assertion at six call sites: after `start` the
   * row certainly exists, but "certainly" is what an assertion asserts and a 404 is
   * what the caller should see if a scoping predicate ever makes it disappear.
   */
  private static one(rows: Diagnosis[]): Diagnosis {
    const first = rows[0];
    if (!first) throw new NotFoundException('diagnosis not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_DIAGNOSIS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read diagnoses`);
    }
  }

  private assertMayRecord(ctx: TenantContext): void {
    if (!CAN_RECORD_DIAGNOSIS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not record a diagnosis`);
    }
  }

  private assertMayReview(ctx: TenantContext): void {
    if (!CAN_REVIEW_DIAGNOSIS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not review a diagnosis`);
    }
  }
}

/**
 * The narrow slice of `pg`'s client this service uses, inside `withTenant`.
 *
 * `rowCount` is `number | null` because that is what `pg` declares — narrowing it
 * to `number` here would make a real `PoolClient` fail to satisfy this interface,
 * and the fix would be a cast that hides the difference rather than respects it.
 */
interface Client {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface CardRow {
  id: string;
  job_number: string;
  stage: string;
}

interface ReviewRow {
  id: string;
  status: DiagnosisStatus;
  attempt_no: number;
  submitted_by: string | null;
  job_number: string;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  registration_number: string;
  attempt_no: number;
  status: DiagnosisStatus;
  summary: string | null;
  started_at: Date;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  review_note: string | null;
  submitted_by: string | null;
  started_by_name: string | null;
  submitted_by_name: string | null;
  reviewed_by_name: string | null;
}

interface FindingRow {
  id: string;
  diagnosis_id: string;
  position: number;
  fault_code: string | null;
  fault_description: string;
  affected_system: string;
  observed_symptom: string | null;
  test_performed: string | null;
  expected_result: string | null;
  actual_result: string | null;
  interpretation: string | null;
  finding_status: FindingStatus;
  source: FindingSource;
  confirmed_at: Date | null;
  confirmed_by_name: string | null;
  additional_inspection_required: boolean;
  recorded_at: Date;
  recorded_by_name: string | null;
}
