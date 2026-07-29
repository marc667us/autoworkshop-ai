import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  optionalDate,
  optionalInt,
  optionalOneOf,
  optionalText,
  optionalUuid,
  requireOneOf,
  requireText,
  requireUuid,
} from '../core/validate';
import {
  BOARD_COLUMNS,
  CAN_OVERRIDE_STAGE,
  ROLE_TARGET_STAGES,
  STAGES,
  permittedTargetsFrom,
  stageOptionsFor,
  type Stage,
} from './job-card-stages';

export interface JobCard {
  id: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  mileageAtIntake: number | null;
  openedAt: string;
  /**
   * When the card last CHANGED STAGE — migration 007. The staging board's
   * "elapsed time" (`02.txt` §29) is measured from here and not from
   * `updated_at`, which any edit would reset, hiding a stalled job behind a
   * corrected typo.
   */
  stageChangedAt: string;
  closedAt: string | null;
  /**
   * The stages THIS viewer may move THIS card to next — the lifecycle's options
   * narrowed to the ones their role may produce.
   *
   * ⚠️ A UI CONVENIENCE, NEVER A CONTROL. It exists so the board offers only
   * moves that will succeed. `changeStage` re-derives the whole judgement
   * server-side on every call, because a `<select>` is a suggestion and anyone
   * can send whatever they like (CLAUDE.md §8 — hidden is not secure).
   */
  allowedStages: string[];
}

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

/**
 * Roles permitted to READ job cards — but read WHAT is the interesting part.
 *
 * Three different scopes live behind this one list, and collapsing them would
 * either hide a workshop's own workload or hand a technician the whole book:
 *
 *   · workshop staff — every job card in their organisation.
 *   · `technician`   — ONLY the cards assigned to them (`07.txt` pt2 §50:
 *                      "ASSIGNED-JOB inspection, diagnosis, repair planning,
 *                      execution, testing", and §49's navigation gives them
 *                      "My Assigned Work", not a job list).
 *   · `customer`     — ONLY the cards raised against their own vehicles.
 *
 * ⚠️ THIS IS THE PROMISE PHASE 4 MADE. `CAN_READ_VEHICLES` deliberately excludes
 * technicians, with a comment saying a technician gets the customer and vehicle
 * for the JOB THEY ARE ASSIGNED, and that it would arrive "with the job card
 * that can express it". This is that job card. A technician reads a customer
 * name and a registration number through here — narrowed by assignment — and
 * still cannot list the vehicle register.
 */
const CAN_READ_JOBS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'workshop_supervisor',
  'quality_control_inspector',
  'storekeeper',
  'cashier',
  'technician',
  'customer',
]);

/**
 * Roles permitted to OPEN a job card.
 *
 * `customer` is here because `2.txt` §537 has the vehicle owner reporting a
 * problem, and a complaint IS the first stage of the lifecycle
 * (`1.txt` §322: "Complaint received"). What a customer may raise one AGAINST
 * is constrained in `create` — their own vehicle, and nobody else's.
 *
 * A technician is absent: §50 scopes them to work on assigned jobs, not to
 * open them.
 */
const CAN_CREATE_JOB = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'customer',
]);

const SELECT_JOB = `
  SELECT j.id, j.job_number, j.customer_id, c.display_name AS customer_name,
         j.vehicle_id, v.registration_number,
         mk.name AS make, md.name AS model, v.model_year,
         j.complaint, j.stage, j.priority,
         j.assigned_technician_id, t.display_name AS technician_name,
         j.expected_completion_on, j.mileage_at_intake, j.opened_at,
         j.stage_changed_at, j.closed_at, prev.to_stage AS resume_stage
    FROM repair.job_cards j
    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
    JOIN core.vehicles  v ON v.id = j.vehicle_id  AND v.tenant_id = j.tenant_id
    JOIN core.vehicle_makes mk ON mk.id = v.make_id
    LEFT JOIN core.vehicle_models md ON md.id = v.model_id
    -- LEFT: an unassigned card is the normal state at intake, and an inner join
    -- would hide exactly the cards a manager is looking for.
    LEFT JOIN identity.users t ON t.id = j.assigned_technician_id
    -- The stage a HELD card was at before the hold, so the board can offer the
    -- right resume options. A LATERAL rather than a lookup per card: the board
    -- renders every open job at once, and a query per row is the N+1 that makes
    -- a staging board slowest on the busiest day.
    LEFT JOIN LATERAL (
      SELECT e.to_stage
        FROM repair.job_card_stage_events e
       WHERE e.job_card_id = j.id
         -- EXPLICIT, even though migration 009's composite foreign key now makes
         -- a mismatch unstorable (Codex review of this slice). App code is the
         -- first line of defence and the constraint is the last; this repo
         -- requires both, and a predicate written down is what survives someone
         -- later dropping a constraint they think is redundant.
         AND e.tenant_id = j.tenant_id
         AND e.organization_id = j.organization_id
         AND e.to_stage <> 'on_hold'
       ORDER BY e.changed_at DESC
       LIMIT 1
    ) prev ON true`;

/**
 * Job card domain service — Phase 5, Release 0.4.
 *
 * `1.txt` §322: this domain controls the complete repair lifecycle. Everything
 * later in the phase — inspections, diagnoses, quotations, parts, invoices —
 * references a job card, so the rules about who may see one live here and are
 * inherited rather than restated.
 */
@Injectable()
export class JobCardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, filter?: { vehicleId?: string }): Promise<JobCard[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `${SELECT_JOB}
          WHERE j.tenant_id = $1
            AND j.organization_id = $2
            -- Technician: assigned cards only.
            AND ($3::uuid IS NULL OR j.assigned_technician_id = $3::uuid)
            -- Customer: cards against a customer record linked to them.
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)
            AND ($5::uuid IS NULL OR j.vehicle_id = $5::uuid)
          ORDER BY j.opened_at DESC`,
        [
          ctx.tenantId,
          ctx.organizationId,
          ctx.activeRole === 'technician' ? ctx.userId : null,
          ctx.activeRole === 'customer' ? ctx.userId : null,
          filter?.vehicleId ?? null,
        ],
      );
      return res.rows.map((row) => this.toDomain(ctx, row as Parameters<JobCardService['toDomain']>[1]));
    });
  }

  /**
   * The Repair Staging Board — `02.txt` §29.
   *
   * Returns the COLUMNS as well as the cards, deliberately. §29's column list is
   * a business definition ("Recommended columns are: Received. Initial
   * Inspection. ...") and several stages share one column, so a front end that
   * held its own copy would be a second statement of the same rule — free to
   * drift, and drifting silently, because a card mapped to a column that no
   * longer exists simply disappears from the board while remaining live work.
   *
   * One request rather than two: the board is the screen a manager leaves open
   * all day, and a column list that cannot change between renders should not
   * cost a second round trip.
   */
  async board(ctx: TenantContext): Promise<{
    columns: typeof BOARD_COLUMNS;
    cards: JobCard[];
    viewer: { canOverride: boolean; roleStages: string[] };
  }> {
    // Reuses `list`, so the board inherits the three scopes unchanged: staff see
    // the organisation, a technician sees only cards assigned to them, a
    // customer only their own. A separate query here would be a second place for
    // that narrowing to be forgotten.
    const cards = await this.list(ctx);

    // ── why the viewer block exists ────────────────────────────────────────
    //
    // `allowedStages` on each card lists the ORDINARY moves. If the board
    // offered only those, `1.txt` §394's override would exist in the API and be
    // unreachable from the product — an owner could never actually authorise a
    // bypass, which is the one thing §394 explicitly provides for.
    //
    // So the board also needs to know whether THIS viewer holds the authority,
    // and which stages their role may produce at all. Both answers come from
    // here rather than from a copy of the role tables in the front end: a
    // second copy would drift, and the direction it drifts is a board offering
    // a move the service refuses.
    return {
      columns: BOARD_COLUMNS,
      cards,
      viewer: {
        canOverride: CAN_OVERRIDE_STAGE.has(ctx.activeRole),
        roleStages: [...(ROLE_TARGET_STAGES[ctx.activeRole] ?? [])],
      },
    };
  }

  async findById(ctx: TenantContext, id: string): Promise<JobCard> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `${SELECT_JOB}
          WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
            AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
            AND ($5::uuid IS NULL OR c.user_id = $5::uuid)`,
        [
          id,
          ctx.tenantId,
          ctx.organizationId,
          ctx.activeRole === 'technician' ? ctx.userId : null,
          ctx.activeRole === 'customer' ? ctx.userId : null,
        ],
      );
      const row = res.rows[0];
      // 404 rather than 403 — the same non-oracle reasoning as everywhere else.
      // A technician probing an unassigned card gets what they would get for an
      // id that does not exist.
      if (!row) throw new NotFoundException('job card not found');
      return this.toDomain(ctx, row);
    });
  }

  /**
   * Open a job card. `1.txt` §322 — the lifecycle starts at "complaint
   * received", which is what a customer reporting a problem produces.
   */
  async create(
    ctx: TenantContext,
    input: {
      vehicleId: string;
      complaint: string;
      priority?: string;
      expectedCompletionOn?: string;
      mileageAtIntake?: number;
      assignedTechnicianId?: string;
    },
  ): Promise<JobCard> {
    if (!CAN_CREATE_JOB.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not open a job card`);
    }

    const vehicleId = requireUuid(input.vehicleId, 'vehicleId');
    const complaint = requireText(input.complaint, 'complaint', 4000);
    const priority = optionalOneOf(input.priority, PRIORITIES, 'priority') ?? 'normal';
    const expectedCompletionOn = optionalDate(input.expectedCompletionOn, 'expectedCompletionOn');
    const mileageAtIntake = optionalInt(input.mileageAtIntake, 'mileageAtIntake', 0, 100_000_000);
    const assignedTechnicianId = optionalUuid(input.assignedTechnicianId, 'assignedTechnicianId');

    // A customer may not hand a job to a technician; assignment is the
    // workshop's decision (`07.txt` pt2 §47 puts it under the manager).
    if (assignedTechnicianId && ctx.activeRole === 'customer') {
      throw new ForbiddenException('a customer may not assign a technician');
    }

    return this.db.withTenant(ctx, async (client) => {
      // ── the vehicle must be one this caller may raise a job against ──────
      //
      // A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE, and it carries no
      // ownership predicate either. `vehicle_id` REFERENCES `core.vehicles(id)`
      // and nothing more, so without this lookup a customer could open a job
      // card against SOMEONE ELSE'S CAR — the row would satisfy the FK and the
      // RLS `WITH CHECK`, because both are about the tenant of the row being
      // inserted, not the vehicle it points at.
      //
      // The `c.user_id` clause is what confines a customer to their own
      // vehicles. Staff are not narrowed, only scoped to the organisation.
      const vehicle = await client.query(
        `SELECT v.id, v.customer_id, v.current_mileage_km
           FROM core.vehicles v
           JOIN core.customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
          WHERE v.id = $1 AND v.tenant_id = $2 AND v.organization_id = $3
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)`,
        [vehicleId, ctx.tenantId, ctx.organizationId, ctx.activeRole === 'customer' ? ctx.userId : null],
      );
      if (vehicle.rows.length === 0) throw new NotFoundException('vehicle not found');

      // The customer is DERIVED from the vehicle, never accepted from the
      // caller. Taking both would allow a job card whose customer does not own
      // its vehicle — internally inconsistent in a way no constraint catches,
      // because both ids are individually valid.
      const customerId = vehicle.rows[0].customer_id;

      if (assignedTechnicianId) {
        // The assignee must be an active member of THIS organisation AND hold
        // the technician role.
        //
        // ⚠️ THE ROLE CHECK IS NOT DECORATION (Codex P2, accepted). Membership
        // alone would let a card be assigned to a cashier or a customer. The
        // column is `assigned_technician_id` and `My Assigned Work` is scoped by
        // it for technicians ONLY — so a card assigned to anyone else appears on
        // no technician's list, and the person it was given to has no screen
        // that says it is theirs. The job does not fail loudly; it simply never
        // gets picked up.
        const member = await client.query(
          `SELECT 1 FROM identity.memberships
            WHERE user_id = $1 AND organization_id = $2
              AND status = 'active' AND role_name = 'technician'`,
          [assignedTechnicianId, ctx.organizationId],
        );
        if (member.rows.length === 0) {
          throw new BadRequestException(
            'the assigned user is not an active technician in this organisation',
          );
        }
      }

      const jobNumber = await client.query(`SELECT repair.next_job_number($1) AS n`, [
        ctx.organizationId,
      ]);

      const inserted = await client.query(
        `INSERT INTO repair.job_cards
           (tenant_id, organization_id, branch_id, job_number, customer_id, vehicle_id,
            complaint, priority, assigned_technician_id, expected_completion_on,
            mileage_at_intake, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          ctx.branchId,
          jobNumber.rows[0].n,
          customerId,
          vehicleId,
          complaint,
          priority,
          assignedTechnicianId,
          expectedCompletionOn,
          // Defaults to the vehicle's current reading, which is what reception
          // would otherwise copy by hand off the same screen.
          mileageAtIntake ?? vehicle.rows[0].current_mileage_km ?? null,
          ctx.userId,
        ],
      );

      // THE OPENING EVENT. Migration 008 backfilled one for every card that
      // existed; this is what keeps the invariant true for every card created
      // afterwards, and it is not bookkeeping — the resume rule reads this
      // table. Without it, a card put On Hold straight from intake would have a
      // history containing only the hold, no stage to resume to, and would be
      // stuck needing an owner's override to come back to life.
      await client.query(
        `INSERT INTO repair.job_card_stage_events
           (tenant_id, organization_id, job_card_id, from_stage, to_stage, changed_by, changed_at)
         VALUES ($1,$2,$3,NULL,'complaint_received',$4, now())`,
        [ctx.tenantId, ctx.organizationId, inserted.rows[0].id, ctx.userId],
      );

      await this.audit.write(client, ctx, {
        action: 'job_card.opened',
        resourceType: 'job_card',
        resourceId: inserted.rows[0].id,
        // The job number and stage, not the complaint text: a complaint can
        // contain anything the customer typed, including personal detail, and
        // the audit trail is read and exported by people who need to know that
        // a card was opened, not what it says (`1.txt` §1646).
        detail: { jobNumber: jobNumber.rows[0].n, priority, stage: 'complaint_received' },
      });

      return this.findByIdInTransaction(client, ctx, inserted.rows[0].id);
    });
  }

  /**
   * Move a job card to another stage — `02.txt` §29: "The backend shall
   * validate every stage change."
   *
   * ── THE THREE CHECKS, IN THIS ORDER ────────────────────────────────────────
   *
   *   1. MAY THIS VIEWER TOUCH THIS CARD?  the scoped `SELECT ... FOR UPDATE`
   *      below. A technician not assigned to it gets 404, exactly as `findById`
   *      gives them, so this endpoint is not an existence oracle for the cards
   *      they cannot see.
   *   2. MAY THIS ROLE PRODUCE THIS STAGE?  `ROLE_TARGET_STAGES` (07 pt2 §50).
   *      Checked BEFORE the lifecycle, and NOT relaxed by the override — a
   *      technician with a signed override still may not pass their own work
   *      through quality control.
   *   3. MAY THE CARD GO THERE FROM WHERE IT IS?  `STAGE_TRANSITIONS`. This is
   *      the one an authorized override may relax, and doing so is recorded.
   *
   * `1.txt` §394 is the whole of this method: "A technician must not manually
   * bypass required approval, payment, parts or quality-control states without
   * an authorized, logged override."
   */
  async changeStage(
    ctx: TenantContext,
    id: string,
    input: { toStage: string; note?: string; overrideReason?: string },
  ): Promise<JobCard> {
    this.assertMayRead(ctx);

    const cardId = requireUuid(id, 'id');
    const toStage = requireOneOf(input.toStage, STAGES, 'toStage');
    const note = optionalText(input.note, 'note', 2000);
    const overrideReason = optionalText(input.overrideReason, 'overrideReason', 2000);

    // A role with no entry may not change a stage at all. `customer` is the real
    // case: `2.txt` §537 lets them REPORT a problem, which opens a card — it does
    // not let them drive the workshop's workflow afterwards.
    const roleStages = ROLE_TARGET_STAGES[ctx.activeRole];
    if (!roleStages) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not change a job card stage`);
    }

    return this.db.withTenant(ctx, async (client) => {
      // FOR UPDATE, not a plain read. Two people moving the same card at once —
      // a supervisor passing QC while a technician sends it back to the bench —
      // would otherwise both read `testing`, both find their transition legal,
      // and the second write would silently win with a history that records two
      // departures from the same stage. The row lock serialises them, so the
      // second caller re-reads the stage the first one set and is judged against
      // it. `OF j` because the joined tables are read for scoping only.
      const found = await client.query(
        `SELECT j.id, j.stage, j.job_number
           FROM repair.job_cards j
           JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
          WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
            AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
            AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
          FOR UPDATE OF j`,
        [
          cardId,
          ctx.tenantId,
          ctx.organizationId,
          ctx.activeRole === 'technician' ? ctx.userId : null,
          ctx.activeRole === 'customer' ? ctx.userId : null,
        ],
      );
      const card = found.rows[0] as { id: string; stage: Stage; job_number: string } | undefined;
      if (!card) throw new NotFoundException('job card not found');

      const fromStage = card.stage;

      // A no-op is rejected rather than quietly accepted. Accepting it would
      // append a history row saying the card moved when it did not, and reset
      // `stage_changed_at` — resetting the very clock the board uses to show how
      // long a job has been stuck, which is how a stalled card hides.
      if (fromStage === toStage) {
        throw new BadRequestException(`the job card is already at '${toStage}'`);
      }

      // ── check 2: the role's own stages ─────────────────────────────────────
      if (!roleStages.includes(toStage)) {
        throw new ForbiddenException(
          `role '${ctx.activeRole}' may not move a job card to '${toStage}'`,
        );
      }

      // ── check 3: the lifecycle ─────────────────────────────────────────────
      const permitted = await this.permittedTargets(client, ctx, cardId, fromStage);
      const isOverride = !permitted.includes(toStage);

      if (isOverride) {
        if (!CAN_OVERRIDE_STAGE.has(ctx.activeRole)) {
          // Names what IS allowed, because the caller has already passed the
          // role check — they may produce this stage, just not from here, and
          // the useful answer is where the card can actually go.
          throw new ForbiddenException(
            `a job card at '${fromStage}' may not move to '${toStage}'. ` +
              `Permitted: ${permitted.length ? permitted.join(', ') : 'none — this stage is final'}. ` +
              `Only a workshop owner or manager may override this.`,
          );
        }
        if (!overrideReason) {
          throw new BadRequestException(
            `moving a job card from '${fromStage}' to '${toStage}' skips the normal sequence ` +
              `and requires 'overrideReason'.`,
          );
        }
      }

      await client.query(
        `UPDATE repair.job_cards
            SET stage = $1,
                stage_changed_at = now(),
                -- 1.txt S322's lifecycle ends at completion, so the card stops
                -- being open work at that moment.
                --
                -- WARRANTY FOLLOW-UP KEEPS THE CLOSE (Supervisor pass on this
                -- slice; Codex did not flag it). The first version cleared
                -- closed_at for every stage except 'completed' — including
                -- 'warranty_follow_up', which is the ONLY stage reachable FROM
                -- completed. So the normal, expected next move silently wiped
                -- the completion date and put the job back among the open work
                -- for ever. A warranty call-back is follow-up ON a finished
                -- repair; it does not un-finish it.
                --
                -- COALESCE so a re-completed card keeps the date it was first
                -- closed rather than quietly restamping history. NULL for
                -- anything else, which is the genuine re-open (only reachable by
                -- an authorized override) — there the close SHOULD be withdrawn.
                closed_at = CASE
                              WHEN $1 = 'completed'          THEN COALESCE(closed_at, now())
                              WHEN $1 = 'warranty_follow_up' THEN closed_at
                              ELSE NULL
                            END,
                updated_at = now(),
                updated_by = $2
          WHERE id = $3 AND tenant_id = $4`,
        [toStage, ctx.userId, cardId, ctx.tenantId],
      );

      // The LOG half of §394's "authorized, logged override" — append-only, and
      // written in the SAME transaction as the move it records, so a stage can
      // never change without its history row.
      await client.query(
        `INSERT INTO repair.job_card_stage_events
           (tenant_id, organization_id, job_card_id, from_stage, to_stage,
            is_override, override_reason, note, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          cardId,
          fromStage,
          toStage,
          isOverride,
          isOverride ? overrideReason : null,
          note,
          ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: isOverride ? 'job_card.stage_overridden' : 'job_card.stage_changed',
        resourceType: 'job_card',
        resourceId: cardId,
        // The job number and the two stages — never the note, which is free text
        // a human typed and can contain anything, on the same reasoning as the
        // complaint at intake (`1.txt` §1646).
        detail: { jobNumber: card.job_number, fromStage, toStage, isOverride },
      });

      return this.findByIdInTransaction(client, ctx, cardId);
    });
  }

  /**
   * Where a card at `fromStage` may go next.
   *
   * Everything except `on_hold` is the static map. A HELD card is the exception
   * and the reason `job_card_stage_events` exists: `02.txt` §29 makes On Hold a
   * board column, but a held job has not progressed — it PAUSED, and it must
   * resume the work it was doing. The only honest answer to "where does it
   * resume" is the stage it held at, which the history records.
   *
   * Listing every stage as a valid exit from `on_hold` would be the simple
   * alternative and would hand back exactly the bypass §394 forbids: park a job
   * at On Hold, then resume it into `ready_for_collection`, skipping quality
   * control without ever tripping the override.
   */
  private async permittedTargets(
    client: { query: (t: string, v: unknown[]) => Promise<{ rows: unknown[] }> },
    ctx: TenantContext,
    cardId: string,
    fromStage: Stage,
  ): Promise<Stage[]> {
    if (fromStage !== 'on_hold') return permittedTargetsFrom(fromStage);

    // Read INSIDE the locked transaction rather than reusing the LATERAL join
    // on the read path: by the time a move is judged, the history must be the
    // one that exists now, not the one the board rendered from minutes ago.
    const previous = await client.query(
      `SELECT to_stage
         FROM repair.job_card_stage_events
        WHERE job_card_id = $1
          -- Same explicit scoping as the read path. Without it, the stage a
          -- held card resumes to is taken from whatever event row carries this
          -- card id, and the resume target is an AUTHORIZATION input — it
          -- decides which moves need an override.
          AND tenant_id = $2
          AND organization_id = $3
          AND to_stage <> 'on_hold'
        ORDER BY changed_at DESC
        LIMIT 1`,
      [cardId, ctx.tenantId, ctx.organizationId],
    );
    const resume = (previous.rows[0] as { to_stage: Stage } | undefined)?.to_stage;
    // No history at all should be impossible — migration 008 backfills an
    // opening event for every card. If it ever happens, the safe answer is
    // "nowhere without an override", which is what the shared function returns.
    return permittedTargetsFrom(fromStage, resume);
  }

  /** Re-read through the same join the list uses, so one shape serves both. */
  private async findByIdInTransaction(
    client: { query: (t: string, v: unknown[]) => Promise<{ rows: unknown[] }> },
    ctx: TenantContext,
    id: string,
  ): Promise<JobCard> {
    const res = await client.query(
      `${SELECT_JOB} WHERE j.id = $1 AND j.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (!res.rows[0]) throw new NotFoundException('job card not found');
    return this.toDomain(ctx, res.rows[0] as Parameters<JobCardService['toDomain']>[1]);
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_JOBS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read job cards`);
    }
  }

  private toDomain = (
    ctx: TenantContext,
    row: {
    id: string;
    job_number: string;
    customer_id: string;
    customer_name: string;
    vehicle_id: string;
    registration_number: string;
    make: string;
    model: string | null;
    model_year: number | null;
    complaint: string;
    stage: string;
    priority: string;
    assigned_technician_id: string | null;
    technician_name: string | null;
    expected_completion_on: Date | null;
    mileage_at_intake: number | null;
    opened_at: Date;
    stage_changed_at: Date;
    closed_at: Date | null;
    resume_stage: Stage | null;
  },
  ): JobCard => ({
    id: row.id,
    jobNumber: row.job_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    vehicleId: row.vehicle_id,
    registrationNumber: row.registration_number,
    vehicleDescription: [row.make, row.model, row.model_year].filter(Boolean).join(' '),
    complaint: row.complaint,
    stage: row.stage,
    priority: row.priority,
    assignedTechnicianId: row.assigned_technician_id,
    assignedTechnicianName: row.technician_name,
    // A DATE column: rendering it as an instant would attach a timezone the
    // value never had and can shift the day shown.
    expectedCompletionOn: row.expected_completion_on
      ? row.expected_completion_on.toISOString().slice(0, 10)
      : null,
    mileageAtIntake: row.mileage_at_intake,
    openedAt: row.opened_at.toISOString(),
    stageChangedAt: row.stage_changed_at.toISOString(),
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    allowedStages: stageOptionsFor(ctx.activeRole, row.stage as Stage, row.resume_stage),
  });
}
