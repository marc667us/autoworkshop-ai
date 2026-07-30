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
import {
  optionalText,
  optionalUuid,
  requireOneOf,
  requireText,
  requireUuid,
} from '../core/validate';
import {
  CAN_PLAN_REPAIR,
  CAN_READ_REPAIR_PLAN,
  CAN_REVIEW_REPAIR_PLAN,
  MATERIAL_KINDS,
  PLAN_REVIEW_DECISIONS,
  REPAIR_PLAN_START_STAGE,
  REQUIRED_DIAGNOSIS_STATUS,
  RESOURCE_KINDS,
  resourceKindLabel,
  type PlanReviewDecision,
  type RepairPlanStatus,
  type ResourceKind,
} from './repair-plan-rules';

/** One §27 repair task, in its §28 sequence position. */
export interface RepairPlanTask {
  id: string;
  position: number;
  /** §25's confirmed fault this task addresses, or null — see `finding_id` in 014. */
  findingId: string | null;
  /** Resolved for display, so a plan reads as prose rather than as ids. */
  findingDescription: string | null;
  title: string;
  description: string | null;
  requiredSkill: string | null;
  serviceBay: string | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  /** §29.8 — null until estimated; required before the plan may be submitted. */
  estimatedLabourHours: number | null;
  recordedByName: string | null;
  recordedAt: string;
  updatedAt: string;
}

/** One §29 part, consumable, tool or piece of equipment. */
export interface RepairPlanResource {
  id: string;
  position: number;
  /** null when the resource is for the plan as a whole rather than one task. */
  taskId: string | null;
  resourceKind: ResourceKind | string;
  /** Resolved from the stored value, so a retired kind still renders. */
  resourceKindLabel: string;
  name: string;
  reference: string | null;
  quantity: number;
  unit: string | null;
  note: string | null;
  recordedByName: string | null;
  recordedAt: string;
}

/**
 * A confirmed fault from the source diagnosis — §25's "the application loads
 * confirmed faults".
 *
 * Carried on the plan rather than fetched separately by the screen: the screen must
 * offer these as the things a task can address, and the SAME list is what decides
 * whether a fault has been left unaddressed. Two fetches would be two answers.
 */
export interface ConfirmedFault {
  id: string;
  position: number;
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: string;
  /** How many tasks on this plan address it. Zero is the number that matters. */
  taskCount: number;
}

export interface RepairPlan {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  /** The diagnosis this plan was built from — §22-§25. */
  diagnosisId: string;
  diagnosisAttemptNo: number;
  attemptNo: number;
  status: RepairPlanStatus;
  repairProcedure: string | null;
  safetyPrecautions: string | null;
  postRepairTests: string | null;
  notes: string | null;
  startedByName: string | null;
  startedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  tasks: RepairPlanTask[];
  resources: RepairPlanResource[];
  confirmedFaults: ConfirmedFault[];
  /**
   * Derived, never stored. A stored total is a second statement of the same fact,
   * free to drift the moment a task's estimate changes — and this one is what a
   * quotation multiplies by a labour rate.
   */
  totalEstimatedLabourHours: number;
  /** Tasks still carrying no estimate. Submission is refused while this is > 0. */
  unestimatedTaskCount: number;
  /**
   * Confirmed faults no task addresses.
   *
   * ⚠️ REPORTED, NOT REFUSED — see `submit`. Surfaced here because the whole point
   * of the finding link is that this question has an answer.
   */
  unaddressedFaultCount: number;
  partCount: number;
  equipmentCount: number;
  /**
   * Whether THIS viewer may still write to THIS plan.
   *
   * ⚠️ A UI CONVENIENCE, NEVER A CONTROL. Every write re-derives the whole judgement
   * server-side; a disabled button is a suggestion and anyone can call the API
   * directly (CLAUDE.md §8 — hidden is not secure).
   */
  editable: boolean;
  /**
   * Whether THIS viewer may review it. Same caveat — the service re-checks the role
   * AND that the reviewer is not the submitter on the write path.
   */
  reviewable: boolean;
}

/** What `addTask`/`updateTask` accept. Every field is §27-§29. */
interface TaskInput {
  findingId?: string | null;
  title?: string;
  description?: string | null;
  requiredSkill?: string | null;
  serviceBay?: string | null;
  assignedTechnicianId?: string | null;
  estimatedLabourHours?: number | null;
}

/** What `addResource`/`updateResource` accept. §29's parts, consumables, equipment. */
interface ResourceInput {
  taskId?: string | null;
  resourceKind?: string;
  name?: string;
  reference?: string | null;
  quantity?: number;
  unit?: string | null;
  note?: string | null;
}

/** The plan-level fields — §26, §29's safety, §29.9's post-repair tests. */
interface PlanDetailsInput {
  repairProcedure?: string | null;
  safetyPrecautions?: string | null;
  postRepairTests?: string | null;
  notes?: string | null;
}

/**
 * The repair plan for a job card — `1.txt` §378-§384, `07.txt` §22-§31.
 *
 * ── HOW THIS DIFFERS FROM THE DIAGNOSIS, AND WHY ───────────────────────────
 *
 * A diagnosis starts EMPTY and discovers its content. A plan starts from something
 * already established — the confirmed faults of an approved diagnosis (§25) — and
 * its job is to say what will be done about them. That one difference drives three
 * rules the diagnosis does not have:
 *
 *   · `start` refuses unless an APPROVED diagnosis exists with at least one
 *     confirmed fault. Planning against a suspected fault is a customer charged for
 *     a guess; planning against nothing is a quotation with no basis.
 *   · A task may name the finding it addresses, and 014's trigger refuses any
 *     finding that is not a CONFIRMED one of this plan's own diagnosis. That link
 *     is what lets slice 9's quality control ask whether the confirmed fault was
 *     actually repaired.
 *   · `submit` refuses a plan with no tasks AND a plan with an unestimated task —
 *     §29.8's labour estimate is what slice 5 prices from, so a missing one is a
 *     hole in the quotation rather than a cosmetic omission.
 *
 * Everything else is slice 3b's shape unchanged: header plus child rows, attempts
 * rather than edits, immutable on submission in the service AND by trigger, role
 * rules in their own module with a drift test against the migration, and a
 * REACHABLE alternative behind every refusal.
 */
@Injectable()
export class RepairPlanService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every plan recorded against a job card, newest attempt first.
   *
   * Reads the card through the SAME scoping predicates `JobCardService` uses, so the
   * scopes are inherited rather than restated: staff see their organisation, a
   * technician only cards assigned to them.
   */
  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairPlan[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any plan is read — otherwise
      // an empty list would mean both "none yet" and "not your card", and the
      // endpoint would confirm which cards exist.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readPlans(client, ctx, { jobCardId: cardId });
    });
  }

  /**
   * Every plan in the organisation, newest attempt first.
   *
   * Serves the planning queue and §30's internal technical review queue in one
   * request rather than one per card — the N+1 that is slowest exactly when the
   * queue is longest. Inherits the technician narrowing from `readPlans`.
   */
  async list(ctx: TenantContext): Promise<RepairPlan[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readPlans(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<RepairPlan> {
    this.assertMayRead(ctx);
    const planId = requireUuid(id, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readPlans(client, ctx, { planId });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §22-§26 — the technician completes the diagnosis and selects "Plan Repair".
   *
   * Header only. The tasks are what the planning discovers; what is NOT discovered
   * here is which faults exist, because the approved diagnosis already said.
   */
  async start(
    ctx: TenantContext,
    jobCardId: string,
    input: PlanDetailsInput = {},
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    const details = this.validateDetails(input);

    return this.db.withTenant(ctx, async (client) => {
      // FOR UPDATE on the card: two technicians pressing "Plan Repair" at the same
      // moment would otherwise both read "highest attempt = 1" and both try to write
      // attempt 2. The unique constraint would catch the second, but as a 500 about a
      // constraint name; locking the card turns it into a clean sequence.
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      // ── the card must be at the solution stage ───────────────────────────
      if (card.stage !== REPAIR_PLAN_START_STAGE) {
        throw new BadRequestException(
          `a repair plan may only be built while the job card is at ` +
            `'${REPAIR_PLAN_START_STAGE}'; this card is at '${card.stage}'. ` +
            `Move the card to '${REPAIR_PLAN_START_STAGE}' first.`,
        );
      }

      // ── ONE UNSETTLED PLAN AT A TIME ─────────────────────────────────────
      //
      // ⚠️ `submitted` BLOCKS A NEW ATTEMPT TOO, and this is slice 3b's HIGH finding
      // applied up front rather than paid for twice. Every read path here orders by
      // `attempt_no DESC` and treats the newest as "the current plan", so allowing a
      // second attempt while one is submitted would make the SUBMITTED plan stop being
      // surfaced — the awaiting-review count falls to zero while a plan is still
      // unreviewed, and §30's review is bypassed without anything being deleted. Worse
      // than a lost row, because nothing looks wrong.
      const unsettled = await client.query(
        `SELECT id, status FROM repair.repair_plans
          WHERE job_card_id = $1 AND tenant_id = $2
            AND status IN ('in_progress', 'submitted')
          ORDER BY attempt_no DESC
          LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const blocking = unsettled.rows[0] as { id: string; status: string } | undefined;
      if (blocking) {
        // Two situations, two sentences — the caller's next action is not the same.
        throw new ConflictException(
          blocking.status === 'in_progress'
            ? 'this job card already has a repair plan in progress; submit it before starting another'
            : 'the previous repair plan for this job card is awaiting supervisor review; ' +
              'a new plan can only be started once it has been approved or rejected',
        );
      }

      // ── the approved diagnosis this plan will consume (§22-§25) ──────────
      //
      // The NEWEST approved one. A card can carry several attempts, and the approved
      // one a supervisor signed most recently is the current statement of what is
      // wrong with the vehicle.
      const diagnosis = await client.query(
        `SELECT d.id, d.attempt_no,
                count(f.id) FILTER (WHERE f.finding_status = 'confirmed')::int AS confirmed
           FROM repair.diagnoses d
           LEFT JOIN repair.diagnostic_findings f
             ON f.diagnosis_id = d.id AND f.tenant_id = d.tenant_id
          WHERE d.job_card_id = $1 AND d.tenant_id = $2 AND d.organization_id = $3
            AND d.status = $4
          GROUP BY d.id, d.attempt_no
          ORDER BY d.attempt_no DESC
          LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_DIAGNOSIS_STATUS],
      );
      const source = diagnosis.rows[0] as
        | { id: string; attempt_no: number; confirmed: number }
        | undefined;

      if (!source) {
        // ⚠️ THE REFUSAL NAMES A REACHABLE ROUTE, and both halves of it are real
        // screens: the diagnosis queue is where a diagnosis is submitted, and the same
        // queue is where a supervisor answers it. Three slices running, a refusal
        // whose alternative could not be reached has been the most expensive defect
        // class in this repository.
        throw new ConflictException(
          'a repair plan is built from the confirmed faults of an APPROVED diagnosis, ' +
            'and this job card has none. Record a diagnosis and have a supervisor ' +
            'approve it on the Diagnosis screen first.',
        );
      }
      if (Number(source.confirmed) === 0) {
        // An approved diagnosis that confirmed nothing is a real and correct outcome —
        // "we found no fault". It is simply not something to plan a repair from, and
        // saying so is better than an empty planning screen the technician has to
        // interpret.
        throw new ConflictException(
          `the approved diagnosis for this job card (attempt ${source.attempt_no}) ` +
            'confirmed no faults, so there is nothing to plan a repair against. ' +
            'Record a further diagnosis if a fault is now established.',
        );
      }

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.repair_plans
          WHERE job_card_id = $1 AND tenant_id = $2`,
        [cardId, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.repair_plans
           (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no,
            repair_procedure, safety_precautions, post_repair_tests, notes,
            started_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10)
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          cardId,
          source.id,
          attemptNo,
          details.repairProcedure,
          details.safetyPrecautions,
          details.postRepairTests,
          details.notes,
          ctx.userId,
        ],
      );
      const planId = inserted.rows[0].id as string;

      await this.audit.write(client, ctx, {
        action: 'repair_plan.started',
        resourceType: 'repair_plan',
        resourceId: planId,
        // The job number, the attempt and the source diagnosis — never the notes. A
        // technician's working note can contain anything, and the audit trail is read
        // by people who need to know a plan happened (`1.txt` §1646).
        detail: {
          jobNumber: card.job_number,
          attemptNo,
          diagnosisAttemptNo: source.attempt_no,
          confirmedFaults: Number(source.confirmed),
        },
      });

      const rows = await this.readPlans(client, ctx, { planId });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §26's repair procedure, §29's safety precautions, §29.9's post-repair tests and
   * the plan's notes.
   *
   * PARTIAL, with the three meanings slice 3b settled on:
   *   · ABSENT (`undefined`)  → leave the column alone.
   *   · `null` or `''`        → CLEAR it. Every one of these columns is nullable, so
   *     refusing to empty one would be a rule the database does not have — the exact
   *     asymmetry the Supervisor caught in `recordSummary`.
   *   · a value               → set it.
   */
  async recordDetails(
    ctx: TenantContext,
    planId: string,
    input: PlanDetailsInput,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // Column names come from these literals and NEVER from the request, so nothing
    // caller-supplied reaches the SQL text — every value is a bound parameter.
    this.nullableText(set, 'repair_procedure', input.repairProcedure, 'repairProcedure', 8000);
    this.nullableText(set, 'safety_precautions', input.safetyPrecautions, 'safetyPrecautions', 8000);
    this.nullableText(set, 'post_repair_tests', input.postRepairTests, 'postRepairTests', 8000);
    this.nullableText(set, 'notes', input.notes, 'notes', 8000);

    if (sets.length === 0) {
      // A PATCH that mentions nothing is a mistake, not an instruction — the one case
      // where guessing would be wrong either way.
      throw new BadRequestException('nothing to update');
    }

    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    // ⚠️ THE STATEMENT AND ITS PARAMETERS ARE FINISHED HERE, BEFORE THE TRANSACTION.
    // Appending to `values` inside the callback would make the query depend on how
    // many times the callback runs — correct today because `withTenant` invokes it
    // once, and silently wrong the day it retries.
    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_plans
            SET ${sets.join(', ')}
          WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);
      await client.query(sql, values);

      await this.audit.write(client, ctx, {
        action: 'repair_plan.details_recorded',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: { jobNumber: plan.job_number },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §27 — add a repair task.
   *
   * ONE AT A TIME, like a finding and unlike the inspection's batched checklist: a
   * task carries a description, a skill, a bay and an estimate, and batching would
   * mean holding several half-written tasks in the browser and losing them together.
   */
  async addTask(ctx: TenantContext, planId: string, input: TaskInput): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');

    const title = requireText(input.title, 'title', 500);
    const findingId = optionalUuid(input.findingId, 'findingId');
    const description = optionalText(input.description, 'description', 8000);
    const requiredSkill = optionalText(input.requiredSkill, 'requiredSkill', 200);
    const serviceBay = optionalText(input.serviceBay, 'serviceBay', 200);
    const assignedTechnicianId = optionalUuid(input.assignedTechnicianId, 'assignedTechnicianId');
    const hours = this.optionalHours(input.estimatedLabourHours);

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      // ── the finding must be a CONFIRMED one of THIS plan's diagnosis ─────
      //
      // 014's trigger enforces this too, and deliberately so — that layer holds for
      // any future caller. This check exists so the technician gets a SENTENCE rather
      // than a constraint violation surfacing as a 500, and so the two failures are
      // told apart: a fault from another record and a fault that is merely suspected
      // are different mistakes with different fixes.
      if (findingId !== null) {
        await this.assertFindingIsPlannable(client, ctx, id, findingId);
      }

      // `position` is assigned server-side from what is already there rather than
      // taken from the caller: two tasks claiming position 2 have no defined order,
      // and §28's SEQUENCE is the plan's content, not a display preference.
      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.repair_plan_tasks
          WHERE plan_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      await client.query(
        `INSERT INTO repair.repair_plan_tasks
           (tenant_id, organization_id, plan_id, position, finding_id, title, description,
            required_skill, service_bay, assigned_technician_id, estimated_labour_hours,
            recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          id,
          Number(next.rows[0].n),
          findingId,
          title,
          description,
          requiredSkill,
          serviceBay,
          assignedTechnicianId,
          hours,
          ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_plan.task_added',
        resourceType: 'repair_plan',
        resourceId: id,
        // Whether it addresses a fault and what it costs — never the free-text title.
        detail: {
          jobNumber: plan.job_number,
          addressesFinding: findingId !== null,
          estimatedLabourHours: hours,
        },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * Correct a task while the plan is still open.
   *
   * PARTIAL, with the same three meanings as every other update here. `title` is NOT
   * clearable — 014 declares it NOT NULL and CHECKs it non-blank — and sending `null`
   * for it is a 400 naming the field rather than a 23502 from Postgres.
   *
   * ⚠️ `findingId: null` DETACHES the task from its fault, and that has to be
   * possible: a technician who attaches a task to the wrong finding must be able to
   * correct it without deleting the task and retyping the description. The
   * unreachable-alternative trap, avoided in the one field most likely to be
   * mis-selected.
   */
  async updateTask(
    ctx: TenantContext,
    planId: string,
    taskId: string,
    input: TaskInput,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');
    const targetId = requireUuid(taskId, 'taskId');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.title !== undefined) {
      set('title', requireText(input.title, 'title', 500));
    }
    this.nullableText(set, 'description', input.description, 'description', 8000);
    this.nullableText(set, 'required_skill', input.requiredSkill, 'requiredSkill', 200);
    this.nullableText(set, 'service_bay', input.serviceBay, 'serviceBay', 200);

    // A UUID column with the same clear-semantics: absent leaves it, null detaches it.
    let findingId: string | null | undefined;
    if (input.findingId !== undefined) {
      findingId = input.findingId === null || input.findingId === '' ? null : requireUuid(input.findingId, 'findingId');
      set('finding_id', findingId);
    }
    if (input.assignedTechnicianId !== undefined) {
      const tech =
        input.assignedTechnicianId === null || input.assignedTechnicianId === ''
          ? null
          : requireUuid(input.assignedTechnicianId, 'assignedTechnicianId');
      set('assigned_technician_id', tech);
    }
    if (input.estimatedLabourHours !== undefined) {
      // ⚠️ `null` CLEARS the estimate, it is not a 400. A technician who typed the
      // wrong number into a nullable column must be able to empty it — and submission
      // is what refuses an unestimated task, so clearing one is never a silent way
      // past the gate.
      set('estimated_labour_hours', this.optionalHours(input.estimatedLabourHours));
    }

    if (sets.length === 0) {
      throw new BadRequestException('nothing to update');
    }

    // Always, and after the caller's fields so it cannot be overwritten by one. TWO
    // columns, unlike 012's findings: `recorded_by` keeps the ORIGINAL hand and
    // `updated_by` records the last, so both questions have an answer on the row
    // rather than only in the audit trail.
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(targetId, id, ctx.tenantId);
    const sql = `UPDATE repair.repair_plan_tasks
            SET ${sets.join(', ')}
          WHERE id = $${values.length - 2}
            AND plan_id = $${values.length - 1}
            AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);
      if (findingId !== undefined && findingId !== null) {
        await this.assertFindingIsPlannable(client, ctx, id, findingId);
      }

      const updated = await client.query(sql, values);
      // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look
      // successful. Reported rather than silently skipped.
      if (updated.rowCount === 0) {
        throw new NotFoundException('task not found on this repair plan');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_plan.task_updated',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: { jobNumber: plan.job_number, taskId: targetId },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §28 — reorder the task sequence.
   *
   * ⚠️ THIS IS A REQUIREMENT, NOT A CONVENIENCE. §28 says "the technician defines the
   * task sequence"; bleeding the brakes before refitting the caliper is a DIFFERENT
   * PLAN from the reverse. Without a move, a technician who realises step four must
   * come first has to delete three tasks and retype them — destroying records in
   * order to reorder them, which is the unreachable-alternative trap wearing yet
   * another costume.
   *
   * A SWAP with the neighbour rather than an arbitrary target position: it needs no
   * renumbering pass, it cannot produce a gap, and it is the operation the screen
   * actually offers. The unique constraint on `(plan_id, position)` is DEFERRABLE
   * precisely so the two updates can cross inside one transaction.
   */
  async moveTask(
    ctx: TenantContext,
    planId: string,
    taskId: string,
    direction: string,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');
    const targetId = requireUuid(taskId, 'taskId');
    const dir = requireOneOf(direction, ['up', 'down'] as const, 'direction');

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      const found = await client.query(
        `SELECT id, position FROM repair.repair_plan_tasks
          WHERE id = $1 AND plan_id = $2 AND tenant_id = $3
          FOR UPDATE`,
        [targetId, id, ctx.tenantId],
      );
      const task = found.rows[0] as { id: string; position: number } | undefined;
      if (!task) throw new NotFoundException('task not found on this repair plan');

      // The adjacent task in the requested direction. `ORDER BY` + `LIMIT 1` rather
      // than `position ± 1`, because a removal leaves gaps and arithmetic on a gapped
      // sequence silently does nothing.
      const neighbour = await client.query(
        `SELECT id, position FROM repair.repair_plan_tasks
          WHERE plan_id = $1 AND tenant_id = $2
            AND position ${dir === 'up' ? '<' : '>'} $3
          ORDER BY position ${dir === 'up' ? 'DESC' : 'ASC'}
          LIMIT 1
          FOR UPDATE`,
        [id, ctx.tenantId, task.position],
      );
      const swap = neighbour.rows[0] as { id: string; position: number } | undefined;
      if (!swap) {
        // Not an error state worth a 500 or a silent success: the caller asked for
        // something that cannot happen, and saying so is what stops a screen from
        // reporting a move that never occurred.
        throw new ConflictException(
          `this task is already ${dir === 'up' ? 'first' : 'last'} in the sequence`,
        );
      }

      // Two statements, one transaction, crossing positions. Safe only because the
      // unique constraint is DEFERRABLE INITIALLY DEFERRED — with a plain unique
      // constraint the first UPDATE collides with the neighbour's existing position.
      await client.query(
        `UPDATE repair.repair_plan_tasks
            SET position = $1, updated_by = $2, updated_at = now()
          WHERE id = $3 AND tenant_id = $4`,
        [swap.position, ctx.userId, task.id, ctx.tenantId],
      );
      await client.query(
        `UPDATE repair.repair_plan_tasks
            SET position = $1, updated_by = $2, updated_at = now()
          WHERE id = $3 AND tenant_id = $4`,
        [task.position, ctx.userId, swap.id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_plan.task_moved',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: { jobNumber: plan.job_number, taskId: targetId, direction: dir },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * Remove a task entered in error, while the plan is still open.
   *
   * ⚠️ THE ESCAPE HATCH, granted by 014 up front rather than by a 015 the next day.
   * `update` can correct a task but cannot remove a duplicate, and a second attempt
   * cannot be started while this one is open — so without this a wrong task would
   * stand and be quoted for.
   *
   * Its resources go with it (014's `ON DELETE CASCADE` on `task_id`): a part
   * required by a task that no longer exists is required by nothing, and orphaning it
   * onto the plan would silently change what the row means.
   *
   * Refused once the plan is submitted, by `assertWritable` here AND by trigger.
   */
  async removeTask(ctx: TenantContext, planId: string, taskId: string): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');
    const targetId = requireUuid(taskId, 'taskId');

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      const removed = await client.query(
        `DELETE FROM repair.repair_plan_tasks
          WHERE id = $1 AND plan_id = $2 AND tenant_id = $3`,
        [targetId, id, ctx.tenantId],
      );
      if (removed.rowCount === 0) {
        throw new NotFoundException('task not found on this repair plan');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_plan.task_removed',
        resourceType: 'repair_plan',
        resourceId: id,
        // The one audit entry that must exist: a row that is gone leaves no other
        // trace, so this is the only record that it was ever there.
        detail: { jobNumber: plan.job_number, taskId: targetId },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /** §29 — add a part, consumable, tool or piece of equipment. */
  async addResource(
    ctx: TenantContext,
    planId: string,
    input: ResourceInput,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');

    const resourceKind = requireOneOf(input.resourceKind, RESOURCE_KINDS, 'resourceKind');
    const name = requireText(input.name, 'name', 500);
    const reference = optionalText(input.reference, 'reference', 200);
    const unit = optionalText(input.unit, 'unit', 50);
    const note = optionalText(input.note, 'note', 2000);
    const taskId = optionalUuid(input.taskId, 'taskId');
    const quantity = this.requireQuantity(input.quantity);

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      // A task-scoped resource must name a task ON THIS PLAN. The composite FK checks
      // the tenant and organisation; it does NOT check the plan, because a task and a
      // resource in the same organisation satisfy it while belonging to different jobs.
      if (taskId !== null) {
        const owns = await client.query(
          `SELECT 1 FROM repair.repair_plan_tasks
            WHERE id = $1 AND plan_id = $2 AND tenant_id = $3`,
          [taskId, id, ctx.tenantId],
        );
        if (owns.rows.length === 0) {
          throw new NotFoundException('task not found on this repair plan');
        }
      }

      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.repair_plan_resources
          WHERE plan_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      await client.query(
        `INSERT INTO repair.repair_plan_resources
           (tenant_id, organization_id, plan_id, task_id, position,
            resource_kind, name, reference, quantity, unit, note,
            recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          id,
          taskId,
          Number(next.rows[0].n),
          resourceKind,
          name,
          reference,
          quantity,
          unit,
          note,
          ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_plan.resource_added',
        resourceType: 'repair_plan',
        resourceId: id,
        // The KIND and the quantity, never the free-text name — the kind is a fixed
        // vocabulary from the specification, so it carries no free text into the trail.
        detail: { jobNumber: plan.job_number, resourceKind, quantity },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /** Correct a resource while the plan is still open. */
  async updateResource(
    ctx: TenantContext,
    planId: string,
    resourceId: string,
    input: ResourceInput,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');
    const targetId = requireUuid(resourceId, 'resourceId');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.resourceKind !== undefined) {
      set('resource_kind', requireOneOf(input.resourceKind, RESOURCE_KINDS, 'resourceKind'));
    }
    if (input.name !== undefined) {
      set('name', requireText(input.name, 'name', 500));
    }
    if (input.quantity !== undefined) {
      set('quantity', this.requireQuantity(input.quantity));
    }
    this.nullableText(set, 'reference', input.reference, 'reference', 200);
    this.nullableText(set, 'unit', input.unit, 'unit', 50);
    this.nullableText(set, 'note', input.note, 'note', 2000);

    // `null` detaches the resource from a task and makes it plan-wide.
    let taskId: string | null | undefined;
    if (input.taskId !== undefined) {
      taskId = input.taskId === null || input.taskId === '' ? null : requireUuid(input.taskId, 'taskId');
      set('task_id', taskId);
    }

    if (sets.length === 0) {
      throw new BadRequestException('nothing to update');
    }

    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(targetId, id, ctx.tenantId);
    const sql = `UPDATE repair.repair_plan_resources
            SET ${sets.join(', ')}
          WHERE id = $${values.length - 2}
            AND plan_id = $${values.length - 1}
            AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      if (taskId !== undefined && taskId !== null) {
        const owns = await client.query(
          `SELECT 1 FROM repair.repair_plan_tasks
            WHERE id = $1 AND plan_id = $2 AND tenant_id = $3`,
          [taskId, id, ctx.tenantId],
        );
        if (owns.rows.length === 0) {
          throw new NotFoundException('task not found on this repair plan');
        }
      }

      const updated = await client.query(sql, values);
      if (updated.rowCount === 0) {
        throw new NotFoundException('resource not found on this repair plan');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_plan.resource_updated',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: { jobNumber: plan.job_number, resourceId: targetId },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /** Remove a resource entered in error, while the plan is still open. */
  async removeResource(
    ctx: TenantContext,
    planId: string,
    resourceId: string,
  ): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');
    const targetId = requireUuid(resourceId, 'resourceId');

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      const removed = await client.query(
        `DELETE FROM repair.repair_plan_resources
          WHERE id = $1 AND plan_id = $2 AND tenant_id = $3`,
        [targetId, id, ctx.tenantId],
      );
      if (removed.rowCount === 0) {
        throw new NotFoundException('resource not found on this repair plan');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_plan.resource_removed',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: { jobNumber: plan.job_number, resourceId: targetId },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §29.10 — submit the plan for supervisor review.
   *
   * It stops being writable and becomes the proposal the reviewer answers.
   *
   * ── TWO GATES, AND WHY THE THIRD ONE IS DELIBERATELY ABSENT ────────────────
   *
   * 1. AT LEAST ONE TASK. Slice 3a shipped the mirror image of this and the
   *    Supervisor caught it: "is any checkpoint unanswered" is FALSE for a sheet with
   *    no checkpoints, so an empty inspection submitted cleanly. Here an empty plan
   *    submitted cleanly would be a supervisor asked to approve silence, and
   *    downstream a quotation priced from nothing. Guarded UP FRONT — third slice
   *    running where this hole existed.
   *
   * 2. EVERY TASK ESTIMATED. §29.8's labour estimate is what slice 5 multiplies by a
   *    labour rate. A submitted plan carrying an unestimated task is a quotation with
   *    a hole in it, and the hole is discovered by the person pricing it rather than
   *    by the person who could fix it. The refusal NAMES the tasks.
   *
   * 3. NOT "every confirmed fault addressed". A plan legitimately covers a SUBSET —
   *    a staged repair, a fault the customer will take elsewhere, a fault whose part
   *    is unobtainable. Refusing submission would push a technician into writing a
   *    fake task to get past the gate, which is the same failure mode as demanding a
   *    finding for an inspection that found nothing: it manufactures record entries
   *    to satisfy a rule. So it is REPORTED — `unaddressedFaultCount` on the record
   *    and named on the screen and in this audit entry — and the supervisor reviewing
   *    it decides. A number a reviewer must look at is worth more than a wall a
   *    technician learns to climb.
   */
  async submit(ctx: TenantContext, planId: string): Promise<RepairPlan> {
    this.assertMayPlan(ctx);
    const id = requireUuid(planId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const plan = await this.assertWritable(client, ctx, id);

      const tally = await client.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE estimated_labour_hours IS NULL)::int AS unestimated,
                COALESCE(sum(estimated_labour_hours), 0)::float8 AS hours
           FROM repair.repair_plan_tasks
          WHERE plan_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const counts = tally.rows[0] as { total: number; unestimated: number; hours: number };

      if (Number(counts.total) === 0) {
        throw new BadRequestException(
          'a repair plan cannot be submitted with no tasks; add at least one repair task ' +
            'describing the work to be done',
        );
      }
      if (Number(counts.unestimated) > 0) {
        // The refusal names the count AND what to do, because "some tasks are
        // unestimated" on a plan of fifteen is a sentence the technician cannot act on.
        const unnamed = await client.query(
          `SELECT position, title FROM repair.repair_plan_tasks
            WHERE plan_id = $1 AND tenant_id = $2 AND estimated_labour_hours IS NULL
            ORDER BY position
            LIMIT 5`,
          [id, ctx.tenantId],
        );
        const names = (unnamed.rows as Array<{ position: number; title: string }>)
          .map((r) => `${r.position}. ${r.title}`)
          .join('; ');
        throw new BadRequestException(
          `every task needs an estimated labour time before the plan can be submitted — ` +
            `the quotation is priced from them. ${counts.unestimated} still unestimated: ${names}`,
        );
      }

      await client.query(
        `UPDATE repair.repair_plans
            SET status = 'submitted', submitted_by = $1, submitted_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      // The unaddressed count is computed for the audit entry as well as the screen:
      // it is the one number a reviewer should have seen, so the record shows what it
      // was at the moment of submission rather than only what it is now.
      const gap = await client.query(
        `SELECT count(*)::int AS n
           FROM repair.diagnostic_findings f
           JOIN repair.repair_plans p
             ON p.diagnosis_id = f.diagnosis_id AND p.tenant_id = f.tenant_id
          WHERE p.id = $1 AND f.tenant_id = $2
            AND f.finding_status = 'confirmed'
            AND NOT EXISTS (
                  SELECT 1 FROM repair.repair_plan_tasks t
                   WHERE t.plan_id = p.id AND t.finding_id = f.id AND t.tenant_id = f.tenant_id
                )`,
        [id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_plan.submitted',
        resourceType: 'repair_plan',
        resourceId: id,
        detail: {
          jobNumber: plan.job_number,
          attemptNo: plan.attempt_no,
          tasks: Number(counts.total),
          estimatedLabourHours: Number(counts.hours),
          unaddressedConfirmedFaults: Number(gap.rows[0].n),
        },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  /**
   * §30-§31's internal technical review — approve, or reject with a reason.
   *
   * ── THE INDEPENDENCE RULE (`2.txt` §563), IN TWO PARTS ─────────────────────
   *
   * Both are needed and neither is sufficient:
   *   · ROLE — `CAN_REVIEW_REPAIR_PLAN` excludes `technician`, so two technicians
   *     cannot sign each other's work.
   *   · IDENTITY — the reviewer may not be the submitter, so a supervisor who built
   *     the plan themselves cannot also approve it.
   *
   * The row keeps both names, so the claim is auditable rather than assumed.
   */
  async review(
    ctx: TenantContext,
    planId: string,
    input: { decision?: string; note?: string },
  ): Promise<RepairPlan> {
    this.assertMayReview(ctx);
    const id = requireUuid(planId, 'id');
    const decision: PlanReviewDecision = requireOneOf(
      input.decision,
      PLAN_REVIEW_DECISIONS,
      'decision',
    );
    const note = optionalText(input.note, 'note', 8000);

    // A rejection must say why — the migration's CHECK agrees, and this is the clear
    // 400 rather than a constraint violation surfacing as a 500. §31's other verbs
    // ("request additional test", "return to technician") ARE this sentence, so a
    // rejection without one loses the whole instruction.
    if (decision === 'rejected' && note === null) {
      throw new BadRequestException('a rejection must give a reason; note is required');
    }

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT p.id, p.status, p.attempt_no, p.submitted_by, j.job_number
           FROM repair.repair_plans p
           JOIN repair.job_cards j
             ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
          -- Serialises two supervisors answering the same plan, so the second reads
          -- the status the first committed. Without it both could pass the status
          -- check and one write would land on a reviewed row — refused by the
          -- trigger, but as a 500.
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as ReviewRow | undefined;
      // 404, not 403 — the same non-oracle rule as every other read here.
      if (!row) throw new NotFoundException('repair plan not found');

      if (row.status === 'in_progress') {
        throw new ConflictException(
          'this repair plan has not been submitted yet and cannot be reviewed',
        );
      }
      if (row.status !== 'submitted') {
        throw new ConflictException(
          `this repair plan was already ${row.status} and cannot be reviewed again; ` +
            'a revised plan is recorded as a new attempt',
        );
      }
      // ⚠️ THE INDEPENDENCE CHECK. A 403 rather than a 409: what refuses the caller
      // here IS their standing on this particular record, unlike the status cases
      // above where the record's state is what refuses them.
      if (row.submitted_by !== null && row.submitted_by === ctx.userId) {
        throw new ForbiddenException(
          'you submitted this repair plan and cannot also review it; ' +
            'another supervisor must review it',
        );
      }

      await client.query(
        `UPDATE repair.repair_plans
            SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3,
                updated_at = now(), updated_by = $2
          WHERE id = $4 AND tenant_id = $5`,
        [decision, ctx.userId, note, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: decision === 'approved' ? 'repair_plan.approved' : 'repair_plan.rejected',
        resourceType: 'repair_plan',
        resourceId: id,
        // The DECISION and the job, never the reviewer's free-text reason — the audit
        // trail records that a review happened, and the reason lives on the record
        // itself where the technician reads it.
        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
      });

      const rows = await this.readPlans(client, ctx, { planId: id });
      return RepairPlanService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /**
   * Four queries for any number of plans — headers, tasks, resources, and the
   * confirmed faults of the diagnoses behind them. Never one per plan.
   *
   * Same reasoning as the diagnosis reads and the staging board's LATERAL join: the
   * N+1 shows up on the busiest day.
   */
  private async readPlans(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; planId?: string },
  ): Promise<RepairPlan[]> {
    const headers = await client.query(
      `SELECT p.id, p.job_card_id, j.job_number, v.registration_number,
              p.diagnosis_id, d.attempt_no AS diagnosis_attempt_no,
              p.attempt_no, p.status,
              p.repair_procedure, p.safety_precautions, p.post_repair_tests, p.notes,
              p.started_at, p.submitted_at, p.reviewed_at, p.review_note,
              p.submitted_by,
              sb.display_name AS started_by_name,
              su.display_name AS submitted_by_name,
              rv.display_name AS reviewed_by_name
         FROM repair.repair_plans p
         JOIN repair.job_cards j
           ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
         JOIN core.vehicles v
           ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         JOIN repair.diagnoses d
           ON d.id = p.diagnosis_id AND d.tenant_id = p.tenant_id
         -- NO core.customers JOIN, DELIBERATELY, and for the reason slice 3b spelled
         -- out: a join never referenced in the WHERE clause reads as though an
         -- OWNERSHIP predicate applied when none does, which is the most dangerous
         -- kind of dead code in an authorization path. There is no customer scope to
         -- apply, because the customer role is absent from CAN_READ_REPAIR_PLAN
         -- (2.txt S557 gives the vehicle owner a prepared quotation, not the
         -- workshop's task list and labour rates). If a role that must be
         -- owner-scoped is ever added to that set, the predicate goes HERE.
         --
         -- (No backticks in this comment: it lives inside a template literal, and a
         -- stray one ends the SQL string. Cost one failed transform in slice 3a and
         -- landed again in slice 3b, inside the comment warning about it.)
         --
         -- LEFT: a user record can be withdrawn while the plan they wrote remains the
         -- record. An inner join would delete the plan from view along with the leaver.
         LEFT JOIN identity.users sb ON sb.id = p.started_by
         LEFT JOIN identity.users su ON su.id = p.submitted_by
         LEFT JOIN identity.users rv ON rv.id = p.reviewed_by
        WHERE p.tenant_id = $1
          AND p.organization_id = $2
          AND ($3::uuid IS NULL OR p.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR p.id = $4::uuid)
          -- THE SAME NARROWING THE JOB CARD ITSELF CARRIES. Without it a plan id would
          -- read out a card a technician is not assigned to — the card would be
          -- unreachable and its plan would not.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY p.attempt_no DESC`,
      [
        ctx.tenantId,
        ctx.organizationId,
        filter.jobCardId ?? null,
        filter.planId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const planIds = rows.map((r) => r.id);

    const [tasks, resources, faults] = await Promise.all([
      client.query(
        `SELECT t.id, t.plan_id, t.position, t.finding_id, t.title, t.description,
                t.required_skill, t.service_bay, t.assigned_technician_id,
                t.estimated_labour_hours, t.recorded_at, t.updated_at,
                f.fault_description AS finding_description,
                rb.display_name AS recorded_by_name,
                at.display_name AS assigned_technician_name
           FROM repair.repair_plan_tasks t
           LEFT JOIN repair.diagnostic_findings f
             ON f.id = t.finding_id AND f.tenant_id = t.tenant_id
           LEFT JOIN identity.users rb ON rb.id = t.recorded_by
           LEFT JOIN identity.users at ON at.id = t.assigned_technician_id
          WHERE t.plan_id = ANY($1::uuid[]) AND t.tenant_id = $2
          ORDER BY t.position`,
        [planIds, ctx.tenantId],
      ),
      client.query(
        `SELECT r.id, r.plan_id, r.task_id, r.position, r.resource_kind, r.name,
                r.reference, r.quantity, r.unit, r.note, r.recorded_at,
                rb.display_name AS recorded_by_name
           FROM repair.repair_plan_resources r
           LEFT JOIN identity.users rb ON rb.id = r.recorded_by
          WHERE r.plan_id = ANY($1::uuid[]) AND r.tenant_id = $2
          ORDER BY r.position`,
        [planIds, ctx.tenantId],
      ),
      // §25's "the application loads confirmed faults", plus how many tasks address
      // each. One query rather than a per-plan lookup, and the count is computed in
      // SQL rather than by scanning the task list in JS — a task whose finding was
      // detached is then correctly not counted, without the two views disagreeing.
      client.query(
        `SELECT p.id AS plan_id, f.id, f.position, f.fault_code, f.fault_description,
                f.affected_system,
                (SELECT count(*)::int FROM repair.repair_plan_tasks t
                  WHERE t.plan_id = p.id AND t.finding_id = f.id
                    AND t.tenant_id = f.tenant_id) AS task_count
           FROM repair.repair_plans p
           JOIN repair.diagnostic_findings f
             ON f.diagnosis_id = p.diagnosis_id AND f.tenant_id = p.tenant_id
          WHERE p.id = ANY($1::uuid[]) AND p.tenant_id = $2
            AND f.finding_status = 'confirmed'
          ORDER BY f.position`,
        [planIds, ctx.tenantId],
      ),
    ]);

    const tasksByPlan = new Map<string, RepairPlanTask[]>();
    for (const raw of tasks.rows as TaskRow[]) {
      const list = tasksByPlan.get(raw.plan_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        findingId: raw.finding_id,
        findingDescription: raw.finding_description,
        title: raw.title,
        description: raw.description,
        requiredSkill: raw.required_skill,
        serviceBay: raw.service_bay,
        assignedTechnicianId: raw.assigned_technician_id,
        assignedTechnicianName: raw.assigned_technician_name,
        // ⚠️ `numeric` ARRIVES FROM `pg` AS A STRING, not a number — the driver does
        // that on purpose, because a JS number cannot hold every numeric value. Left
        // as-is it would serialise as "1.50" and any arithmetic in a screen would be
        // string concatenation. Converted once, here, at the boundary.
        estimatedLabourHours:
          raw.estimated_labour_hours === null ? null : Number(raw.estimated_labour_hours),
        recordedByName: raw.recorded_by_name,
        recordedAt: raw.recorded_at.toISOString(),
        updatedAt: raw.updated_at.toISOString(),
      });
      tasksByPlan.set(raw.plan_id, list);
    }

    const resourcesByPlan = new Map<string, RepairPlanResource[]>();
    for (const raw of resources.rows as ResourceRow[]) {
      const list = resourcesByPlan.get(raw.plan_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        taskId: raw.task_id,
        resourceKind: raw.resource_kind,
        resourceKindLabel: resourceKindLabel(raw.resource_kind),
        name: raw.name,
        reference: raw.reference,
        quantity: Number(raw.quantity),
        unit: raw.unit,
        note: raw.note,
        recordedByName: raw.recorded_by_name,
        recordedAt: raw.recorded_at.toISOString(),
      });
      resourcesByPlan.set(raw.plan_id, list);
    }

    const faultsByPlan = new Map<string, ConfirmedFault[]>();
    for (const raw of faults.rows as FaultRow[]) {
      const list = faultsByPlan.get(raw.plan_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        faultCode: raw.fault_code,
        faultDescription: raw.fault_description,
        affectedSystem: raw.affected_system,
        taskCount: Number(raw.task_count),
      });
      faultsByPlan.set(raw.plan_id, list);
    }

    return rows.map((row) => {
      const taskList = tasksByPlan.get(row.id) ?? [];
      const resourceList = resourcesByPlan.get(row.id) ?? [];
      const faultList = faultsByPlan.get(row.id) ?? [];
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        diagnosisId: row.diagnosis_id,
        diagnosisAttemptNo: row.diagnosis_attempt_no,
        attemptNo: row.attempt_no,
        status: row.status,
        repairProcedure: row.repair_procedure,
        safetyPrecautions: row.safety_precautions,
        postRepairTests: row.post_repair_tests,
        notes: row.notes,
        startedByName: row.started_by_name,
        startedAt: row.started_at.toISOString(),
        submittedByName: row.submitted_by_name,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        reviewedByName: row.reviewed_by_name,
        reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
        reviewNote: row.review_note,
        tasks: taskList,
        resources: resourceList,
        confirmedFaults: faultList,
        // ⚠️ ROUNDED TO TWO PLACES. The column is numeric(6,2), so every value is
        // exact in the database — but summing them as JS floats reintroduces
        // 0.1 + 0.2 = 0.30000000000000004, and this number is displayed to a
        // technician and multiplied by a labour rate in slice 5.
        totalEstimatedLabourHours:
          Math.round(
            taskList.reduce((sum, t) => sum + (t.estimatedLabourHours ?? 0), 0) * 100,
          ) / 100,
        unestimatedTaskCount: taskList.filter((t) => t.estimatedLabourHours === null).length,
        unaddressedFaultCount: faultList.filter((f) => f.taskCount === 0).length,
        partCount: resourceList.filter((r) => MATERIAL_KINDS.has(r.resourceKind)).length,
        equipmentCount: resourceList.filter((r) => !MATERIAL_KINDS.has(r.resourceKind)).length,
        editable: row.status === 'in_progress' && CAN_PLAN_REPAIR.has(ctx.activeRole),
        // Mirrors the write path's BOTH conditions — role AND not the submitter. A
        // `reviewable: true` that the API then refuses is worse than no button.
        reviewable:
          row.status === 'submitted' &&
          CAN_REVIEW_REPAIR_PLAN.has(ctx.activeRole) &&
          row.submitted_by !== ctx.userId,
      };
    });
  }

  /**
   * The job card, scoped exactly as `JobCardService` scopes it.
   *
   * ⚠️ 404, NOT 403 — a technician probing a card they are not assigned to gets what
   * they would get for an id that does not exist.
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
   * The plan exists, this viewer may reach it, and it is still open.
   *
   * A submitted or reviewed plan is a 409 rather than a 403: the caller holds the
   * right to build plans, and what refuses them is the state of this one. "Forbidden"
   * would send them looking for a permission problem that does not exist. The message
   * NAMES the way forward, and the queue screen offers that way.
   */
  private async assertWritable(
    client: Client,
    ctx: TenantContext,
    planId: string,
  ): Promise<{ job_number: string; attempt_no: number }> {
    const found = await client.query(
      `SELECT p.id, p.status, p.attempt_no, j.job_number
         FROM repair.repair_plans p
         JOIN repair.job_cards j
           ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
        -- The row lock serialises two technicians recording against the same plan, so
        -- the second reads the status the first committed.
        FOR UPDATE OF p`,
      [
        planId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );
    const row = found.rows[0] as
      | { id: string; status: RepairPlanStatus; attempt_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('repair plan not found');
    if (row.status !== 'in_progress') {
      throw new ConflictException(
        `this repair plan is ${row.status} and cannot be changed; ` +
          'start a new repair plan to record a revised proposal',
      );
    }
    return { job_number: row.job_number, attempt_no: row.attempt_no };
  }

  /**
   * The finding is a CONFIRMED one of THIS plan's own diagnosis.
   *
   * 014's trigger enforces the same rule and is the layer that holds for any future
   * caller. This exists so the technician gets a sentence naming WHICH mistake they
   * made — a fault belonging to another record and a fault that is merely suspected
   * are different problems with different fixes, and a raw
   * `integrity_constraint_violation` distinguishes neither.
   */
  private async assertFindingIsPlannable(
    client: Client,
    ctx: TenantContext,
    planId: string,
    findingId: string,
  ): Promise<void> {
    const found = await client.query(
      `SELECT f.finding_status
         FROM repair.diagnostic_findings f
         JOIN repair.repair_plans p
           ON p.diagnosis_id = f.diagnosis_id AND p.tenant_id = f.tenant_id
        WHERE f.id = $1 AND p.id = $2 AND f.tenant_id = $3`,
      [findingId, planId, ctx.tenantId],
    );
    const row = found.rows[0] as { finding_status: string } | undefined;
    if (!row) {
      // 404 rather than 400: from the caller's side the finding does not exist ON
      // THIS PLAN, and answering differently for "exists elsewhere" would make this
      // an oracle for findings on other jobs.
      throw new NotFoundException(
        "that fault is not one of this plan's diagnosis findings",
      );
    }
    if (row.finding_status !== 'confirmed') {
      throw new BadRequestException(
        `a repair task may only address a CONFIRMED fault; this one is ` +
          `'${row.finding_status}'. A plan built on a suspected fault is a customer ` +
          'charged for a guess — record a further diagnosis to confirm it first.',
      );
    }
  }

  /**
   * A nullable text column: absent leaves it, null/'' clears it, a string sets it.
   *
   * ⚠️ A NON-STRING IS A 400, NOT A SILENT CLEAR. `optionalText` returns `null` for
   * anything that is not a string, so `{"serviceBay": 12345}` would reach
   * `set(column, null)` and ERASE the stored value — the exact regression the
   * Supervisor caught on slice 3b's clear-semantics commit. Giving `null` a
   * destructive meaning turns a wrong type from "nothing happens" into "the value is
   * gone", so the type is checked HERE rather than inferred from what `optionalText`
   * happens to return.
   */
  private nullableText(
    set: (column: string, value: unknown) => void,
    column: string,
    raw: unknown,
    field: string,
    max: number,
  ): void {
    if (raw === undefined) return;
    if (raw === null || raw === '') {
      set(column, null);
      return;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field} must be a string, or null to clear it`);
    }
    // Whitespace-only still clears: selecting the contents of a box and typing a space
    // means the same thing as emptying it, and `optionalText` trims to '' anyway.
    set(column, optionalText(raw, field, max));
  }

  /**
   * §29.8's labour estimate — a positive number with at most two decimals, or null.
   *
   * ⚠️ THE PRECISION IS CHECKED HERE, not left to the column. `numeric(6,2)` ROUNDS
   * `1.005` to `1.01` silently; it does not refuse it. A technician who typed a value
   * with more precision than the schema keeps should be told, because the number they
   * see afterwards is not the number they entered — and this one is multiplied by a
   * labour rate.
   */
  private optionalHours(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(
        'estimatedLabourHours must be a number of hours, or null to clear it',
      );
    }
    if (value <= 0) {
      throw new BadRequestException('estimatedLabourHours must be greater than zero');
    }
    if (value > 9999.99) {
      throw new BadRequestException('estimatedLabourHours must be 9999.99 or fewer');
    }
    if (Math.round(value * 100) !== value * 100) {
      throw new BadRequestException(
        'estimatedLabourHours is recorded to two decimal places; round it first',
      );
    }
    return value;
  }

  /** §29's quantity — positive, at most three decimals. Same reasoning as the hours. */
  private requireQuantity(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      // Defaulting to 1 would be a guess about a number that ends up on an order.
      throw new BadRequestException('quantity is required');
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException('quantity must be a number');
    }
    if (value <= 0) {
      throw new BadRequestException('quantity must be greater than zero');
    }
    if (value > 999999999) {
      throw new BadRequestException('quantity is implausibly large');
    }
    if (Math.round(value * 1000) !== value * 1000) {
      throw new BadRequestException(
        'quantity is recorded to three decimal places; round it first',
      );
    }
    return value;
  }

  private validateDetails(input: PlanDetailsInput) {
    return {
      repairProcedure: optionalText(input.repairProcedure, 'repairProcedure', 8000),
      safetyPrecautions: optionalText(input.safetyPrecautions, 'safetyPrecautions', 8000),
      postRepairTests: optionalText(input.postRepairTests, 'postRepairTests', 8000),
      notes: optionalText(input.notes, 'notes', 8000),
    };
  }

  /**
   * The one plan a read was for.
   *
   * `readPlans` returns an array because it serves the list too. A shared helper
   * rather than a non-null assertion at a dozen call sites: after `start` the row
   * certainly exists, but "certainly" is what an assertion asserts and a 404 is what
   * the caller should see if a scoping predicate ever makes it disappear.
   */
  private static one(rows: RepairPlan[]): RepairPlan {
    const first = rows[0];
    if (!first) throw new NotFoundException('repair plan not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_REPAIR_PLAN.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read repair plans`);
    }
  }

  private assertMayPlan(ctx: TenantContext): void {
    if (!CAN_PLAN_REPAIR.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not build a repair plan`);
    }
  }

  private assertMayReview(ctx: TenantContext): void {
    if (!CAN_REVIEW_REPAIR_PLAN.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not review a repair plan`);
    }
  }
}

/**
 * The narrow slice of `pg`'s client this service uses, inside `withTenant`.
 *
 * `rowCount` is `number | null` because that is what `pg` declares — narrowing it to
 * `number` here would make a real `PoolClient` fail to satisfy this interface, and
 * the fix would be a cast that hides the difference rather than respects it.
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
  status: RepairPlanStatus;
  attempt_no: number;
  submitted_by: string | null;
  job_number: string;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  registration_number: string;
  diagnosis_id: string;
  diagnosis_attempt_no: number;
  attempt_no: number;
  status: RepairPlanStatus;
  repair_procedure: string | null;
  safety_precautions: string | null;
  post_repair_tests: string | null;
  notes: string | null;
  started_at: Date;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  review_note: string | null;
  submitted_by: string | null;
  started_by_name: string | null;
  submitted_by_name: string | null;
  reviewed_by_name: string | null;
}

interface TaskRow {
  id: string;
  plan_id: string;
  position: number;
  finding_id: string | null;
  finding_description: string | null;
  title: string;
  description: string | null;
  required_skill: string | null;
  service_bay: string | null;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  /** `numeric` arrives as a string from `pg` — converted at the boundary above. */
  estimated_labour_hours: string | null;
  recorded_by_name: string | null;
  recorded_at: Date;
  updated_at: Date;
}

interface ResourceRow {
  id: string;
  plan_id: string;
  task_id: string | null;
  position: number;
  resource_kind: ResourceKind;
  name: string;
  reference: string | null;
  quantity: string;
  unit: string | null;
  note: string | null;
  recorded_by_name: string | null;
  recorded_at: Date;
}

interface FaultRow {
  plan_id: string;
  id: string;
  position: number;
  fault_code: string | null;
  fault_description: string;
  affected_system: string;
  task_count: number;
}
