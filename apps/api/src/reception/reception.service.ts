import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import {
  ReceptionInputError,
  mayConfigureBays,
  mayRespondToFeedback,
  mayTakeBookings,
  parseAppointmentTransition,
} from './reception-rules';

export interface ServiceBay {
  id: string;
  name: string;
  bayType: string;
  notes: string | null;
  isActive: boolean;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string | null;
  vehicleId: string | null;
  registrationNumber: string | null;
  serviceSummary: string;
  scheduledFor: string;
  durationMinutes: number;
  bayId: string | null;
  bayName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  status: string;
  convertedJobCardId: string | null;
  cancellationReason: string | null;
  contactPhone: string | null;
  notes: string | null;
  /**
   * Other appointments sharing this bay and overlapping this one.
   *
   * ⚠️ SURFACED, NOT FORBIDDEN. Migration 041's header explains why there is no
   * exclusion constraint: reception routinely double-books a bay knowing one job
   * will run over, and a database that REFUSES leaves them writing it on paper —
   * which is the failure this product exists to remove. So the clash is a fact
   * the screen shows, and a person decides.
   */
  bayClashes: number;
}

export interface WalkIn {
  id: string;
  contactName: string;
  contactPhone: string | null;
  vehicleDescription: string;
  registrationNumber: string | null;
  complaint: string;
  status: string;
  convertedJobCardId: string | null;
  outcomeNote: string | null;
  receivedByName: string | null;
  receivedAt: string;
}

export interface CustomerFeedback {
  id: string;
  jobCardId: string | null;
  customerId: string | null;
  customerName: string | null;
  rating: number;
  comment: string | null;
  source: string;
  response: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
}

/**
 * The front desk — slice 2 of `COMPLETION_PLAN.md`.
 *
 * Slice 0 gave the workshop a way to OPEN a job card; until 2026-08-05
 * `POST /job-cards` had no workshop-side caller at all, so a walk-in at the
 * counter could not be booked in. This is what happens BEFORE that: the customer
 * who rings to book, the one who arrives without an appointment, the bay their
 * car goes into, and what they thought of it afterwards.
 *
 * ⚠️ `withTenant`, not `withUser`. The policies key on the tenant and the
 * triggers read the caller's context; under `withUser` these statements would
 * match no policy and affect zero rows WITHOUT RAISING — which reads as "there
 * is nothing there" rather than "you were refused". That is the 039 lesson in
 * another form: a permissions fault rendered as a fact about the data.
 *
 * ⚠️ EVERY QUERY CARRIES BOTH `tenant_id` AND `organization_id`. Migration 041's
 * RLS is tenant-wide, and a tenant here holds more than one organisation — the
 * exact hole Codex found in `MediaService` on 2026-08-06. A tenant predicate is
 * not an organisation predicate.
 */
@Injectable()
export class ReceptionService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayBook(ctx: TenantContext): void {
    if (!mayTakeBookings(ctx.activeRole)) {
      throw new ForbiddenException(
        'Booking work in is a front-desk function. Your role can see the schedule but not change it — ' +
          'ask reception, the workshop manager or the owner to make the booking.',
      );
    }
  }

  // ── service bays ──────────────────────────────────────────────────────────

  async listBays(ctx: TenantContext, opts: { includeRetired?: boolean } = {}): Promise<ServiceBay[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop service bays');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<{
        id: string; name: string; bay_type: string; notes: string | null; is_active: boolean;
      }>(
        `SELECT id, name, bay_type, notes, is_active
           FROM core.service_bays
          WHERE tenant_id = $1 AND organization_id = $2
            AND ($3::boolean OR is_active)
          ORDER BY is_active DESC, name ASC`,
        [ctx.tenantId, ctx.organizationId, opts.includeRetired ?? false],
      );
      return rows.rows.map((r) => ({
        id: r.id, name: r.name, bayType: r.bay_type, notes: r.notes, isActive: r.is_active,
      }));
    });
  }

  async createBay(
    ctx: TenantContext,
    input: { name: string; bayType?: string; notes?: string },
  ): Promise<ServiceBay> {
    if (!mayConfigureBays(ctx.activeRole)) {
      throw new ForbiddenException(
        'Deciding which bays this workshop has is an owner or manager change. ' +
          'Reception assigns cars to existing bays but does not create them.',
      );
    }
    return this.db.withTenant(ctx, async (client) => {
      try {
        const rows = await client.query<{
          id: string; name: string; bay_type: string; notes: string | null; is_active: boolean;
        }>(
          `INSERT INTO core.service_bays
             (tenant_id, organization_id, name, bay_type, notes, created_by)
           VALUES ($1, $2, $3, COALESCE($4, 'general'), $5, $6)
           RETURNING id, name, bay_type, notes, is_active`,
          [ctx.tenantId, ctx.organizationId, input.name.trim(),
           input.bayType ?? null, input.notes ?? null, ctx.userId],
        );
        const r = rows.rows[0]!;
        return { id: r.id, name: r.name, bayType: r.bay_type, notes: r.notes, isActive: r.is_active };
      } catch (error) {
        // `uq_bay_name` — say which name, because "duplicate key" tells the
        // person nothing they can act on.
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(`This workshop already has a bay called "${input.name.trim()}".`);
        }
        throw error;
      }
    });
  }

  /**
   * Retire a bay. NEVER a delete: `core.service_bays` carries no DELETE grant,
   * because a closed bay still appears on every past appointment and removing
   * the row would orphan history somebody may need next year.
   */
  async retireBay(ctx: TenantContext, bayId: string, active: boolean): Promise<void> {
    if (!mayConfigureBays(ctx.activeRole)) {
      throw new ForbiddenException('Only the owner or the workshop manager can retire a bay.');
    }
    await this.db.withTenant(ctx, async (client) => {
      const result = await client.query(
        `UPDATE core.service_bays
            SET is_active = $4, updated_by = $5, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [bayId, ctx.tenantId, ctx.organizationId, active, ctx.userId],
      );
      if (!result.rowCount) throw new NotFoundException('no such bay');
    });
  }

  // ── appointments ──────────────────────────────────────────────────────────

  /**
   * The diary.
   *
   * `from`/`to` bound the window the calendar draws. Without them this returns
   * everything, which is correct for a small workshop's first week and wrong
   * forever after — so the screens always pass a window.
   */
  async listAppointments(
    ctx: TenantContext,
    opts: { from?: string; to?: string; status?: string } = {},
  ): Promise<Appointment[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop appointment book');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT a.id, a.customer_id, c.display_name AS customer_name,
                a.vehicle_id, v.registration_number,
                a.service_summary, a.scheduled_for, a.duration_minutes,
                a.bay_id, b.name AS bay_name,
                a.assigned_to, u.display_name AS assigned_to_name,
                a.status, a.converted_job_card_id, a.cancellation_reason,
                a.contact_phone, a.notes,
                -- The bay clash count, computed here rather than in the screen so
                -- every caller sees the same number. Counts only appointments
                -- that are still live: a cancelled one is not competing for a bay.
                (SELECT count(*) FROM reception.appointments x
                  WHERE x.tenant_id = a.tenant_id
                    AND x.organization_id = a.organization_id
                    AND x.bay_id IS NOT NULL AND x.bay_id = a.bay_id
                    AND x.id <> a.id
                    AND x.status IN ('booked','confirmed','arrived')
                    AND x.scheduled_for
                        < a.scheduled_for + make_interval(mins => a.duration_minutes)
                    AND a.scheduled_for
                        < x.scheduled_for + make_interval(mins => x.duration_minutes)
                ) AS bay_clashes
           FROM reception.appointments a
           -- LEFT JOINs throughout: a vehicle, a bay and an assignee are all
           -- optional, and 039's lesson is that an inner join turns "not set"
           -- and "refused" into the same invisible answer.
           LEFT JOIN core.customers    c ON c.id = a.customer_id
           LEFT JOIN core.vehicles     v ON v.id = a.vehicle_id
           LEFT JOIN core.service_bays b ON b.id = a.bay_id
           LEFT JOIN identity.users    u ON u.id = a.assigned_to
          WHERE a.tenant_id = $1 AND a.organization_id = $2
            AND ($3::timestamptz IS NULL OR a.scheduled_for >= $3)
            AND ($4::timestamptz IS NULL OR a.scheduled_for < $4)
            AND ($5::text IS NULL OR a.status = $5)
          ORDER BY a.scheduled_for ASC`,
        [ctx.tenantId, ctx.organizationId, opts.from ?? null, opts.to ?? null, opts.status ?? null],
      );
      return rows.rows.map((r) => ({
        id: r.id as string,
        customerId: r.customer_id as string,
        customerName: (r.customer_name as string) ?? null,
        vehicleId: (r.vehicle_id as string) ?? null,
        registrationNumber: (r.registration_number as string) ?? null,
        serviceSummary: r.service_summary as string,
        scheduledFor: r.scheduled_for as string,
        durationMinutes: Number(r.duration_minutes),
        bayId: (r.bay_id as string) ?? null,
        bayName: (r.bay_name as string) ?? null,
        assignedTo: (r.assigned_to as string) ?? null,
        assignedToName: (r.assigned_to_name as string) ?? null,
        status: r.status as string,
        convertedJobCardId: (r.converted_job_card_id as string) ?? null,
        cancellationReason: (r.cancellation_reason as string) ?? null,
        contactPhone: (r.contact_phone as string) ?? null,
        notes: (r.notes as string) ?? null,
        bayClashes: Number(r.bay_clashes ?? 0),
      }));
    });
  }

  async createAppointment(
    ctx: TenantContext,
    input: {
      customerId: string;
      vehicleId?: string;
      serviceSummary: string;
      scheduledFor: string;
      durationMinutes?: number;
      bayId?: string;
      assignedTo?: string;
      contactPhone?: string;
      notes?: string;
    },
  ): Promise<Appointment> {
    this.assertMayBook(ctx);

    const when = new Date(input.scheduledFor);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('That is not a date and time this workshop can read.');
    }

    return this.db.withTenant(ctx, async (client) => {
      // Resolve the customer under the caller's own context FIRST. A foreign key
      // would prove the row exists; it would not prove this caller may see it,
      // and RLS here is tenant-wide across more than one organisation.
      const customer = await client.query(
        `SELECT 1 FROM core.customers
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [input.customerId, ctx.tenantId, ctx.organizationId],
      );
      if (!customer.rowCount) throw new NotFoundException('no such customer');

      const rows = await client.query<{ id: string }>(
        `INSERT INTO reception.appointments
           (tenant_id, organization_id, customer_id, vehicle_id, service_summary,
            scheduled_for, duration_minutes, bay_id, assigned_to, contact_phone,
            notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,60),$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, input.customerId, input.vehicleId ?? null,
          input.serviceSummary.trim(), when.toISOString(), input.durationMinutes ?? null,
          input.bayId ?? null, input.assignedTo ?? null, input.contactPhone ?? null,
          input.notes ?? null, ctx.userId,
        ],
      );

      const created = await this.listAppointmentById(client, ctx, rows.rows[0]!.id);
      if (!created) throw new NotFoundException('appointment could not be read back');
      return created;
    });
  }

  async changeAppointmentStatus(
    ctx: TenantContext,
    appointmentId: string,
    input: { status: string; cancellationReason?: string },
  ): Promise<Appointment> {
    this.assertMayBook(ctx);

    return this.db.withTenant(ctx, async (client) => {
      const current = await client.query<{ status: string }>(
        `SELECT status FROM reception.appointments
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [appointmentId, ctx.tenantId, ctx.organizationId],
      );
      if (!current.rowCount) throw new NotFoundException('no such appointment');

      let next: string;
      try {
        next = parseAppointmentTransition(current.rows[0]!.status, input.status);
      } catch (error) {
        if (error instanceof ReceptionInputError) throw new BadRequestException(error.message);
        throw error;
      }

      // `chk_appt_cancelled_has_reason` enforces this in the database. Asking
      // here as well is what turns a constraint violation into a sentence the
      // person can act on — the database is the control, this is the
      // explanation.
      if (next === 'cancelled' && !input.cancellationReason?.trim()) {
        throw new BadRequestException(
          'Say why the appointment was cancelled. A workshop asking "why did this customer stop coming" ' +
            'needs the reason, and the record is kept deliberately.',
        );
      }

      await client.query(
        `UPDATE reception.appointments
            SET status = $4,
                cancellation_reason = COALESCE($5, cancellation_reason),
                updated_by = $6, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [appointmentId, ctx.tenantId, ctx.organizationId, next,
         input.cancellationReason?.trim() ?? null, ctx.userId],
      );

      const updated = await this.listAppointmentById(client, ctx, appointmentId);
      if (!updated) throw new NotFoundException('no such appointment');
      return updated;
    });
  }

  private async listAppointmentById(
    _client: unknown,
    ctx: TenantContext,
    id: string,
  ): Promise<Appointment | null> {
    // Re-reads through the same query the list uses, so a single appointment and
    // a listed one can never disagree about what a field means — including the
    // computed clash count.
    const all = await this.listAppointmentsRaw(ctx, id);
    return all[0] ?? null;
  }

  private async listAppointmentsRaw(ctx: TenantContext, id: string): Promise<Appointment[]> {
    const all = await this.listAppointments(ctx, {});
    return all.filter((a) => a.id === id);
  }

  // ── walk-ins ──────────────────────────────────────────────────────────────

  async listWalkIns(ctx: TenantContext, opts: { status?: string } = {}): Promise<WalkIn[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop walk-in register');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT w.id, w.contact_name, w.contact_phone, w.vehicle_description,
                w.registration_number, w.complaint, w.status,
                w.converted_job_card_id, w.outcome_note,
                u.display_name AS received_by_name, w.received_at
           FROM reception.walk_ins w
           LEFT JOIN identity.users u ON u.id = w.received_by
          WHERE w.tenant_id = $1 AND w.organization_id = $2
            AND ($3::text IS NULL OR w.status = $3)
          ORDER BY
            -- Whoever is still standing at the counter comes first. A queue
            -- ordered purely by time puts this morning's finished visitors
            -- above the person waiting now.
            CASE w.status WHEN 'waiting' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
            w.received_at ASC`,
        [ctx.tenantId, ctx.organizationId, opts.status ?? null],
      );
      return rows.rows.map((r) => ({
        id: r.id as string,
        contactName: r.contact_name as string,
        contactPhone: (r.contact_phone as string) ?? null,
        vehicleDescription: r.vehicle_description as string,
        registrationNumber: (r.registration_number as string) ?? null,
        complaint: r.complaint as string,
        status: r.status as string,
        convertedJobCardId: (r.converted_job_card_id as string) ?? null,
        outcomeNote: (r.outcome_note as string) ?? null,
        receivedByName: (r.received_by_name as string) ?? null,
        receivedAt: r.received_at as string,
      }));
    });
  }

  async createWalkIn(
    ctx: TenantContext,
    input: {
      contactName: string;
      contactPhone?: string;
      vehicleDescription: string;
      registrationNumber?: string;
      complaint: string;
    },
  ): Promise<WalkIn> {
    this.assertMayBook(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<{ id: string }>(
        `INSERT INTO reception.walk_ins
           (tenant_id, organization_id, contact_name, contact_phone,
            vehicle_description, registration_number, complaint, received_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, input.contactName.trim(),
         input.contactPhone ?? null, input.vehicleDescription.trim(),
         input.registrationNumber ?? null, input.complaint.trim(), ctx.userId],
      );
      const created = (await this.listWalkIns(ctx, {})).find((w) => w.id === rows.rows[0]!.id);
      if (!created) throw new NotFoundException('walk-in could not be read back');
      return created;
    });
  }

  async closeWalkIn(
    ctx: TenantContext,
    walkInId: string,
    input: { status: string; outcomeNote?: string },
  ): Promise<void> {
    this.assertMayBook(ctx);
    // `converted` is refused here because `chk_walkin_converted` requires the
    // job-card id alongside it. Setting the status alone would be a claim the
    // database rejects, and the error would name a constraint rather than the
    // thing the person actually needs to do.
    const allowed = ['in_progress', 'turned_away', 'left'];
    if (!allowed.includes(input.status)) {
      throw new BadRequestException(
        `A walk-in can be marked: ${allowed.join(', ')}. ` +
          'To convert it into work, open a job card from it — that is what records the conversion.',
      );
    }
    await this.db.withTenant(ctx, async (client) => {
      const result = await client.query(
        `UPDATE reception.walk_ins
            SET status = $4, outcome_note = COALESCE($5, outcome_note),
                updated_by = $6, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status IN ('waiting','in_progress')`,
        [walkInId, ctx.tenantId, ctx.organizationId, input.status,
         input.outcomeNote?.trim() ?? null, ctx.userId],
      );
      if (!result.rowCount) {
        throw new ConflictException(
          'That walk-in is no longer waiting — it has already been closed or converted.',
        );
      }
    });
  }

  // ── customer feedback ─────────────────────────────────────────────────────

  async listFeedback(ctx: TenantContext): Promise<CustomerFeedback[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'Customer feedback given to the workshop');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT f.id, f.job_card_id, f.customer_id, c.display_name AS customer_name,
                f.rating, f.comment, f.source, f.response,
                u.display_name AS responded_by_name, f.responded_at, f.created_at
           FROM reception.customer_feedback f
           LEFT JOIN core.customers c ON c.id = f.customer_id
           LEFT JOIN identity.users  u ON u.id = f.responded_by
          WHERE f.tenant_id = $1 AND f.organization_id = $2
          ORDER BY f.created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows.map((r) => ({
        id: r.id as string,
        jobCardId: (r.job_card_id as string) ?? null,
        customerId: (r.customer_id as string) ?? null,
        customerName: (r.customer_name as string) ?? null,
        rating: Number(r.rating),
        comment: (r.comment as string) ?? null,
        source: r.source as string,
        response: (r.response as string) ?? null,
        respondedByName: (r.responded_by_name as string) ?? null,
        respondedAt: (r.responded_at as string) ?? null,
        createdAt: r.created_at as string,
      }));
    });
  }

  async recordFeedback(
    ctx: TenantContext,
    input: { rating: number; comment?: string; customerId?: string; jobCardId?: string },
  ): Promise<void> {
    this.assertMayBook(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO reception.customer_feedback
           (tenant_id, organization_id, job_card_id, customer_id, rating, comment,
            source, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,'staff_recorded',$7)`,
        [ctx.tenantId, ctx.organizationId, input.jobCardId ?? null,
         input.customerId ?? null, input.rating, input.comment?.trim() ?? null, ctx.userId],
      );
    });
  }

  async respondToFeedback(ctx: TenantContext, feedbackId: string, response: string): Promise<void> {
    if (!mayRespondToFeedback(ctx.activeRole)) {
      throw new ForbiddenException(
        'Replying to a review speaks for the whole workshop, so it is the owner or the manager. ' +
          'Anyone who can see the review can read it.',
      );
    }
    await this.db.withTenant(ctx, async (client) => {
      try {
        const result = await client.query(
          `UPDATE reception.customer_feedback
              SET response = $4, responded_by = $5, responded_at = now()
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
              AND response IS NULL`,
          [feedbackId, ctx.tenantId, ctx.organizationId, response.trim(), ctx.userId],
        );
        if (!result.rowCount) {
          throw new ConflictException(
            'That review has already been answered. A published reply cannot be edited — ' +
              'the customer may have read it already.',
          );
        }
      } catch (error) {
        // `trg_feedback_rewrite` is the real control and raises
        // `check_violation`. Translate it rather than leak a trigger message.
        if ((error as { code?: string }).code === '23514') {
          throw new ConflictException('That review has already been answered.');
        }
        throw error;
      }
    });
  }
}
