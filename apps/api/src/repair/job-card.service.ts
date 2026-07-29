import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { optionalDate, optionalInt, optionalOneOf, optionalUuid, requireText, requireUuid } from '../core/validate';

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
  closedAt: string | null;
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
         j.expected_completion_on, j.mileage_at_intake, j.opened_at, j.closed_at
    FROM repair.job_cards j
    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
    JOIN core.vehicles  v ON v.id = j.vehicle_id  AND v.tenant_id = j.tenant_id
    JOIN core.vehicle_makes mk ON mk.id = v.make_id
    LEFT JOIN core.vehicle_models md ON md.id = v.model_id
    -- LEFT: an unassigned card is the normal state at intake, and an inner join
    -- would hide exactly the cards a manager is looking for.
    LEFT JOIN identity.users t ON t.id = j.assigned_technician_id`;

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
      return res.rows.map(this.toDomain);
    });
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
      return this.toDomain(row);
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
    return this.toDomain(res.rows[0] as Parameters<JobCardService['toDomain']>[0]);
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_JOBS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read job cards`);
    }
  }

  private toDomain = (row: {
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
    closed_at: Date | null;
  }): JobCard => ({
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
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
  });
}
