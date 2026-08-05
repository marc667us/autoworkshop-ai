import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Customer self-service — slice 9 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 RLS CANNOT EXPRESS THE RULE THIS SERVICE ENFORCES ───────────────────
 *
 * Migration 047's policies are organisation-scoped, which keeps workshop A out
 * of workshop B's rows. It CANNOT keep customer X out of customer Y's rows,
 * because both customers belong to the same organisation — there is no
 * `app.customer_id` setting and inventing one would let a client name it.
 *
 * So the customer predicate lives HERE, on every read and every write, derived
 * from the signed-in user's own customer record. `myCustomerId` is the single
 * place that derivation happens, and it never accepts a customer id from the
 * caller. That is the same shape `CommsService` uses for thread participation
 * and for the same reason: a policy that cannot state the rule must not be
 * trusted to enforce it.
 *
 * ── ⚠️ STAFF SEE THESE SCREENS TOO ─────────────────────────────────────────
 *
 * Reception needs a customer's documents to check an insurance expiry at the
 * desk. So a workshop role reads by EXPLICIT customer id, and a customer reads
 * only their own — two different questions, and conflating them is how a
 * customer ends up seeing the whole customer book.
 */

const WORKSHOP_ROLES = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor', 'reception_staff',
  'technician', 'storekeeper', 'cashier', 'quality_controller', 'platform_administrator',
] as const;

export interface VehicleDocumentRow {
  id: string;
  vehicleId: string;
  registrationNumber: string | null;
  documentKind: string;
  title: string;
  reference: string | null;
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  hasFile: boolean;
}

export interface MaintenanceRow {
  id: string;
  vehicleId: string;
  registrationNumber: string | null;
  item: string;
  dueAtKm: number | null;
  dueOn: string | null;
  lastDoneKm: number | null;
  lastDoneOn: string | null;
  currentMileageKm: number | null;
  isDue: boolean;
  notes: string | null;
}

export interface DriverRow {
  id: string;
  fullName: string;
  phone: string | null;
  relationship: string | null;
  registrationNumber: string | null;
  mayDropOff: boolean;
  mayCollect: boolean;
  mayApproveWork: boolean;
  isActive: boolean;
}

export interface CaseRow {
  id: string;
  reference: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  resolution: string | null;
  jobNumber: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

@Injectable()
export class SelfServiceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The caller's own customer record.
   *
   * 🔴 DERIVED FROM THE SESSION, NEVER ACCEPTED FROM THE CALLER. A customer id
   * in a request body is a customer id an attacker can change; `core.customers`
   * carries `user_id`, which is the server's own link between the signed-in
   * person and their record.
   *
   * Returns null for a workshop user, who is not a customer of their own
   * workshop — that is not an error, it is a different question, and the
   * callers branch on it.
   */
  private async myCustomerId(
    client: import('pg').PoolClient,
    ctx: TenantContext,
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM core.customers
        WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3
        LIMIT 1`,
      [ctx.tenantId, ctx.organizationId, ctx.userId],
    );
    return r.rows[0]?.id ?? null;
  }

  /**
   * Which customer's records this request may see.
   *
   * ⚠️ A WORKSHOP ROLE MAY NAME ONE; A CUSTOMER MAY NOT. Passing a customer id
   * as a customer is refused outright rather than ignored — silently
   * substituting their own id would mask an authorization probe (`1.txt` §9,
   * the same reasoning `TenantGuard` uses for organisations).
   */
  private async resolveCustomer(
    client: import('pg').PoolClient,
    ctx: TenantContext,
    requested?: string,
  ): Promise<string> {
    const isStaff = WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number]);

    if (requested) {
      if (!isStaff) {
        throw new ForbiddenException(
          'You can only see your own records. Leave the customer out of the request and you will get yours.',
        );
      }
      const exists = await client.query(
        `SELECT 1 FROM core.customers
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
        [requested, ctx.tenantId, ctx.organizationId],
      );
      if (!exists.rowCount) throw new NotFoundException('That customer is not in this workshop.');
      return requested;
    }

    const mine = await this.myCustomerId(client, ctx);
    if (!mine) {
      throw new NotFoundException(
        isStaff
          ? 'You are staff here, not a customer, so there are no records of your own to show. Open a customer from the customer list to see theirs.'
          : 'This workshop has no customer record for your account yet. Reception can create one when you next bring a vehicle in.',
      );
    }
    return mine;
  }

  // ── documents ─────────────────────────────────────────────────────────────

  async listDocuments(ctx: TenantContext, customerId?: string): Promise<VehicleDocumentRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await this.resolveCustomer(client, ctx, customerId);
      const r = await client.query(
        `SELECT d.id, d.vehicle_id, v.registration_number, d.document_kind, d.title,
                d.reference, d.expires_on,
                (d.asset_id IS NOT NULL) AS has_file,
                CASE WHEN d.expires_on IS NULL THEN NULL
                     ELSE (d.expires_on - current_date) END AS days_until_expiry
           FROM core.vehicle_documents d
           JOIN core.vehicles v ON v.id = d.vehicle_id
          WHERE d.tenant_id = $1 AND d.organization_id = $2 AND d.customer_id = $3
          ORDER BY d.expires_on NULLS LAST, d.title`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        vehicleId: x.vehicle_id as string,
        registrationNumber: (x.registration_number as string | null) ?? null,
        documentKind: x.document_kind as string,
        title: x.title as string,
        reference: (x.reference as string | null) ?? null,
        expiresOn: x.expires_on ? String(x.expires_on).slice(0, 10) : null,
        daysUntilExpiry: x.days_until_expiry === null ? null : Number(x.days_until_expiry),
        hasFile: x.has_file as boolean,
      }));
    });
  }

  async addDocument(
    ctx: TenantContext,
    input: {
      vehicleId: string;
      documentKind: string;
      title: string;
      reference?: string;
      expiresOn?: string;
    },
  ): Promise<VehicleDocumentRow[]> {
    const staffCustomerId = await this.db.withTenant(ctx, async (client) => {
      const customerId = await this.resolveCustomer(client, ctx);

      // The vehicle must be one of THIS customer's. The trigger in 047 refuses
      // a mismatch too; this exists so the refusal is a sentence rather than a
      // constraint name.
      const owned = await client.query(
        `SELECT 1 FROM core.vehicles
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND customer_id = $4
          LIMIT 1`,
        [input.vehicleId, ctx.tenantId, ctx.organizationId, customerId],
      );
      if (!owned.rowCount) {
        throw new NotFoundException(
          'That vehicle is not one of yours. You can add a document against any vehicle in your garage.',
        );
      }

      await client.query(
        `INSERT INTO core.vehicle_documents
           (tenant_id, organization_id, vehicle_id, customer_id, document_kind, title,
            reference, expires_on, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$9)`,
        [
          ctx.tenantId, ctx.organizationId, input.vehicleId, customerId,
          input.documentKind, input.title.trim(), input.reference ?? null,
          input.expiresOn ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'selfservice.document.added',
        resourceType: 'vehicle_document',
        detail: { documentKind: input.documentKind },
      });
      // Only a STAFF caller may name a customer on the read-back. A customer
      // must pass undefined so the list re-derives from their session — which
      // is the whole rule `resolveCustomer` enforces.
      return WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number])
        ? customerId
        : undefined;
    });
    // 🔴 NO `cid`. Passing the resolved id back in made `resolveCustomer`
    // refuse it — a CUSTOMER may not name a customer — so every write in this
    // service COMMITTED and then threw 403, and staff got NotFound instead.
    // Slice 9's forms could never have worked for either audience. Found by the
    // Supervisor; typecheck, lint and build were all green.
    return this.listDocuments(ctx, staffCustomerId);
  }

  // ── maintenance schedule ──────────────────────────────────────────────────

  async listMaintenance(ctx: TenantContext, customerId?: string): Promise<MaintenanceRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await this.resolveCustomer(client, ctx, customerId);
      const r = await client.query(
        `SELECT s.id, s.vehicle_id, v.registration_number, v.current_mileage_km,
                s.item, s.due_at_km, s.due_on, s.last_done_km, s.last_done_on, s.notes,
                -- 🔴 DUE IS COMPUTED FROM THE VEHICLE'S OWN MILEAGE, not stored.
                -- A stored flag goes stale the moment a mileage is recorded and
                -- would tell a customer a service is not due when it is.
                (
                  (s.due_on IS NOT NULL AND s.due_on <= current_date)
                  OR (s.due_at_km IS NOT NULL AND v.current_mileage_km IS NOT NULL
                      AND v.current_mileage_km >= s.due_at_km)
                ) AS is_due
           FROM core.maintenance_schedules s
           JOIN core.vehicles v ON v.id = s.vehicle_id
          WHERE s.tenant_id = $1 AND s.organization_id = $2 AND s.customer_id = $3
          ORDER BY is_due DESC, s.due_on NULLS LAST, s.item`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        vehicleId: x.vehicle_id as string,
        registrationNumber: (x.registration_number as string | null) ?? null,
        item: x.item as string,
        dueAtKm: x.due_at_km === null ? null : Number(x.due_at_km),
        dueOn: x.due_on ? String(x.due_on).slice(0, 10) : null,
        lastDoneKm: x.last_done_km === null ? null : Number(x.last_done_km),
        lastDoneOn: x.last_done_on ? String(x.last_done_on).slice(0, 10) : null,
        currentMileageKm: x.current_mileage_km === null ? null : Number(x.current_mileage_km),
        isDue: x.is_due as boolean,
        notes: (x.notes as string | null) ?? null,
      }));
    });
  }

  async addMaintenance(
    ctx: TenantContext,
    input: { vehicleId: string; item: string; dueAtKm?: number; dueOn?: string; notes?: string },
  ): Promise<MaintenanceRow[]> {
    const staffCustomerId = await this.db.withTenant(ctx, async (client) => {
      const customerId = await this.resolveCustomer(client, ctx);
      const owned = await client.query(
        `SELECT 1 FROM core.vehicles
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND customer_id = $4 LIMIT 1`,
        [input.vehicleId, ctx.tenantId, ctx.organizationId, customerId],
      );
      if (!owned.rowCount) throw new NotFoundException('That vehicle is not one of yours.');

      await client.query(
        `INSERT INTO core.maintenance_schedules
           (tenant_id, organization_id, vehicle_id, customer_id, item, due_at_km, due_on,
            notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$9)`,
        [
          ctx.tenantId, ctx.organizationId, input.vehicleId, customerId,
          input.item.trim(), input.dueAtKm ?? null, input.dueOn ?? null,
          input.notes ?? null, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'selfservice.maintenance.added',
        resourceType: 'maintenance_schedule',
        detail: { item: input.item.trim() },
      });
      // Only a STAFF caller may name a customer on the read-back. A customer
      // must pass undefined so the list re-derives from their session — which
      // is the whole rule `resolveCustomer` enforces.
      return WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number])
        ? customerId
        : undefined;
    });
    return this.listMaintenance(ctx, staffCustomerId);
  }

  // ── authorized drivers ────────────────────────────────────────────────────

  async listDrivers(ctx: TenantContext, customerId?: string): Promise<DriverRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await this.resolveCustomer(client, ctx, customerId);
      const r = await client.query(
        `SELECT d.id, d.full_name, d.phone, d.relationship, v.registration_number,
                d.may_drop_off, d.may_collect, d.may_approve_work, d.is_active
           FROM core.authorized_drivers d
           LEFT JOIN core.vehicles v ON v.id = d.vehicle_id
          WHERE d.tenant_id = $1 AND d.organization_id = $2 AND d.customer_id = $3
          ORDER BY d.is_active DESC, d.full_name`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        fullName: x.full_name as string,
        phone: (x.phone as string | null) ?? null,
        relationship: (x.relationship as string | null) ?? null,
        registrationNumber: (x.registration_number as string | null) ?? null,
        mayDropOff: x.may_drop_off as boolean,
        mayCollect: x.may_collect as boolean,
        mayApproveWork: x.may_approve_work as boolean,
        isActive: x.is_active as boolean,
      }));
    });
  }

  async addDriver(
    ctx: TenantContext,
    input: {
      fullName: string; phone?: string; relationship?: string; vehicleId?: string;
      mayDropOff: boolean; mayCollect: boolean; mayApproveWork: boolean;
    },
  ): Promise<DriverRow[]> {
    const staffCustomerId = await this.db.withTenant(ctx, async (client) => {
      const customerId = await this.resolveCustomer(client, ctx);
      if (input.vehicleId) {
        const owned = await client.query(
          `SELECT 1 FROM core.vehicles
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND customer_id = $4 LIMIT 1`,
          [input.vehicleId, ctx.tenantId, ctx.organizationId, customerId],
        );
        if (!owned.rowCount) throw new NotFoundException('That vehicle is not one of yours.');
      }
      await client.query(
        `INSERT INTO core.authorized_drivers
           (tenant_id, organization_id, customer_id, vehicle_id, full_name, phone,
            relationship, may_drop_off, may_collect, may_approve_work, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          ctx.tenantId, ctx.organizationId, customerId, input.vehicleId ?? null,
          input.fullName.trim(), input.phone ?? null, input.relationship ?? null,
          input.mayDropOff, input.mayCollect, input.mayApproveWork, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'selfservice.driver.authorized',
        resourceType: 'authorized_driver',
        // Who and what they may do — this is a permission grant and belongs in
        // the audit trail as one.
        detail: {
          fullName: input.fullName.trim(),
          mayApproveWork: input.mayApproveWork,
        },
      });
      // Only a STAFF caller may name a customer on the read-back. A customer
      // must pass undefined so the list re-derives from their session — which
      // is the whole rule `resolveCustomer` enforces.
      return WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number])
        ? customerId
        : undefined;
    });
    return this.listDrivers(ctx, staffCustomerId);
  }

  /** Withdrawn, never deleted: a collection under an old authorisation must stay explicable. */
  async withdrawDriver(ctx: TenantContext, id: string): Promise<DriverRow[]> {
    const staffCustomerId = await this.db.withTenant(ctx, async (client) => {
      const customerId = await this.resolveCustomer(client, ctx);
      const r = await client.query(
        `UPDATE core.authorized_drivers
            SET is_active = false, withdrawn_at = now(), updated_by = $4, updated_at = now()
          WHERE id = $1 AND organization_id = $2 AND customer_id = $3 AND is_active`,
        [id, ctx.organizationId, customerId, ctx.userId],
      );
      if (r.rowCount === 0) {
        throw new NotFoundException('That authorisation is not one of yours, or is already withdrawn.');
      }
      await this.audit.write(client, ctx, {
        action: 'selfservice.driver.withdrawn',
        resourceType: 'authorized_driver',
        resourceId: id,
      });
      // Only a STAFF caller may name a customer on the read-back. A customer
      // must pass undefined so the list re-derives from their session — which
      // is the whole rule `resolveCustomer` enforces.
      return WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number])
        ? customerId
        : undefined;
    });
    return this.listDrivers(ctx, staffCustomerId);
  }

  // ── support cases ─────────────────────────────────────────────────────────

  async listCases(ctx: TenantContext, customerId?: string): Promise<CaseRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await this.resolveCustomer(client, ctx, customerId);
      const r = await client.query(
        `SELECT c.id, c.reference, c.subject, c.description, c.category, c.priority,
                c.status, c.resolution, c.created_at, c.resolved_at, jc.job_number
           FROM support.cases c
           LEFT JOIN repair.job_cards jc ON jc.id = c.job_card_id
          WHERE c.tenant_id = $1 AND c.organization_id = $2 AND c.customer_id = $3
          ORDER BY c.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        reference: x.reference as string,
        subject: x.subject as string,
        description: x.description as string,
        category: x.category as string,
        priority: x.priority as string,
        status: x.status as string,
        resolution: (x.resolution as string | null) ?? null,
        jobNumber: (x.job_number as string | null) ?? null,
        createdAt: (x.created_at as Date).toISOString(),
        resolvedAt: x.resolved_at ? (x.resolved_at as Date).toISOString() : null,
      }));
    });
  }

  async raiseCase(
    ctx: TenantContext,
    input: { subject: string; description: string; category: string; jobCardId?: string },
  ): Promise<CaseRow[]> {
    const staffCustomerId = await this.db.withTenant(ctx, async (client) => {
      const customerId = await this.resolveCustomer(client, ctx);

      // 🔴 FINDING 3 (Codex): THE JOB CARD MUST BE THIS CUSTOMER'S.
      //
      // `addDocument` and `addMaintenance` both check that the vehicle they
      // name belongs to the caller. This did not check the job card at all —
      // and organisation-scoped RLS cannot tell two customers apart, so a
      // customer holding another's job-card uuid could raise a case against it.
      // `listCases` joins and returns `job_number`, so that leaked the other
      // customer's job number and misdirected the workshop's triage.
      //
      // Migration 050 adds a trigger enforcing the same rule, because the next
      // caller will forget. This exists so the refusal is a sentence.
      if (input.jobCardId) {
        const owned = await client.query(
          `SELECT 1 FROM repair.job_cards
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND customer_id = $4
            LIMIT 1`,
          [input.jobCardId, ctx.tenantId, ctx.organizationId, customerId],
        );
        if (!owned.rowCount) {
          throw new NotFoundException(
            'That repair is not one of yours. You can raise a case about any repair in your history, or leave it unlinked.',
          );
        }
      }

      // 🔴 `support.next_case_reference` — THE ATOMIC ALLOCATOR, not a count.
      //
      // The first draft of this built the reference from `count(*) + 1` with a
      // comment claiming that being in the database made it safe. It does not:
      // under READ COMMITTED two concurrent cases count the same rows and one
      // is rejected by the UNIQUE constraint — a complaint vanishing behind a
      // 500 exactly when two people complain at once. Migration 006 already
      // solved this for job numbers; 047 copies that function rather than
      // inventing a second, worse one.
      const created = await client.query<{ id: string }>(
        `INSERT INTO support.cases
           (tenant_id, organization_id, customer_id, job_card_id, reference, subject,
            description, category, created_by, updated_by)
         VALUES ($1,$2,$3,$4, support.next_case_reference($2), $5,$6,$7,$8,$8)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, customerId, input.jobCardId ?? null,
          input.subject.trim(), input.description, input.category, ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'selfservice.case.raised',
        resourceType: 'support_case',
        resourceId: created.rows[0]!.id,
        detail: { category: input.category },
      });
      // Only a STAFF caller may name a customer on the read-back. A customer
      // must pass undefined so the list re-derives from their session — which
      // is the whole rule `resolveCustomer` enforces.
      return WORKSHOP_ROLES.includes(ctx.activeRole as (typeof WORKSHOP_ROLES)[number])
        ? customerId
        : undefined;
    });
    return this.listCases(ctx, staffCustomerId);
  }

  /**
   * The customer's own inbox - what is waiting on THEM, or on the workshop.
   *
   * WARNING: EVERY ROW IS A REAL COUNT OVER A REAL TABLE, and a category with a
   * count of zero is OMITTED. An empty list therefore means nothing is waiting,
   * which is a true statement - as against a list of plausible notification
   * types with invented numbers, which is the "disconnected mock page"
   * `05.txt` section 2 forbids.
   *
   * WARNING: EXPIRY LOOKS 30 DAYS AHEAD, it does not report "expired". A
   * customer wants to know before the insurance runs out; telling them
   * afterwards is a receipt, not a notification.
   */
  async notifications(ctx: TenantContext): Promise<
    { kind: string; title: string; detail: string; href: string; count: number }[]
  > {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await this.resolveCustomer(client, ctx);
      const out: { kind: string; title: string; detail: string; href: string; count: number }[] = [];

      const unread = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM comms.messages m
           JOIN comms.participants p ON p.thread_id = m.thread_id AND p.user_id = $3
          WHERE m.tenant_id = $1 AND m.organization_id = $2
            AND m.sender_user_id <> $3
            AND NOT EXISTS (SELECT 1 FROM comms.read_receipts rr
                             WHERE rr.message_id = m.id AND rr.user_id = $3)`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      if (Number(unread.rows[0]?.n ?? '0') > 0) {
        out.push({
          kind: 'messages',
          title: 'Unread messages from the workshop',
          detail: 'Replies you have not read yet.',
          href: '/communication/messages',
          count: Number(unread.rows[0]!.n),
        });
      }

      const expiring = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM core.vehicle_documents
          WHERE tenant_id = $1 AND organization_id = $2 AND customer_id = $3
            AND expires_on IS NOT NULL
            AND expires_on <= current_date + 30`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      if (Number(expiring.rows[0]?.n ?? '0') > 0) {
        out.push({
          kind: 'documents',
          title: 'Documents expiring soon',
          detail: 'Insurance, roadworthiness or registration running out within 30 days.',
          href: '/my-vehicles/documents',
          count: Number(expiring.rows[0]!.n),
        });
      }

      // Due is COMPUTED against the vehicle's own mileage, exactly as the
      // schedule screen computes it, so the two cannot disagree.
      const due = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM core.maintenance_schedules s
           JOIN core.vehicles v ON v.id = s.vehicle_id
          WHERE s.tenant_id = $1 AND s.organization_id = $2 AND s.customer_id = $3
            AND ((s.due_on IS NOT NULL AND s.due_on <= current_date)
                 OR (s.due_at_km IS NOT NULL AND v.current_mileage_km IS NOT NULL
                     AND v.current_mileage_km >= s.due_at_km))`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      if (Number(due.rows[0]?.n ?? '0') > 0) {
        out.push({
          kind: 'maintenance',
          title: 'Servicing due',
          detail: 'Items on your maintenance schedule that have come due.',
          href: '/my-vehicles/maintenance-schedule',
          count: Number(due.rows[0]!.n),
        });
      }

      const cases = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM support.cases
          WHERE tenant_id = $1 AND organization_id = $2 AND customer_id = $3
            AND status IN ('open', 'in_progress')`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      if (Number(cases.rows[0]?.n ?? '0') > 0) {
        out.push({
          kind: 'cases',
          title: 'Open support cases',
          detail: 'Things you have raised that are not resolved yet.',
          href: '/support/support-cases',
          count: Number(cases.rows[0]!.n),
        });
      }

      return out;
    });
  }

  /**
   * The customer's OWN notification preferences.
   *
   * WARNING: NO NEW TABLE. `core.notification_preferences` from migration 045
   * already supports a row naming a user, which overrides the organisation
   * default. Slice 6 wrote the organisation row (`user_id IS NULL`); this
   * writes the personal one. A second preferences table would have created two
   * answers to the same question and no rule for which one wins.
   */
  async listMyPreferences(
    ctx: TenantContext,
  ): Promise<{ eventKey: string; channel: string; isEnabled: boolean; isPersonal: boolean }[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT event_key, channel, is_enabled, (user_id IS NOT NULL) AS is_personal
           FROM core.notification_preferences
          WHERE tenant_id = $1 AND organization_id = $2
            AND (user_id IS NULL OR user_id = $3)
          ORDER BY event_key, channel, is_personal DESC`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      return r.rows.map((x) => ({
        eventKey: x.event_key as string,
        channel: x.channel as string,
        isEnabled: x.is_enabled as boolean,
        isPersonal: x.is_personal as boolean,
      }));
    });
  }

  async setMyPreference(
    ctx: TenantContext,
    input: { eventKey: string; channel: string; isEnabled: boolean },
  ): Promise<{ eventKey: string; channel: string; isEnabled: boolean; isPersonal: boolean }[]> {
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO core.notification_preferences
           (tenant_id, organization_id, user_id, event_key, channel, is_enabled,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$3,$3)
         ON CONFLICT ON CONSTRAINT uq_notification_pref DO UPDATE
            SET is_enabled = EXCLUDED.is_enabled,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()`,
        [ctx.tenantId, ctx.organizationId, ctx.userId, input.eventKey, input.channel, input.isEnabled],
      );
      await this.audit.write(client, ctx, {
        action: 'selfservice.notification_pref.changed',
        resourceType: 'notification_preference',
        resourceId: input.eventKey + ':' + input.channel,
        detail: { isEnabled: input.isEnabled },
      });
    });
    return this.listMyPreferences(ctx);
  }
}
