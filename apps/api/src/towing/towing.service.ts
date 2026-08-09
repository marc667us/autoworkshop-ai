import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertTowingStaff } from './towing-roles';

/**
 * TOWING AND ROADSIDE SUPPORT — the domain service behind `02.txt` §52.
 *
 * Every method opens with `assertTowingStaff`. That is the app layer;
 * migration 074's `towing_*_select/insert/update` policies are the database
 * layer. `CLAUDE.md` §7: app code first, RLS last, BOTH required — and note
 * the two are not the same width. RLS refuses only `customer`; this refuses
 * every role that is not on the towing desk, because RLS cannot see the
 * navigation tree.
 */

/* ── Vocabularies. Each one mirrors a CHECK constraint in migration 074. ──
 *
 * ⚠️ EXPORTED AND VALIDATED AT THE CONTROLLER, not forwarded raw. An
 * unrecognised status reaching a `$1::text` filter returns an EMPTY list, which
 * on screen is indistinguishable from "there is nothing here" — the Supervisor
 * found exactly that in `GET /leads` on 2026-08-09. */
export const REQUEST_STATUSES = ['new', 'triaged', 'dispatched', 'cancelled'] as const;
export const REQUEST_PRIORITIES = ['low', 'normal', 'high', 'emergency'] as const;
export const RECOVERY_STATUSES = [
  'dispatched',
  'en_route',
  'on_scene',
  'towing',
  'completed',
  'cancelled',
] as const;
export const DRIVER_STATUSES = ['available', 'on_job', 'off_duty', 'inactive'] as const;
export const VEHICLE_STATUSES = ['available', 'on_job', 'maintenance', 'retired'] as const;
export const VEHICLE_TYPES = ['flatbed', 'wheel_lift', 'heavy_wrecker', 'service_van'] as const;
export const INCIDENT_KINDS = [
  'vehicle_damage',
  'injury',
  'equipment_failure',
  'delay',
  'dispute',
  'other',
] as const;
export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

/** The statuses that mean "a truck is out". Used by two screens and the board. */
export const ACTIVE_RECOVERY_STATUSES: readonly RecoveryStatus[] = [
  'dispatched',
  'en_route',
  'on_scene',
  'towing',
];

function iso(v: unknown): string {
  return (v as Date)?.toISOString?.() ?? String(v);
}
function isoOrNull(v: unknown): string | null {
  return v ? iso(v) : null;
}
/** node-pg returns NUMERIC as a string, deliberately — never coerce with `+`. */
function money(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

@Injectable()
export class TowingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /* ── Dashboard ─────────────────────────────────────────────────────────
   *
   * One round trip, not six. Six `count(*)` calls over the same session would
   * each pay the RLS predicate again and could disagree with one another if a
   * dispatch landed between them — a dashboard that says "3 new requests" beside
   * "4 active recoveries" from two different instants is how a board is
   * mistrusted. */
  async dashboard(ctx: TenantContext) {
    assertTowingStaff(ctx, 'The towing dashboard');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT
           (SELECT count(*) FROM towing.requests   WHERE status = 'new')            AS new_requests,
           (SELECT count(*) FROM towing.requests   WHERE status = 'triaged')        AS triaged_requests,
           (SELECT count(*) FROM towing.recoveries WHERE status = ANY($1))          AS active_recoveries,
           (SELECT count(*) FROM towing.recoveries WHERE status = 'completed')      AS completed_recoveries,
           (SELECT count(*) FROM towing.drivers    WHERE status = 'available')      AS drivers_available,
           (SELECT count(*) FROM towing.recovery_vehicles WHERE status = 'available') AS vehicles_available,
           (SELECT count(*) FROM towing.incidents  WHERE status <> 'resolved')      AS open_incidents,
           (SELECT count(*) FROM towing.invoices   WHERE status = 'draft')          AS draft_invoices`,
        [ACTIVE_RECOVERY_STATUSES],
      );
      const r = res.rows[0] as Record<string, string>;
      // Counts arrive as strings from node-pg (bigint). Numbers on the way out.
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as Record<
        string,
        number
      >;
    });
  }

  /* ── Requests ──────────────────────────────────────────────────────────── */

  async listRequests(ctx: TenantContext, opts: { status?: RequestStatus } = {}) {
    assertTowingStaff(ctx, 'Roadside requests');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT r.id, r.reference, r.contact_name, r.contact_phone,
                r.vehicle_description, r.pickup_location, r.dropoff_location,
                r.fault_summary, r.priority, r.status, r.cancel_reason,
                r.received_at, r.customer_id, r.vehicle_id,
                rec.id AS recovery_id
           FROM towing.requests r
           LEFT JOIN towing.recoveries rec ON rec.request_id = r.id
          WHERE ($1::text IS NULL OR r.status = $1)
          ORDER BY
            -- Emergencies first, then oldest-waiting. A queue ordered only by
            -- time sends a truck to a flat tyre while someone sits on a hard
            -- shoulder.
            CASE r.priority WHEN 'emergency' THEN 0 WHEN 'high' THEN 1
                            WHEN 'normal' THEN 2 ELSE 3 END,
            r.received_at ASC
          LIMIT 200`,
        [opts.status ?? null],
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          reference: r.reference as string,
          contactName: r.contact_name as string,
          contactPhone: r.contact_phone as string,
          vehicleDescription: r.vehicle_description as string,
          pickupLocation: r.pickup_location as string,
          dropoffLocation: (r.dropoff_location as string) ?? null,
          faultSummary: r.fault_summary as string,
          priority: r.priority as string,
          status: r.status as RequestStatus,
          cancelReason: (r.cancel_reason as string) ?? null,
          receivedAt: iso(r.received_at),
          customerId: (r.customer_id as string) ?? null,
          vehicleId: (r.vehicle_id as string) ?? null,
          recoveryId: (r.recovery_id as string) ?? null,
        };
      });
    });
  }

  async createRequest(
    ctx: TenantContext,
    body: {
      contactName: string;
      contactPhone: string;
      vehicleDescription: string;
      pickupLocation: string;
      faultSummary: string;
      dropoffLocation?: string;
      priority?: string;
      customerId?: string;
      vehicleId?: string;
    },
  ) {
    assertTowingStaff(ctx, 'Logging a roadside request');
    return this.db.withTenant(ctx, async (client) => {
      // The reference is allocated INSIDE the transaction from the current
      // maximum, so two operators taking calls at once cannot mint the same
      // one — `uq_request_reference` would reject the second, and this makes
      // that collision essentially unreachable rather than merely handled.
      const seq = await client.query(
        `SELECT coalesce(max(substring(reference from 'TR-([0-9]+)$')::int), 0) + 1 AS next
           FROM towing.requests`,
      );
      const reference = `TR-${String((seq.rows[0] as { next: number }).next).padStart(4, '0')}`;

      const res = await client.query(
        `INSERT INTO towing.requests
           (tenant_id, organization_id, reference, contact_name, contact_phone,
            vehicle_description, pickup_location, dropoff_location, fault_summary,
            priority, customer_id, vehicle_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,'normal'),$11,$12,$13)
         RETURNING id, reference`,
        [
          ctx.tenantId,
          ctx.organizationId,
          reference,
          body.contactName,
          body.contactPhone,
          body.vehicleDescription,
          body.pickupLocation,
          body.dropoffLocation ?? null,
          body.faultSummary,
          body.priority ?? null,
          body.customerId ?? null,
          body.vehicleId ?? null,
          ctx.userId,
        ],
      );
      const row = res.rows[0] as { id: string; reference: string };
      await this.audit.write(client, ctx, {
        action: 'towing.request.created',
        resourceType: 'towing_request',
        resourceId: row.id,
        detail: { reference: row.reference, priority: body.priority ?? 'normal' },
      });
      return row;
    });
  }

  /* ── Dispatch ──────────────────────────────────────────────────────────
   *
   * 🔴 THE ONE PLACE THREE TABLES HAVE TO AGREE. Creating the recovery,
   * marking the request dispatched and taking the driver and truck out of the
   * available pool are FOUR writes that must all happen or none: a crash
   * between them leaves a truck that is on a job the board does not show, or a
   * request that says dispatched with no recovery behind it.
   *
   * `withTenant` runs the callback inside one transaction, so this is atomic
   * without a second mechanism. Recorded because the notification drain shipped
   * the opposite assumption — `pool.query` is autocommit and its "claim" did
   * not survive the statement that made it. */
  async dispatch(
    ctx: TenantContext,
    body: { requestId: string; driverId: string; vehicleId: string },
  ) {
    assertTowingStaff(ctx, 'Dispatching a recovery');
    return this.db.withTenant(ctx, async (client) => {
      const req = await client.query(
        `SELECT id, status, reference FROM towing.requests WHERE id = $1 FOR UPDATE`,
        [body.requestId],
      );
      const request = req.rows[0] as { id: string; status: string; reference: string } | undefined;
      // Not found and not-ours answer identically: telling a caller an id exists
      // but belongs to someone else is itself a disclosure.
      if (!request) throw new NotFoundException('That roadside request was not found.');
      if (request.status === 'cancelled') {
        throw new BadRequestException(
          `Request ${request.reference} was cancelled. Log a new request if the caller still needs recovery.`,
        );
      }
      if (request.status === 'dispatched') {
        throw new BadRequestException(
          `Request ${request.reference} already has a recovery. Open it from the dispatch board to change the driver or truck.`,
        );
      }

      const rec = await client.query(
        `INSERT INTO towing.recoveries
           (tenant_id, organization_id, request_id, driver_id, vehicle_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, body.requestId, body.driverId, body.vehicleId, ctx.userId],
      );
      const recoveryId = (rec.rows[0] as { id: string }).id;

      await client.query(
        `UPDATE towing.requests SET status = 'dispatched', updated_at = now() WHERE id = $1`,
        [body.requestId],
      );
      await client.query(
        `UPDATE towing.drivers SET status = 'on_job', updated_at = now() WHERE id = $1`,
        [body.driverId],
      );
      await client.query(
        `UPDATE towing.recovery_vehicles SET status = 'on_job', updated_at = now() WHERE id = $1`,
        [body.vehicleId],
      );

      await this.audit.write(client, ctx, {
        action: 'towing.recovery.dispatched',
        resourceType: 'towing_recovery',
        resourceId: recoveryId,
        detail: { reference: request.reference, driverId: body.driverId, vehicleId: body.vehicleId },
      });
      return { id: recoveryId };
    });
  }

  /* ── Recoveries ────────────────────────────────────────────────────────── */

  async listRecoveries(ctx: TenantContext, scope: 'active' | 'completed') {
    assertTowingStaff(ctx, 'Recoveries');
    const statuses =
      scope === 'active' ? ACTIVE_RECOVERY_STATUSES : (['completed', 'cancelled'] as const);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT rec.id, rec.status, rec.dispatched_at, rec.completed_at,
                rec.distance_km, rec.cancel_reason, rec.notes,
                r.reference, r.contact_name, r.pickup_location, r.dropoff_location,
                r.vehicle_description, r.priority,
                d.full_name AS driver_name, d.phone AS driver_phone,
                v.registration AS vehicle_registration, v.label AS vehicle_label,
                inv.id AS invoice_id, inv.status AS invoice_status
           FROM towing.recoveries rec
           JOIN towing.requests r          ON r.id = rec.request_id
           JOIN towing.drivers d           ON d.id = rec.driver_id
           JOIN towing.recovery_vehicles v ON v.id = rec.vehicle_id
           LEFT JOIN towing.invoices inv   ON inv.recovery_id = rec.id
          WHERE rec.status = ANY($1)
          ORDER BY rec.dispatched_at DESC
          LIMIT 200`,
        [statuses],
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          status: r.status as RecoveryStatus,
          dispatchedAt: iso(r.dispatched_at),
          completedAt: isoOrNull(r.completed_at),
          distanceKm: money(r.distance_km),
          cancelReason: (r.cancel_reason as string) ?? null,
          notes: (r.notes as string) ?? null,
          reference: r.reference as string,
          contactName: r.contact_name as string,
          pickupLocation: r.pickup_location as string,
          dropoffLocation: (r.dropoff_location as string) ?? null,
          vehicleDescription: r.vehicle_description as string,
          priority: r.priority as string,
          driverName: r.driver_name as string,
          driverPhone: r.driver_phone as string,
          vehicleRegistration: r.vehicle_registration as string,
          vehicleLabel: r.vehicle_label as string,
          invoiceId: (r.invoice_id as string) ?? null,
          invoiceStatus: (r.invoice_status as string) ?? null,
        };
      });
    });
  }

  /**
   * Move a recovery along, and release the driver and truck when it settles.
   *
   * ⚠️ `completed_at` and `cancel_reason` are DERIVED here, not accepted from
   * the caller — migration 074's `ck_recovery_completed` and
   * `ck_recovery_cancelled` require them, and a client that could set them
   * independently could record a completion at a time it did not happen.
   */
  async setRecoveryStatus(
    ctx: TenantContext,
    id: string,
    status: RecoveryStatus,
    opts: { distanceKm?: number; cancelReason?: string } = {},
  ) {
    assertTowingStaff(ctx, 'Updating a recovery');
    if (status === 'cancelled' && !opts.cancelReason?.trim()) {
      throw new BadRequestException(
        'Say why the recovery was cancelled — the next person cannot act on "cancelled" alone.',
      );
    }
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE towing.recoveries
            SET status = $2,
                completed_at  = CASE WHEN $2 = 'completed' THEN now() ELSE NULL END,
                cancel_reason = CASE WHEN $2 = 'cancelled' THEN $3 ELSE NULL END,
                distance_km   = coalesce($4, distance_km),
                updated_at    = now()
          WHERE id = $1
          RETURNING id, driver_id, vehicle_id, status`,
        [id, status, opts.cancelReason ?? null, opts.distanceKm ?? null],
      );
      const row = res.rows[0] as
        | { id: string; driver_id: string; vehicle_id: string; status: string }
        | undefined;
      if (!row) throw new NotFoundException('That recovery was not found.');

      // Settled means the truck and driver come back to the pool. Without this
      // the available counts drift down for ever and the dispatch board slowly
      // empties — the fleet would look fully committed while sitting idle.
      if (status === 'completed' || status === 'cancelled') {
        await client.query(
          `UPDATE towing.drivers SET status = 'available', updated_at = now()
            WHERE id = $1 AND status = 'on_job'`,
          [row.driver_id],
        );
        await client.query(
          `UPDATE towing.recovery_vehicles SET status = 'available', updated_at = now()
            WHERE id = $1 AND status = 'on_job'`,
          [row.vehicle_id],
        );
      }

      await this.audit.write(client, ctx, {
        action: 'towing.recovery.status_changed',
        resourceType: 'towing_recovery',
        resourceId: id,
        detail: { to: status },
      });
      return { id: row.id, status: row.status };
    });
  }

  /* ── Drivers and trucks ────────────────────────────────────────────────── */

  async listDrivers(ctx: TenantContext) {
    assertTowingStaff(ctx, 'The driver roster');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT d.id, d.full_name, d.phone, d.licence_number, d.licence_expires,
                d.status, d.user_id,
                (SELECT count(*) FROM towing.recoveries rec
                  WHERE rec.driver_id = d.id AND rec.status = 'completed') AS completed_count
           FROM towing.drivers d
          ORDER BY d.full_name ASC
          LIMIT 200`,
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          fullName: r.full_name as string,
          phone: r.phone as string,
          licenceNumber: (r.licence_number as string) ?? null,
          licenceExpires: r.licence_expires ? String(r.licence_expires).slice(0, 10) : null,
          status: r.status as string,
          userId: (r.user_id as string) ?? null,
          completedCount: Number(r.completed_count),
        };
      });
    });
  }

  async createDriver(
    ctx: TenantContext,
    body: { fullName: string; phone: string; licenceNumber?: string; licenceExpires?: string },
  ) {
    assertTowingStaff(ctx, 'Adding a driver');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO towing.drivers
           (tenant_id, organization_id, full_name, phone, licence_number, licence_expires, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          body.fullName,
          body.phone,
          body.licenceNumber ?? null,
          body.licenceExpires ?? null,
          ctx.userId,
        ],
      );
      const id = (res.rows[0] as { id: string }).id;
      await this.audit.write(client, ctx, {
        action: 'towing.driver.created',
        resourceType: 'towing_driver',
        resourceId: id,
        detail: { fullName: body.fullName },
      });
      return { id };
    });
  }

  async listVehicles(ctx: TenantContext) {
    assertTowingStaff(ctx, 'Recovery vehicles');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, registration, label, vehicle_type, capacity_kg, status, notes
           FROM towing.recovery_vehicles
          ORDER BY label ASC
          LIMIT 200`,
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          registration: r.registration as string,
          label: r.label as string,
          vehicleType: r.vehicle_type as string,
          capacityKg: r.capacity_kg === null ? null : Number(r.capacity_kg),
          status: r.status as string,
          notes: (r.notes as string) ?? null,
        };
      });
    });
  }

  async createVehicle(
    ctx: TenantContext,
    body: { registration: string; label: string; vehicleType?: string; capacityKg?: number },
  ) {
    assertTowingStaff(ctx, 'Adding a recovery vehicle');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO towing.recovery_vehicles
           (tenant_id, organization_id, registration, label, vehicle_type, capacity_kg, created_by)
         VALUES ($1,$2,$3,$4,coalesce($5,'flatbed'),$6,$7) RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          body.registration,
          body.label,
          body.vehicleType ?? null,
          body.capacityKg ?? null,
          ctx.userId,
        ],
      );
      const id = (res.rows[0] as { id: string }).id;
      await this.audit.write(client, ctx, {
        action: 'towing.vehicle.created',
        resourceType: 'towing_vehicle',
        resourceId: id,
        detail: { registration: body.registration },
      });
      return { id };
    });
  }

  /* ── Incidents ─────────────────────────────────────────────────────────── */

  async listIncidents(ctx: TenantContext) {
    assertTowingStaff(ctx, 'The incident log');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT i.id, i.kind, i.severity, i.summary, i.status, i.resolution,
                i.reported_at, r.reference, d.full_name AS driver_name
           FROM towing.incidents i
           JOIN towing.recoveries rec ON rec.id = i.recovery_id
           JOIN towing.requests r     ON r.id = rec.request_id
           JOIN towing.drivers d      ON d.id = rec.driver_id
          ORDER BY
            -- Open first, then most severe, then newest. An incident log sorted
            -- by time alone buries an open injury under yesterday's delays.
            CASE i.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END,
            CASE i.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            i.reported_at DESC
          LIMIT 200`,
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          kind: r.kind as string,
          severity: r.severity as string,
          summary: r.summary as string,
          status: r.status as string,
          resolution: (r.resolution as string) ?? null,
          reportedAt: iso(r.reported_at),
          reference: r.reference as string,
          driverName: r.driver_name as string,
        };
      });
    });
  }

  async createIncident(
    ctx: TenantContext,
    body: { recoveryId: string; kind: string; severity?: string; summary: string },
  ) {
    assertTowingStaff(ctx, 'Reporting an incident');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO towing.incidents
           (tenant_id, organization_id, recovery_id, kind, severity, summary, reported_by)
         VALUES ($1,$2,$3,$4,coalesce($5,'low'),$6,$7) RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          body.recoveryId,
          body.kind,
          body.severity ?? null,
          body.summary,
          ctx.userId,
        ],
      );
      const id = (res.rows[0] as { id: string }).id;
      await this.audit.write(client, ctx, {
        action: 'towing.incident.reported',
        resourceType: 'towing_incident',
        resourceId: id,
        detail: { kind: body.kind, severity: body.severity ?? 'low' },
      });
      return { id };
    });
  }

  /* ── Invoices ──────────────────────────────────────────────────────────── */

  async listInvoices(ctx: TenantContext) {
    assertTowingStaff(ctx, 'Towing invoices');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT i.id, i.invoice_number, i.currency, i.callout_fee, i.distance_charge,
                i.other_charges, i.total, i.status, i.issued_at,
                r.reference, r.contact_name
           FROM towing.invoices i
           JOIN towing.recoveries rec ON rec.id = i.recovery_id
           JOIN towing.requests r     ON r.id = rec.request_id
          ORDER BY i.created_at DESC
          LIMIT 200`,
      );
      return res.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          invoiceNumber: r.invoice_number as string,
          currency: r.currency as string,
          calloutFee: money(r.callout_fee),
          distanceCharge: money(r.distance_charge),
          otherCharges: money(r.other_charges),
          total: money(r.total),
          status: r.status as string,
          issuedAt: isoOrNull(r.issued_at),
          reference: r.reference as string,
          contactName: r.contact_name as string,
        };
      });
    });
  }

  /**
   * Raise the invoice for a completed recovery, priced from settings.
   *
   * ⚠️ THE TOTAL IS COMPUTED HERE AND STORED, not computed on read. A rate
   * change next month must not silently restate what a customer was charged
   * last month.
   */
  async createInvoice(ctx: TenantContext, body: { recoveryId: string; otherCharges?: number }) {
    assertTowingStaff(ctx, 'Raising a towing invoice');
    return this.db.withTenant(ctx, async (client) => {
      const rec = await client.query(
        `SELECT rec.id, rec.status, rec.distance_km FROM towing.recoveries rec WHERE rec.id = $1`,
        [body.recoveryId],
      );
      const recovery = rec.rows[0] as
        | { id: string; status: string; distance_km: string | null }
        | undefined;
      if (!recovery) throw new NotFoundException('That recovery was not found.');
      if (recovery.status !== 'completed') {
        throw new BadRequestException(
          'Only a completed recovery can be invoiced. Mark it completed on the active recoveries board first.',
        );
      }

      const set = await client.query(
        `SELECT currency, callout_fee, rate_per_km FROM towing.settings WHERE organization_id = $1`,
        [ctx.organizationId],
      );
      const s = (set.rows[0] as
        | { currency: string; callout_fee: string; rate_per_km: string }
        | undefined) ?? { currency: 'GHS', callout_fee: '0', rate_per_km: '0' };

      const callout = Number(s.callout_fee);
      const distance = Number(recovery.distance_km ?? 0) * Number(s.rate_per_km);
      const other = body.otherCharges ?? 0;
      const total = callout + distance + other;

      const seq = await client.query(
        `SELECT coalesce(max(substring(invoice_number from 'TI-([0-9]+)$')::int), 0) + 1 AS next
           FROM towing.invoices`,
      );
      const number = `TI-${String((seq.rows[0] as { next: number }).next).padStart(4, '0')}`;

      const res = await client.query(
        `INSERT INTO towing.invoices
           (tenant_id, organization_id, recovery_id, invoice_number, currency,
            callout_fee, distance_charge, other_charges, total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, invoice_number`,
        [
          ctx.tenantId,
          ctx.organizationId,
          body.recoveryId,
          number,
          s.currency,
          callout.toFixed(2),
          distance.toFixed(2),
          other.toFixed(2),
          total.toFixed(2),
          ctx.userId,
        ],
      );
      const row = res.rows[0] as { id: string; invoice_number: string };
      await this.audit.write(client, ctx, {
        action: 'towing.invoice.created',
        resourceType: 'towing_invoice',
        resourceId: row.id,
        detail: { invoiceNumber: row.invoice_number, total: total.toFixed(2) },
      });
      return { id: row.id, invoiceNumber: row.invoice_number };
    });
  }

  /* ── Settings ──────────────────────────────────────────────────────────── */

  async getSettings(ctx: TenantContext) {
    assertTowingStaff(ctx, 'Towing settings');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT currency, callout_fee, rate_per_km, service_radius_km,
                operates_24h, dispatch_notes, updated_at
           FROM towing.settings WHERE organization_id = $1`,
        [ctx.organizationId],
      );
      const r = res.rows[0] as Record<string, unknown> | undefined;
      // A workshop that has never opened this screen has no row, and that is
      // not an error — it is the defaults. Returning null here would make the
      // screen render an error state on a perfectly normal first visit.
      if (!r) {
        return {
          currency: 'GHS',
          calloutFee: '0.00',
          ratePerKm: '0.00',
          serviceRadiusKm: null,
          operates24h: false,
          dispatchNotes: null,
          updatedAt: null,
          configured: false,
        };
      }
      return {
        currency: r.currency as string,
        calloutFee: money(r.callout_fee),
        ratePerKm: money(r.rate_per_km),
        serviceRadiusKm: r.service_radius_km === null ? null : Number(r.service_radius_km),
        operates24h: Boolean(r.operates_24h),
        dispatchNotes: (r.dispatch_notes as string) ?? null,
        updatedAt: isoOrNull(r.updated_at),
        configured: true,
      };
    });
  }

  async updateSettings(
    ctx: TenantContext,
    body: {
      currency?: string;
      calloutFee?: number;
      ratePerKm?: number;
      serviceRadiusKm?: number | null;
      operates24h?: boolean;
      dispatchNotes?: string | null;
    },
  ) {
    assertTowingStaff(ctx, 'Changing towing settings');
    return this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO towing.settings
           (organization_id, tenant_id, currency, callout_fee, rate_per_km,
            service_radius_km, operates_24h, dispatch_notes, updated_by)
         VALUES ($1,$2,coalesce($3,'GHS'),coalesce($4,0),coalesce($5,0),$6,coalesce($7,false),$8,$9)
         ON CONFLICT (organization_id) DO UPDATE SET
           currency          = coalesce(EXCLUDED.currency, towing.settings.currency),
           callout_fee       = coalesce($4, towing.settings.callout_fee),
           rate_per_km       = coalesce($5, towing.settings.rate_per_km),
           service_radius_km = $6,
           operates_24h      = coalesce($7, towing.settings.operates_24h),
           dispatch_notes    = $8,
           updated_at        = now(),
           updated_by        = $9`,
        [
          ctx.organizationId,
          ctx.tenantId,
          body.currency ?? null,
          body.calloutFee ?? null,
          body.ratePerKm ?? null,
          body.serviceRadiusKm ?? null,
          body.operates24h ?? null,
          body.dispatchNotes ?? null,
          ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'towing.settings.updated',
        resourceType: 'towing_settings',
        resourceId: ctx.organizationId,
        detail: { calloutFee: body.calloutFee ?? null, ratePerKm: body.ratePerKm ?? null },
      });

      // 🔴 READ BACK ON **THIS** CLIENT, NOT VIA `this.getSettings(ctx)`.
      //
      // `withTenant` takes a connection from the pool and opens a transaction on
      // it. Calling another `withTenant`-wrapped method from inside one takes a
      // SECOND connection, which cannot see this transaction's uncommitted write
      // — so the caller would get the values as they were BEFORE the save, and
      // the settings form would appear to discard every change. It would also
      // hold two pooled connections for one request, which is how a pool
      // deadlocks under load.
      const res = await client.query(
        `SELECT currency, callout_fee, rate_per_km, service_radius_km,
                operates_24h, dispatch_notes, updated_at
           FROM towing.settings WHERE organization_id = $1`,
        [ctx.organizationId],
      );
      const r = res.rows[0] as Record<string, unknown>;
      return {
        currency: r.currency as string,
        calloutFee: money(r.callout_fee),
        ratePerKm: money(r.rate_per_km),
        serviceRadiusKm: r.service_radius_km === null ? null : Number(r.service_radius_km),
        operates24h: Boolean(r.operates_24h),
        dispatchNotes: (r.dispatch_notes as string) ?? null,
        updatedAt: isoOrNull(r.updated_at),
        configured: true,
      };
    });
  }
}
