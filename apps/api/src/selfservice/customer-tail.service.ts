import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { resolveCustomerId, staffEcho } from './customer-scope';

/**
 * THE CUSTOMER TAIL — slice 13, `NEXT_SESSION_SCHEDULE.md` B1.
 *
 * The last eight customer routes. Seven are READS over data this product
 * already holds; the eighth (recovery) is a write, and it reuses
 * `support.cases` rather than inventing a second inbox — see migration 055.
 *
 * ── 🔴 EVERY READ CARRIES THE SESSION-DERIVED CUSTOMER PREDICATE ───────────
 *
 * Same rule as slice 12, same module: `resolveCustomerId` derives the customer
 * from the signed-in user and REFUSES an explicit id from a customer. These
 * live under `/my/*` for the same reason — a route that cannot be reached by
 * loosening a filter on the workshop's own endpoint.
 *
 * ⚠️ `reception.appointments` IS STAFF-GATED (A5). A customer's own
 * appointments are therefore a DIFFERENT QUERY here, not a relaxation there.
 * That distinction is the whole lesson of 2026-08-07.
 */

export interface MyAppointmentRow {
  id: string;
  scheduledFor: string;
  status: string;
  /** The workshop's own words for what the visit is for (`service_summary`). */
  purpose: string | null;
  durationMinutes: number | null;
  cancellationReason: string | null;
  registrationNumber: string | null;
  isPast: boolean;
}

export interface InstalledPartRow {
  id: string;
  description: string;
  partNumber: string | null;
  quantity: string;
  unit: string | null;
  jobNumber: string | null;
  registrationNumber: string | null;
  fittedOn: string | null;
}

export interface RecommendationRow {
  kind: string;
  title: string;
  detail: string;
  registrationNumber: string | null;
  href: string;
}

export interface HelpArticleRow {
  id: string;
  title: string;
  body: string;
  category: string;
}

export interface MyTowingRow {
  id: string;
  reference: string;
  description: string;
  status: string;
  location: string | null;
  contactPhone: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

@Injectable()
export class CustomerTailService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ── appointments ──────────────────────────────────────────────────────────

  /**
   * The customer's OWN appointments.
   *
   * ⚠️ NOT `ReceptionService.listAppointments`, which returns the workshop's
   * whole book — other customers' names, vehicles and times — and is now
   * refused to a customer outright. Same table, one customer wide.
   */
  async listMyAppointments(ctx: TenantContext, customerId?: string): Promise<MyAppointmentRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        // ⚠️ `service_summary`, NOT `purpose` — reception.appointments has no
        // `purpose` column. Caught by reading information_schema before the
        // query ever ran; it would have 500'd this screen on first load.
        `SELECT a.id, a.scheduled_for, a.status, a.service_summary,
                a.duration_minutes, a.cancellation_reason, v.registration_number,
                (a.scheduled_for < now()) AS is_past
           FROM reception.appointments a
           LEFT JOIN core.vehicles v ON v.id = a.vehicle_id
                 AND v.tenant_id = a.tenant_id AND v.organization_id = a.organization_id
          WHERE a.tenant_id = $1 AND a.organization_id = $2 AND a.customer_id = $3
          ORDER BY a.scheduled_for DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        scheduledFor: (x.scheduled_for as Date).toISOString(),
        status: x.status as string,
        purpose: (x.service_summary as string | null) ?? null,
        durationMinutes: x.duration_minutes === null ? null : Number(x.duration_minutes),
        cancellationReason: (x.cancellation_reason as string | null) ?? null,
        registrationNumber: (x.registration_number as string | null) ?? null,
        isPast: x.is_past as boolean,
      }));
    });
  }

  // ── installed parts ───────────────────────────────────────────────────────

  /**
   * Every part fitted to this customer's vehicles.
   *
   * The chain is `execution_parts_used -> repair_executions -> job_cards`, and
   * the job card is where the customer lives — the same authoritative link
   * migration 053 established for invoices.
   */
  async listMyInstalledParts(ctx: TenantContext, customerId?: string): Promise<InstalledPartRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT p.id, p.description, p.part_number, p.quantity, p.unit, p.position,
                j.job_number, v.registration_number, e.completed_at, e.started_at
           FROM repair.execution_parts_used p
           JOIN repair.repair_executions e ON e.id = p.execution_id
                AND e.tenant_id = p.tenant_id AND e.organization_id = p.organization_id
           JOIN repair.job_cards j ON j.id = e.job_card_id
                AND j.tenant_id = e.tenant_id AND j.organization_id = e.organization_id
           LEFT JOIN core.vehicles v ON v.id = j.vehicle_id
                AND v.tenant_id = j.tenant_id AND v.organization_id = j.organization_id
          WHERE p.tenant_id = $1 AND p.organization_id = $2 AND j.customer_id = $3
          ORDER BY COALESCE(e.completed_at, e.started_at) DESC NULLS LAST, p.position`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        description: x.description as string,
        partNumber: (x.part_number as string | null) ?? null,
        quantity: String(x.quantity),
        unit: (x.unit as string | null) ?? null,
        jobNumber: (x.job_number as string | null) ?? null,
        registrationNumber: (x.registration_number as string | null) ?? null,
        fittedOn: x.completed_at
          ? (x.completed_at as Date).toISOString()
          : x.started_at
            ? (x.started_at as Date).toISOString()
            : null,
      }));
    });
  }

  // ── recommendations ───────────────────────────────────────────────────────

  /**
   * What this customer's vehicles actually need next.
   *
   * 🔴 NOT A RECOMMENDER. There is no model here and no invented "customers
   * like you also bought". Every row is a FACT already in the database — a
   * maintenance item that has come due, or a document about to expire — and a
   * category with nothing in it is OMITTED rather than padded.
   *
   * `05.txt` §2 forbids disconnected mock pages. A grid of plausible parts with
   * no basis would be exactly that, dressed up as intelligence.
   */
  async listMyRecommendations(
    ctx: TenantContext,
    customerId?: string,
  ): Promise<RecommendationRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const out: RecommendationRow[] = [];

      // Servicing that has come due, computed against the vehicle's OWN
      // mileage — never a stored flag, which goes stale the moment a mileage
      // is recorded.
      const due = await client.query(
        `SELECT s.item, v.registration_number
           FROM core.maintenance_schedules s
           JOIN core.vehicles v ON v.id = s.vehicle_id
                AND v.tenant_id = s.tenant_id AND v.organization_id = s.organization_id
          WHERE s.tenant_id = $1 AND s.organization_id = $2 AND s.customer_id = $3
            AND ((s.due_on IS NOT NULL AND s.due_on <= current_date)
                 OR (s.due_at_km IS NOT NULL AND v.current_mileage_km IS NOT NULL
                     AND v.current_mileage_km >= s.due_at_km))
          ORDER BY s.due_on NULLS LAST`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      for (const x of due.rows) {
        out.push({
          kind: 'servicing',
          title: x.item as string,
          detail: 'Due now on your maintenance schedule.',
          registrationNumber: (x.registration_number as string | null) ?? null,
          href: '/my-vehicles/maintenance-schedule',
        });
      }

      // Documents running out within 30 days — the same look-ahead the
      // customer's notifications use, so the two cannot disagree.
      const docs = await client.query(
        `SELECT d.title, d.expires_on, v.registration_number
           FROM core.vehicle_documents d
           JOIN core.vehicles v ON v.id = d.vehicle_id
                AND v.tenant_id = d.tenant_id AND v.organization_id = d.organization_id
          WHERE d.tenant_id = $1 AND d.organization_id = $2 AND d.customer_id = $3
            AND d.expires_on IS NOT NULL AND d.expires_on <= current_date + 30
          ORDER BY d.expires_on`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      for (const x of docs.rows) {
        out.push({
          kind: 'document',
          title: x.title as string,
          detail: `Expires ${String(x.expires_on).slice(0, 10)}.`,
          registrationNumber: (x.registration_number as string | null) ?? null,
          href: '/my-vehicles/documents',
        });
      }

      return out;
    });
  }

  // ── knowledge, customer-facing ────────────────────────────────────────────

  /**
   * The published articles a customer may read.
   *
   * ⚠️ `KnowledgeService.listArticles` IS STAFF-GATED and returns the
   * workshop's own library, including articles marked published but written for
   * technicians. `is_shared` is the flag meaning "safe to show a customer", and
   * it is the whole difference between this method and that one.
   */
  async listMyKnowledge(ctx: TenantContext): Promise<HelpArticleRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, title, body, category
           FROM knowledge.articles
          WHERE tenant_id = $1 AND organization_id = $2
            AND is_published AND is_shared
          ORDER BY created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        title: x.title as string,
        body: x.body as string,
        category: x.category as string,
      }));
    });
  }

  // ── recovery / towing ─────────────────────────────────────────────────────

  /**
   * Request recovery for a vehicle that cannot be driven.
   *
   * 🔴 A SUPPORT CASE, NOT A NEW RESOURCE. See migration 055: a second table
   * would be a second inbox and a second answer to "what has this customer
   * asked us for?". The database enforces that a towing case carries a location
   * and a number to ring, because a recovery request nobody can drive to is
   * useless in a way a missing billing note is not.
   */
  async requestTowing(
    ctx: TenantContext,
    input: { vehicleId?: string; location: string; contactPhone: string; description: string },
  ): Promise<MyTowingRow[]> {
    const echo = await this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx);

      if (input.vehicleId) {
        const owned = await client.query(
          `SELECT 1 FROM core.vehicles
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND customer_id = $4
            LIMIT 1`,
          [input.vehicleId, ctx.tenantId, ctx.organizationId, cid],
        );
        if (!owned.rowCount) {
          throw new NotFoundException(
            'That vehicle is not one of yours. You can request recovery for any vehicle in your garage.',
          );
        }
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO support.cases
           (tenant_id, organization_id, customer_id, reference, subject,
            description, category, priority, location, contact_phone,
            created_by, updated_by)
         VALUES ($1,$2,$3, support.next_case_reference($2), $4, $5, 'towing',
                 'urgent', $6, $7, $8, $8)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, cid,
          'Recovery requested', input.description,
          input.location.trim(), input.contactPhone.trim(), ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'selfservice.towing.requested',
        resourceType: 'support_case',
        resourceId: created.rows[0]!.id,
        detail: { location: input.location.trim() },
      });
      // Staff may name the customer again on the read-back; a customer must not.
      return staffEcho(ctx, cid);
    });
    return this.listMyTowing(ctx, echo);
  }

  async listMyTowing(ctx: TenantContext, customerId?: string): Promise<MyTowingRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT id, reference, description, status, location, contact_phone,
                created_at, resolved_at, resolution
           FROM support.cases
          WHERE tenant_id = $1 AND organization_id = $2 AND customer_id = $3
            AND category = 'towing'
          ORDER BY created_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        reference: x.reference as string,
        description: x.description as string,
        status: x.status as string,
        location: (x.location as string | null) ?? null,
        contactPhone: (x.contact_phone as string | null) ?? null,
        createdAt: (x.created_at as Date).toISOString(),
        resolvedAt: x.resolved_at ? (x.resolved_at as Date).toISOString() : null,
        resolution: (x.resolution as string | null) ?? null,
      }));
    });
  }
}
