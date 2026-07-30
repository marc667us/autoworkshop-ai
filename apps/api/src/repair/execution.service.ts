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
import { optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  CAN_EXECUTE_REPAIR,
  CAN_READ_EXECUTION,
  EVIDENCE_KINDS,
  EXECUTION_STAGES,
  EXECUTION_TASK_STATUSES,
  PRODUCTIVE_KINDS,
  READINESS_CHECKS,
  REQUIRED_PROPOSAL_STATUS,
  TIME_ENTRY_KINDS,
  evidenceKindLabel,
  timeEntryKindLabel,
  type EvidenceKind,
  type ExecutionStatus,
  type ExecutionTaskStatus,
  type TimeEntryKind,
} from './execution-rules';

export interface ExecutionTask {
  id: string;
  position: number;
  repairPlanTaskId: string;
  /** Read from the immutable plan, never copied. */
  title: string;
  estimatedLabourHours: number | null;
  /** The confirmed fault this task addresses — slice 9 walks it. */
  findingDescription: string | null;
  status: ExecutionTaskStatus | string;
  statusNote: string | null;
  completedByName: string | null;
  completedAt: string | null;
  /** Productive time booked against this task, in hours. Derived, never stored. */
  workedHours: number;
}

export interface TimeEntry {
  id: string;
  executionTaskId: string | null;
  entryKind: TimeEntryKind | string;
  entryKindLabel: string;
  technicianName: string | null;
  serviceBay: string | null;
  repairStage: string | null;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  /** null while the entry is still running. */
  hours: number | null;
}

export interface PartUsed {
  id: string;
  position: number;
  executionTaskId: string | null;
  repairPlanResourceId: string | null;
  description: string;
  partNumber: string | null;
  quantity: number;
  unit: string | null;
  note: string | null;
  recordedByName: string | null;
}

export interface EvidenceItem {
  id: string;
  position: number;
  executionTaskId: string | null;
  evidenceKind: EvidenceKind | string;
  evidenceKindLabel: string;
  description: string;
  recordedValue: string | null;
  externalReference: string | null;
  recordedByName: string | null;
  recordedAt: string;
}

export interface RepairExecution {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  proposalId: string;
  proposalVersionNo: number;
  attemptNo: number;
  status: ExecutionStatus;
  customerApprovalConfirmed: boolean;
  partsAvailableConfirmed: boolean;
  toolsAvailableConfirmed: boolean;
  bayAvailableConfirmed: boolean;
  safetyConfirmed: boolean;
  readinessNote: string | null;
  serviceBay: string | null;
  startedByName: string | null;
  startedAt: string;
  completedByName: string | null;
  completedAt: string | null;
  completionNote: string | null;
  unexpectedFindings: string | null;
  tasks: ExecutionTask[];
  timeEntries: TimeEntry[];
  partsUsed: PartUsed[];
  evidence: EvidenceItem[];
  /**
   * ── ALL DERIVED, AND §33 SAYS WHY THEY ARE ADVISORY ───────────────────────
   *
   * "The system shall not depend entirely on manual time records for determining
   * technical quality." So these are shown to people and used by nothing: no gate
   * compares them to the plan's estimate, and completing a repair does not require
   * them to look sensible. A technician who forgets to press Pause produces a wrong
   * duration, not a wrong repair.
   */
  productiveHours: number;
  nonProductiveHours: number;
  estimatedHours: number;
  completedTaskCount: number;
  outstandingTaskCount: number;
  /** Whether anyone is still clocked on — the number that stops a running clock. */
  runningEntryCount: number;
  editable: boolean;
  completable: boolean;
}

/**
 * Carrying out the authorised repair — `07.txt` §31-§33, `1.txt` §386.
 *
 * ── THE AUTHORISATION IS STRUCTURAL ────────────────────────────────────────
 *
 * §7: "repair work shall not start until the required approval is received." That is a
 * foreign key to an APPROVED proposal plus a trigger, not a checkbox. §32's five
 * confirmations are recorded as well, because the specification asks the technician to
 * confirm them — but they are an acknowledgement, and the key is the control. Modelling
 * only the checkbox would make unauthorised work a data-entry mistake rather than an
 * impossibility.
 *
 * ── PAUSE AND RESUME ARE TWO ROWS, NOT A FIELD ─────────────────────────────
 *
 * §33's Start / Pause / Resume are handled by closing one interval and opening
 * another, so a worked interval and a waiting interval have the same shape and both
 * are auditable. A `paused_at` column on a single row would make "how long were we
 * waiting for the part" unanswerable after the second pause.
 */
@Injectable()
export class ExecutionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairExecution[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any execution is read.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readExecutions(client, ctx, { jobCardId: cardId });
    });
  }

  async list(ctx: TenantContext): Promise<RepairExecution[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readExecutions(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<RepairExecution> {
    this.assertMayRead(ctx);
    const executionId = requireUuid(id, 'id');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readExecutions(client, ctx, { executionId });
      return ExecutionService.one(rows);
    });
  }

  /**
   * §3 — "The technician selects 'Start Repair.'"
   *
   * Creates the header AND one row per approved plan task, because §5 has the
   * technician follow the APPROVED procedure: the work list is not something they
   * compose, it is what the customer agreed to pay for.
   */
  async start(
    ctx: TenantContext,
    jobCardId: string,
    input: { serviceBay?: string; readinessNote?: string } = {},
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    const serviceBay = optionalText(input.serviceBay, 'serviceBay', 200);
    const readinessNote = optionalText(input.readinessNote, 'readinessNote', 8000);

    return this.db.withTenant(ctx, async (client) => {
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      if (!EXECUTION_STAGES.includes(card.stage)) {
        throw new BadRequestException(
          `a repair may only be started while the job card is at ` +
            `${EXECUTION_STAGES.map((s) => `'${s}'`).join(' or ')}; this card is at ` +
            `'${card.stage}'. Move the card to '${EXECUTION_STAGES[0]}' first.`,
        );
      }

      const open = await client.query(
        `SELECT id, status FROM repair.repair_executions
          WHERE job_card_id = $1 AND tenant_id = $2 AND status = 'in_progress'
          ORDER BY attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      if (open.rows.length > 0) {
        throw new ConflictException(
          'this job card already has a repair in progress; complete it before starting another',
        );
      }

      // ── §7: the authorisation ────────────────────────────────────────────
      // The newest APPROVED proposal, and the plan behind it — the work list comes
      // from the plan the customer agreed to, reached through the quotation that
      // priced it. One query rather than three, because all three are immutable by
      // the time this runs and cannot disagree.
      const proposalRow = await client.query(
        `SELECT pr.id, pr.version_no, q.repair_plan_id
           FROM repair.repair_proposals pr
           JOIN repair.quotations q ON q.id = pr.quotation_id AND q.tenant_id = pr.tenant_id
          WHERE pr.job_card_id = $1 AND pr.tenant_id = $2 AND pr.organization_id = $3
            AND pr.status = $4
          ORDER BY pr.version_no DESC LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_PROPOSAL_STATUS],
      );
      const proposal = proposalRow.rows[0] as
        | { id: string; version_no: number; repair_plan_id: string }
        | undefined;
      if (!proposal) {
        // The refusal names a route that exists — the proposal queue is where a
        // customer's decision is recorded.
        throw new ConflictException(
          'repair work cannot start until the customer has approved a proposal, and this ' +
            'job card has none approved. Record the customer decision on the Customer ' +
            'Proposals screen first.',
        );
      }

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.repair_executions WHERE job_card_id = $1 AND tenant_id = $2`,
        [cardId, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.repair_executions
           (tenant_id, organization_id, job_card_id, proposal_id, attempt_no,
            service_bay, readiness_note, started_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$8)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, cardId, proposal.id, attemptNo,
          serviceBay, readinessNote, ctx.userId,
        ],
      );
      const executionId = inserted.rows[0].id as string;

      // One row per APPROVED plan task, in the plan's own sequence.
      const created = await client.query(
        `INSERT INTO repair.execution_tasks
           (tenant_id, organization_id, execution_id, repair_plan_task_id, position,
            created_by, updated_by)
         SELECT $1, $2, $3, t.id, t.position, $4, $4
           FROM repair.repair_plan_tasks t
          WHERE t.plan_id = $5 AND t.tenant_id = $1
          ORDER BY t.position
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, executionId, ctx.userId, proposal.repair_plan_id],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_execution.started',
        resourceType: 'repair_execution',
        resourceId: executionId,
        detail: {
          jobNumber: card.job_number,
          attemptNo,
          proposalVersionNo: proposal.version_no,
          tasksToDo: created.rows.length,
        },
      });

      const rows = await this.readExecutions(client, ctx, { executionId });
      return ExecutionService.one(rows);
    });
  }

  /** §32's five confirmations, and the bay. */
  async recordReadiness(
    ctx: TenantContext,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // Column names come from `READINESS_CHECKS`, which is source data — never from the
    // request. Nothing caller-supplied reaches the SQL text.
    for (const check of READINESS_CHECKS) {
      if (input[check.key] !== undefined) set(check.column, input[check.key] === true);
    }
    if (input['serviceBay'] !== undefined) {
      this.nullableText(set, 'service_bay', input['serviceBay'], 'serviceBay', 200);
    }
    if (input['readinessNote'] !== undefined) {
      this.nullableText(set, 'readiness_note', input['readinessNote'], 'readinessNote', 8000);
    }

    if (sets.length === 0) throw new BadRequestException('nothing to update');
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');
    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_executions SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'repair_execution.readiness_recorded',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: { jobNumber: execution.job_number },
      });
      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /** §6 — record task completion, or that a task is blocked. */
  async setTaskStatus(
    ctx: TenantContext,
    executionId: string,
    taskId: string,
    input: { status?: string; statusNote?: string },
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');
    const targetId = requireUuid(taskId, 'taskId');
    const status: ExecutionTaskStatus = requireOneOf(
      input.status, EXECUTION_TASK_STATUSES, 'status',
    );
    const note = optionalText(input.statusNote, 'statusNote', 8000);

    // Both are states somebody else must act on, and the migration's CHECK agrees.
    if ((status === 'blocked' || status === 'skipped') && note === null) {
      throw new BadRequestException(
        status === 'blocked'
          ? 'say what is blocking this task; a blocked task with no reason cannot be unblocked by anyone else'
          : 'say why this task is not required; the customer approved it, so its absence needs an explanation',
      );
    }

    const completing = status === 'completed';

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);

      const updated = await client.query(
        `UPDATE repair.execution_tasks
            SET status = $1,
                status_note = $2,
                -- Stamped on the FIRST move to in_progress and never rewritten, so
                -- "when did this task start" survives a pause.
                started_at = CASE
                  WHEN started_at IS NULL AND $1 <> 'pending' THEN now() ELSE started_at END,
                -- ⚠️ THE CAST IS LOAD-BEARING. Inside a CASE whose other branch is a
                -- bare NULL, Postgres has nothing to infer the parameter's type from and
                -- settles on TEXT — so this assignment failed with "column completed_by
                -- is of type uuid but expression is of type text" and EVERY task status
                -- change 500d. The same parameter in updated_by below is fine,
                -- because there the column tells Postgres what it is. Found by the live
                -- probe; a fake client would have accepted it forever.
                --
                -- (NO BACKTICKS IN THIS COMMENT. It lives inside a template literal and a
                -- stray one ends the SQL string — TS1005. Documented in the repo, warned
                -- about in slice 3b's own warning comment, and landed here anyway.)
                completed_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
                completed_at = CASE WHEN $3 THEN now() ELSE NULL END,
                updated_by = $4, updated_at = now()
          WHERE id = $5 AND execution_id = $6 AND tenant_id = $7`,
        [status, note, completing, ctx.userId, targetId, id, ctx.tenantId],
      );
      // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look successful.
      if (updated.rowCount === 0) {
        throw new NotFoundException('task not found on this repair');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_execution.task_status_recorded',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: { jobNumber: execution.job_number, taskId: targetId, status },
      });

      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /**
   * §33 — Start Work, or begin a spell of non-productive time.
   *
   * ⚠️ IT CLOSES WHATEVER THIS TECHNICIAN HAD RUNNING FIRST. Pressing "waiting for
   * parts" while the productive clock runs must not book the same minutes twice, and a
   * partial unique index in 019 refuses two open entries for one technician on one job
   * anyway — so doing it here turns a 500 into the obvious behaviour.
   */
  async startTimeEntry(
    ctx: TenantContext,
    executionId: string,
    input: { entryKind?: string; executionTaskId?: string; serviceBay?: string; note?: string },
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');
    const entryKind: TimeEntryKind = requireOneOf(input.entryKind, TIME_ENTRY_KINDS, 'entryKind');
    const taskId = input.executionTaskId ? requireUuid(input.executionTaskId, 'executionTaskId') : null;
    const serviceBay = optionalText(input.serviceBay, 'serviceBay', 200);
    const note = optionalText(input.note, 'note', 2000);

    if (!PRODUCTIVE_KINDS.has(entryKind) && note === null) {
      throw new BadRequestException(
        'say what the delay is; non-productive time with no note cannot be chased, and ' +
          'chasing it is the only reason to record it',
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);

      if (taskId !== null) {
        const owns = await client.query(
          `SELECT 1 FROM repair.execution_tasks
            WHERE id = $1 AND execution_id = $2 AND tenant_id = $3`,
          [taskId, id, ctx.tenantId],
        );
        if (owns.rows.length === 0) throw new NotFoundException('task not found on this repair');
      }

      // Close whatever this technician had running on THIS job — see the note above.
      await client.query(
        `UPDATE repair.execution_time_entries
            SET ended_at = now(), updated_by = $1, updated_at = now()
          WHERE execution_id = $2 AND technician_id = $1
            AND ended_at IS NULL AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      await client.query(
        `INSERT INTO repair.execution_time_entries
           (tenant_id, organization_id, execution_id, execution_task_id, entry_kind,
            technician_id, service_bay, repair_stage, note, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$6)`,
        [
          ctx.tenantId, ctx.organizationId, id, taskId, entryKind, ctx.userId,
          serviceBay ?? execution.service_bay,
          // §33 — the stage this time was booked against, COPIED because the stage
          // moves on and the question cannot be answered later from a changed value.
          execution.stage,
          note,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_execution.time_started',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: { jobNumber: execution.job_number, entryKind },
      });

      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /** §33's Pause / Complete Task — close this technician's running entry. */
  async stopTimeEntry(ctx: TenantContext, executionId: string): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);

      const closed = await client.query(
        `UPDATE repair.execution_time_entries
            SET ended_at = now(), updated_by = $1, updated_at = now()
          WHERE execution_id = $2 AND technician_id = $1
            AND ended_at IS NULL AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );
      if (closed.rowCount === 0) {
        // Reported rather than treated as success: a Pause that paused nothing leaves
        // the technician believing the clock stopped.
        throw new ConflictException('you have no running time entry on this repair');
      }

      await this.audit.write(client, ctx, {
        action: 'repair_execution.time_stopped',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: { jobNumber: execution.job_number },
      });

      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /** §7 — record a part actually fitted. */
  async recordPartUsed(
    ctx: TenantContext,
    executionId: string,
    input: {
      description?: string;
      partNumber?: string;
      quantity?: number;
      unit?: string;
      note?: string;
      executionTaskId?: string;
      repairPlanResourceId?: string;
    },
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');
    const description = requireText(input.description, 'description', 500);
    const quantity = this.requireQuantity(input.quantity);
    const partNumber = optionalText(input.partNumber, 'partNumber', 200);
    const unit = optionalText(input.unit, 'unit', 50);
    const note = optionalText(input.note, 'note', 2000);
    const taskId = input.executionTaskId ? requireUuid(input.executionTaskId, 'executionTaskId') : null;
    const resourceId = input.repairPlanResourceId
      ? requireUuid(input.repairPlanResourceId, 'repairPlanResourceId')
      : null;

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);
      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.execution_parts_used WHERE execution_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      await client.query(
        `INSERT INTO repair.execution_parts_used
           (tenant_id, organization_id, execution_id, execution_task_id,
            repair_plan_resource_id, position, description, part_number, quantity, unit,
            note, recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          ctx.tenantId, ctx.organizationId, id, taskId, resourceId,
          Number(next.rows[0].n), description, partNumber, quantity, unit, note, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'repair_execution.part_used',
        resourceType: 'repair_execution',
        resourceId: id,
        // Whether it was planned is the fact worth auditing: an unplanned part is what
        // a variation is made of.
        detail: {
          jobNumber: execution.job_number,
          quantity,
          wasPlanned: resourceId !== null,
        },
      });
      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /** §8-§9 — a measurement, a photograph, an observation. */
  async recordEvidence(
    ctx: TenantContext,
    executionId: string,
    input: {
      evidenceKind?: string;
      description?: string;
      recordedValue?: string;
      externalReference?: string;
      executionTaskId?: string;
    },
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');
    const evidenceKind: EvidenceKind = requireOneOf(input.evidenceKind, EVIDENCE_KINDS, 'evidenceKind');
    const description = requireText(input.description, 'description', 2000);
    const recordedValue = optionalText(input.recordedValue, 'recordedValue', 500);
    const externalReference = optionalText(input.externalReference, 'externalReference', 500);
    const taskId = input.executionTaskId ? requireUuid(input.executionTaskId, 'executionTaskId') : null;

    if (evidenceKind === 'measurement' && recordedValue === null) {
      throw new BadRequestException(
        'a measurement needs the reading you took; a measurement with no value is an observation',
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);
      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.execution_evidence WHERE execution_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      await client.query(
        `INSERT INTO repair.execution_evidence
           (tenant_id, organization_id, execution_id, execution_task_id, position,
            evidence_kind, description, recorded_value, external_reference, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          ctx.tenantId, ctx.organizationId, id, taskId, Number(next.rows[0].n),
          evidenceKind, description, recordedValue, externalReference, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'repair_execution.evidence_recorded',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: { jobNumber: execution.job_number, evidenceKind },
      });
      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  /**
   * §13 — "The technician completes the AUTHORIZED repair."
   *
   * ── THE GATES, AND THE ONE THAT IS DELIBERATELY NOT HERE ───────────────────
   *
   * 1. NO TASK MAY STILL BE OUTSTANDING. `pending`, `in_progress` and `blocked` all
   *    mean work the customer paid for has not been done, and a repair completed over
   *    them is a car handed back unfinished. `skipped` is permitted — it carries a
   *    mandatory reason, which is the difference.
   * 2. NOTHING MAY STILL BE CLOCKED ON. A running entry means somebody believes they
   *    are still working on it, and completing underneath them loses the end of their
   *    shift.
   *
   * NOT a gate: that the time booked resembles the estimate. §33 says the system shall
   * not depend entirely on manual time records, and a repair refused because a
   * technician forgot to press Pause would teach everyone to stop using the clock.
   */
  async complete(
    ctx: TenantContext,
    executionId: string,
    input: { completionNote?: string; unexpectedFindings?: string },
  ): Promise<RepairExecution> {
    this.assertMayExecute(ctx);
    const id = requireUuid(executionId, 'id');
    const completionNote = optionalText(input.completionNote, 'completionNote', 8000);
    const unexpectedFindings = optionalText(input.unexpectedFindings, 'unexpectedFindings', 8000);

    return this.db.withTenant(ctx, async (client) => {
      const execution = await this.assertOpen(client, ctx, id);
      const current = ExecutionService.one(await this.readExecutions(client, ctx, { executionId: id }));

      const outstanding = current.tasks.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked',
      );
      if (outstanding.length > 0) {
        const names = outstanding.slice(0, 5).map((t) => `${t.position}. ${t.title}`).join('; ');
        throw new BadRequestException(
          `${outstanding.length} approved task(s) are not finished. Complete them, or mark ` +
            `one that is genuinely not required as "not required" with a reason: ${names}`,
        );
      }

      if (current.runningEntryCount > 0) {
        throw new BadRequestException(
          `${current.runningEntryCount} time entr(ies) are still running. Stop the clock ` +
            'before completing the repair, or the end of somebody’s work is lost.',
        );
      }

      await client.query(
        `UPDATE repair.repair_executions
            SET status = 'completed', completed_by = $1, completed_at = now(),
                completion_note = $2, unexpected_findings = $3,
                updated_by = $1, updated_at = now()
          WHERE id = $4 AND tenant_id = $5`,
        [ctx.userId, completionNote, unexpectedFindings, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_execution.completed',
        resourceType: 'repair_execution',
        resourceId: id,
        detail: {
          jobNumber: execution.job_number,
          attemptNo: execution.attempt_no,
          tasksCompleted: current.completedTaskCount,
          productiveHours: current.productiveHours,
          nonProductiveHours: current.nonProductiveHours,
          partsUsed: current.partsUsed.length,
          evidenceItems: current.evidence.length,
          // Recorded because anything CHARGEABLE in here has to become a variation
          // rather than simply being done.
          hadUnexpectedFindings: unexpectedFindings !== null,
        },
      });

      const rows = await this.readExecutions(client, ctx, { executionId: id });
      return ExecutionService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private async readExecutions(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; executionId?: string },
  ): Promise<RepairExecution[]> {
    const headers = await client.query(
      `SELECT e.id, e.job_card_id, j.job_number, v.registration_number,
              e.proposal_id, pr.version_no AS proposal_version_no,
              e.attempt_no, e.status,
              e.customer_approval_confirmed, e.parts_available_confirmed,
              e.tools_available_confirmed, e.bay_available_confirmed, e.safety_confirmed,
              e.readiness_note, e.service_bay,
              e.started_at, e.completed_at, e.completion_note, e.unexpected_findings,
              sb.display_name AS started_by_name,
              cb.display_name AS completed_by_name
         FROM repair.repair_executions e
         JOIN repair.job_cards j ON j.id = e.job_card_id AND j.tenant_id = e.tenant_id
         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         JOIN repair.repair_proposals pr ON pr.id = e.proposal_id AND pr.tenant_id = e.tenant_id
         LEFT JOIN identity.users sb ON sb.id = e.started_by
         LEFT JOIN identity.users cb ON cb.id = e.completed_by
        WHERE e.tenant_id = $1
          AND e.organization_id = $2
          AND ($3::uuid IS NULL OR e.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR e.id = $4::uuid)
          -- The same narrowing the job card carries.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY e.attempt_no DESC`,
      [
        ctx.tenantId, ctx.organizationId,
        filter.jobCardId ?? null, filter.executionId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [tasks, times, parts, evidence] = await Promise.all([
      client.query(
        `SELECT et.id, et.execution_id, et.position, et.repair_plan_task_id, et.status,
                et.status_note, et.completed_at,
                t.title, t.estimated_labour_hours,
                f.fault_description AS finding_description,
                cb.display_name AS completed_by_name,
                -- Productive time booked against this task. Computed in SQL so the
                -- figure a screen shows is the database's answer, not a second one.
                COALESCE((
                  SELECT sum(EXTRACT(EPOCH FROM (COALESCE(te.ended_at, now()) - te.started_at)))
                    FROM repair.execution_time_entries te
                   WHERE te.execution_task_id = et.id AND te.tenant_id = et.tenant_id
                     AND te.entry_kind = 'productive'
                ), 0) AS worked_seconds
           FROM repair.execution_tasks et
           JOIN repair.repair_plan_tasks t
             ON t.id = et.repair_plan_task_id AND t.tenant_id = et.tenant_id
           LEFT JOIN repair.diagnostic_findings f
             ON f.id = t.finding_id AND f.tenant_id = t.tenant_id
           LEFT JOIN identity.users cb ON cb.id = et.completed_by
          WHERE et.execution_id = ANY($1::uuid[]) AND et.tenant_id = $2
          ORDER BY et.position`,
        [ids, ctx.tenantId],
      ),
      client.query(
        `SELECT te.id, te.execution_id, te.execution_task_id, te.entry_kind,
                te.service_bay, te.repair_stage, te.started_at, te.ended_at, te.note,
                u.display_name AS technician_name,
                EXTRACT(EPOCH FROM (te.ended_at - te.started_at)) AS seconds
           FROM repair.execution_time_entries te
           LEFT JOIN identity.users u ON u.id = te.technician_id
          WHERE te.execution_id = ANY($1::uuid[]) AND te.tenant_id = $2
          ORDER BY te.started_at`,
        [ids, ctx.tenantId],
      ),
      client.query(
        `SELECT p.id, p.execution_id, p.execution_task_id, p.repair_plan_resource_id,
                p.position, p.description, p.part_number, p.quantity, p.unit, p.note,
                rb.display_name AS recorded_by_name
           FROM repair.execution_parts_used p
           LEFT JOIN identity.users rb ON rb.id = p.recorded_by
          WHERE p.execution_id = ANY($1::uuid[]) AND p.tenant_id = $2
          ORDER BY p.position`,
        [ids, ctx.tenantId],
      ),
      client.query(
        `SELECT ev.id, ev.execution_id, ev.execution_task_id, ev.position,
                ev.evidence_kind, ev.description, ev.recorded_value,
                ev.external_reference, ev.recorded_at,
                rb.display_name AS recorded_by_name
           FROM repair.execution_evidence ev
           LEFT JOIN identity.users rb ON rb.id = ev.recorded_by
          WHERE ev.execution_id = ANY($1::uuid[]) AND ev.tenant_id = $2
          ORDER BY ev.position`,
        [ids, ctx.tenantId],
      ),
    ]);

    const group = <T extends { execution_id: string }>(list: T[]): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const l = m.get(r.execution_id) ?? [];
        l.push(r);
        m.set(r.execution_id, l);
      }
      return m;
    };
    const tasksBy = group(tasks.rows as TaskRow[]);
    const timesBy = group(times.rows as TimeRow[]);
    const partsBy = group(parts.rows as PartRow[]);
    const evidenceBy = group(evidence.rows as EvidenceRow[]);

    return rows.map((row) => {
      const taskList = (tasksBy.get(row.id) ?? []).map((t) => ({
        id: t.id,
        position: t.position,
        repairPlanTaskId: t.repair_plan_task_id,
        title: t.title,
        estimatedLabourHours:
          t.estimated_labour_hours === null ? null : Number(t.estimated_labour_hours),
        findingDescription: t.finding_description,
        status: t.status,
        statusNote: t.status_note,
        completedByName: t.completed_by_name,
        completedAt: t.completed_at ? t.completed_at.toISOString() : null,
        workedHours: hours(Number(t.worked_seconds)),
      }));

      const timeList = (timesBy.get(row.id) ?? []).map((t) => ({
        id: t.id,
        executionTaskId: t.execution_task_id,
        entryKind: t.entry_kind,
        entryKindLabel: timeEntryKindLabel(t.entry_kind),
        technicianName: t.technician_name,
        serviceBay: t.service_bay,
        repairStage: t.repair_stage,
        startedAt: t.started_at.toISOString(),
        endedAt: t.ended_at ? t.ended_at.toISOString() : null,
        note: t.note,
        // null while running — a duration for an unfinished interval would be a
        // number that changes every time somebody looks at it.
        hours: t.seconds === null ? null : hours(Number(t.seconds)),
      }));

      const productive = timeList
        .filter((t) => PRODUCTIVE_KINDS.has(t.entryKind) && t.hours !== null)
        .reduce((s, t) => s + (t.hours ?? 0), 0);
      const nonProductive = timeList
        .filter((t) => !PRODUCTIVE_KINDS.has(t.entryKind) && t.hours !== null)
        .reduce((s, t) => s + (t.hours ?? 0), 0);

      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        proposalId: row.proposal_id,
        proposalVersionNo: row.proposal_version_no,
        attemptNo: row.attempt_no,
        status: row.status,
        customerApprovalConfirmed: row.customer_approval_confirmed,
        partsAvailableConfirmed: row.parts_available_confirmed,
        toolsAvailableConfirmed: row.tools_available_confirmed,
        bayAvailableConfirmed: row.bay_available_confirmed,
        safetyConfirmed: row.safety_confirmed,
        readinessNote: row.readiness_note,
        serviceBay: row.service_bay,
        startedByName: row.started_by_name,
        startedAt: row.started_at.toISOString(),
        completedByName: row.completed_by_name,
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        completionNote: row.completion_note,
        unexpectedFindings: row.unexpected_findings,
        tasks: taskList,
        timeEntries: timeList,
        partsUsed: (partsBy.get(row.id) ?? []).map((p) => ({
          id: p.id,
          position: p.position,
          executionTaskId: p.execution_task_id,
          repairPlanResourceId: p.repair_plan_resource_id,
          description: p.description,
          partNumber: p.part_number,
          quantity: Number(p.quantity),
          unit: p.unit,
          note: p.note,
          recordedByName: p.recorded_by_name,
        })),
        evidence: (evidenceBy.get(row.id) ?? []).map((e) => ({
          id: e.id,
          position: e.position,
          executionTaskId: e.execution_task_id,
          evidenceKind: e.evidence_kind,
          evidenceKindLabel: evidenceKindLabel(e.evidence_kind),
          description: e.description,
          recordedValue: e.recorded_value,
          externalReference: e.external_reference,
          recordedByName: e.recorded_by_name,
          recordedAt: e.recorded_at.toISOString(),
        })),
        productiveHours: round2(productive),
        nonProductiveHours: round2(nonProductive),
        estimatedHours: round2(
          taskList.reduce((s, t) => s + (t.estimatedLabourHours ?? 0), 0),
        ),
        completedTaskCount: taskList.filter((t) => t.status === 'completed').length,
        outstandingTaskCount: taskList.filter(
          (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'blocked',
        ).length,
        runningEntryCount: timeList.filter((t) => t.endedAt === null).length,
        editable: row.status === 'in_progress' && CAN_EXECUTE_REPAIR.has(ctx.activeRole),
        completable: row.status === 'in_progress' && CAN_EXECUTE_REPAIR.has(ctx.activeRole),
      };
    });
  }

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
        cardId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    // 404, not 403 — the non-oracle rule this codebase holds everywhere.
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  private async assertOpen(
    client: Client,
    ctx: TenantContext,
    executionId: string,
  ): Promise<{ job_number: string; attempt_no: number; service_bay: string | null; stage: string }> {
    const found = await client.query(
      `SELECT e.id, e.status, e.attempt_no, e.service_bay, j.job_number, j.stage
         FROM repair.repair_executions e
         JOIN repair.job_cards j ON j.id = e.job_card_id AND j.tenant_id = e.tenant_id
        WHERE e.id = $1 AND e.tenant_id = $2 AND e.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
        FOR UPDATE OF e`,
      [
        executionId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );
    const row = found.rows[0] as
      | {
          id: string; status: ExecutionStatus; attempt_no: number;
          service_bay: string | null; job_number: string; stage: string;
        }
      | undefined;
    if (!row) throw new NotFoundException('repair not found');
    if (row.status !== 'in_progress') {
      throw new ConflictException(
        `this repair is ${row.status} and its record cannot be changed; ` +
          'start a new repair if further work is authorised',
      );
    }
    return {
      job_number: row.job_number,
      attempt_no: row.attempt_no,
      service_bay: row.service_bay,
      stage: row.stage,
    };
  }

  /** Absent leaves it, null/'' clears it, a wrong type is a 400 — never a silent clear. */
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
    set(column, optionalText(raw, field, max));
  }

  private requireQuantity(value: unknown): number {
    if (value === undefined || value === null) throw new BadRequestException('quantity is required');
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException('quantity must be a number');
    }
    if (value <= 0) throw new BadRequestException('quantity must be greater than zero');
    if (value > 999999999) throw new BadRequestException('quantity is implausibly large');
    if (Math.round(value * 1000) !== value * 1000) {
      throw new BadRequestException('quantity is recorded to three decimal places; round it first');
    }
    return value;
  }

  private static one(rows: RepairExecution[]): RepairExecution {
    const first = rows[0];
    if (!first) throw new NotFoundException('repair not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_EXECUTION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read repair records`);
    }
  }

  private assertMayExecute(ctx: TenantContext): void {
    if (!CAN_EXECUTE_REPAIR.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not carry out a repair`);
    }
  }
}

/** Seconds to hours, two places — the unit every estimate in this domain uses. */
function hours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  registration_number: string;
  proposal_id: string;
  proposal_version_no: number;
  attempt_no: number;
  status: ExecutionStatus;
  customer_approval_confirmed: boolean;
  parts_available_confirmed: boolean;
  tools_available_confirmed: boolean;
  bay_available_confirmed: boolean;
  safety_confirmed: boolean;
  readiness_note: string | null;
  service_bay: string | null;
  started_at: Date;
  completed_at: Date | null;
  completion_note: string | null;
  unexpected_findings: string | null;
  started_by_name: string | null;
  completed_by_name: string | null;
}

interface TaskRow {
  id: string;
  execution_id: string;
  position: number;
  repair_plan_task_id: string;
  status: ExecutionTaskStatus;
  status_note: string | null;
  completed_at: Date | null;
  title: string;
  estimated_labour_hours: string | null;
  finding_description: string | null;
  completed_by_name: string | null;
  worked_seconds: string;
}

interface TimeRow {
  id: string;
  execution_id: string;
  execution_task_id: string | null;
  entry_kind: TimeEntryKind;
  service_bay: string | null;
  repair_stage: string | null;
  started_at: Date;
  ended_at: Date | null;
  note: string | null;
  technician_name: string | null;
  seconds: string | null;
}

interface PartRow {
  id: string;
  execution_id: string;
  execution_task_id: string | null;
  repair_plan_resource_id: string | null;
  position: number;
  description: string;
  part_number: string | null;
  quantity: string;
  unit: string | null;
  note: string | null;
  recorded_by_name: string | null;
}

interface EvidenceRow {
  id: string;
  execution_id: string;
  execution_task_id: string | null;
  position: number;
  evidence_kind: EvidenceKind;
  description: string;
  recorded_value: string | null;
  external_reference: string | null;
  recorded_at: Date;
  recorded_by_name: string | null;
}
