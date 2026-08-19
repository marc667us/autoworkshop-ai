import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import { assertFleetOperator } from './fleet-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * The fleet workspace — slice 19, migration 087, designed in ADR-023.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THIS SERVICE HAS TWO AUDIENCES AND THAT IS THE WHOLE POINT.
 *
 * `fleet.service_requests` is the only table in the product that two DIFFERENT
 * TENANTS both read. The fleet raises a request; an independent workshop
 * answers it. So the methods below are gated by two different helpers, and
 * which one each uses is load-bearing:
 *
 *   `assertFleetOperator` — the fleet's own vehicles, drivers and requests
 *   `assertWorkshopStaff` — the workshop's INCOMING requests and its response
 *
 * Using one helper for both would either lock the workshop out of work it has
 * been asked to do, or let a fleet answer on a workshop's behalf.
 *
 * ── ⚠️ WHY THE SERVICE LAYER GATES COLUMNS AT ALL ─────────────────────────
 *
 * 087 grants UPDATE as a COLUMN LIST, which is what stops either party
 * rewriting the row wholesale. But column privileges are granted to a ROLE, not
 * per-policy, so the database cannot tell the fleet's UPDATE from the
 * workshop's — both arrive as `autoworkshop_app`. Which party may change which
 * column is therefore enforced HERE, and asserted in
 * `fleet.integration.spec.ts`. Stated plainly because a reader of the migration
 * alone would reasonably assume the split was in the schema.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface FleetVehicleRow {
  id: string;
  registrationNumber: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  currentMileageKm: number | null;
  insuranceExpiresOn: string | null;
  status: string;
}

export interface DriverRow {
  id: string;
  fullName: string;
  licenceNumber: string | null;
  licenceExpiresOn: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

export interface ServiceRequestRow {
  id: string;
  reference: string;
  vehicleRegistration: string;
  vehicleDescription: string | null;
  fleetName: string;
  workshopName: string;
  requestType: string;
  summary: string;
  detail: string | null;
  priority: string;
  preferredDate: string | null;
  odometerKm: number | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

export interface PublishedWorkshop {
  directoryId: string;
  tradingName: string;
  city: string;
  country: string;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return (v as Date)?.toISOString?.() ?? String(v);
}

const REQUEST_COLUMNS = `
  r.id, r.reference, r.vehicle_registration, r.vehicle_description,
  r.fleet_name, r.workshop_name, r.request_type, r.summary, r.detail,
  r.priority, r.preferred_date, r.odometer_km, r.status, r.decline_reason,
  r.created_at`;

function toRequest(r: Record<string, unknown>): ServiceRequestRow {
  return {
    id: r.id as string,
    reference: r.reference as string,
    vehicleRegistration: r.vehicle_registration as string,
    vehicleDescription: (r.vehicle_description as string) ?? null,
    fleetName: r.fleet_name as string,
    workshopName: r.workshop_name as string,
    requestType: r.request_type as string,
    summary: r.summary as string,
    detail: (r.detail as string) ?? null,
    priority: r.priority as string,
    preferredDate: r.preferred_date ? String(r.preferred_date).slice(0, 10) : null,
    odometerKm: r.odometer_km === null || r.odometer_km === undefined ? null : Number(r.odometer_km),
    status: r.status as string,
    declineReason: (r.decline_reason as string) ?? null,
    createdAt: iso(r.created_at) as string,
  };
}

/** Which status a party may move a request TO, from where. */
const WORKSHOP_TRANSITIONS: Record<string, readonly string[]> = {
  submitted: ['accepted', 'declined'],
  accepted: ['in_progress'],
  in_progress: ['completed'],
};

@Injectable()
export class FleetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ── THE FLEET'S OWN SIDE ────────────────────────────────────────────────

  /**
   * The fleet's vehicles.
   *
   * 🔴 READ FROM `core.vehicles`, NOT A FLEET TABLE. ADR-023 decision 1: a
   * second vehicle table would duplicate vehicle identity and guarantee
   * divergent records — the same van, two mileages, and no answer to which is
   * true. RLS scopes this to the fleet's own organisation.
   */
  async listVehicles(ctx: TenantContext): Promise<FleetVehicleRow[]> {
    assertFleetOperator(ctx, 'The fleet vehicle list');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT v.id, v.registration_number, v.vin, mk.name AS make, md.name AS model,
                v.model_year, v.current_mileage_km, v.insurance_expires_on, v.status
           FROM core.vehicles v
           LEFT JOIN core.vehicle_makes  mk ON mk.id = v.make_id
           LEFT JOIN core.vehicle_models md ON md.id = v.model_id
          ORDER BY v.registration_number
          LIMIT 500`,
      );
      return res.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        registrationNumber: r.registration_number as string,
        vin: (r.vin as string) ?? null,
        make: (r.make as string) ?? null,
        model: (r.model as string) ?? null,
        modelYear: r.model_year === null ? null : Number(r.model_year),
        currentMileageKm: r.current_mileage_km === null ? null : Number(r.current_mileage_km),
        insuranceExpiresOn: r.insurance_expires_on
          ? String(r.insurance_expires_on).slice(0, 10)
          : null,
        status: r.status as string,
      }));
    });
  }

  async listDrivers(ctx: TenantContext): Promise<DriverRow[]> {
    assertFleetOperator(ctx, 'The fleet driver list');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, full_name, licence_number, licence_expires_on, phone, email, status
           FROM fleet.drivers ORDER BY full_name LIMIT 500`,
      );
      return res.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        fullName: r.full_name as string,
        licenceNumber: (r.licence_number as string) ?? null,
        licenceExpiresOn: r.licence_expires_on
          ? String(r.licence_expires_on).slice(0, 10)
          : null,
        phone: (r.phone as string) ?? null,
        email: (r.email as string) ?? null,
        status: r.status as string,
      }));
    });
  }

  async createDriver(
    ctx: TenantContext,
    input: {
      fullName: string;
      licenceNumber?: string;
      licenceExpiresOn?: string;
      phone?: string;
      email?: string;
    },
  ): Promise<DriverRow> {
    assertFleetOperator(ctx, 'Adding a driver');
    return this.db.withTenant(ctx, async (client) => {
      // 🔴 `tenant_id` AND `organization_id` COME FROM THE RESOLVED CONTEXT.
      // A body field naming either would be the confused-deputy hole the whole
      // tenancy design exists to prevent.
      const res = await client.query(
        `INSERT INTO fleet.drivers
           (tenant_id, organization_id, full_name, licence_number,
            licence_expires_on, phone, email, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         RETURNING id, full_name, licence_number, licence_expires_on, phone, email, status`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.fullName,
          input.licenceNumber ?? null,
          input.licenceExpiresOn ?? null,
          input.phone ?? null,
          input.email ?? null,
          ctx.userId,
        ],
      );
      const r = res.rows[0] as Record<string, unknown>;
      await this.audit.write(client, ctx, {
        action: 'fleet.driver.added',
        resourceType: 'fleet_driver',
        resourceId: r.id as string,
        detail: { fullName: input.fullName },
      });
      return {
        id: r.id as string,
        fullName: r.full_name as string,
        licenceNumber: (r.licence_number as string) ?? null,
        licenceExpiresOn: r.licence_expires_on
          ? String(r.licence_expires_on).slice(0, 10)
          : null,
        phone: (r.phone as string) ?? null,
        email: (r.email as string) ?? null,
        status: r.status as string,
      };
    });
  }

  /** The fleet's own requests — outgoing. */
  async listServiceRequests(ctx: TenantContext): Promise<ServiceRequestRow[]> {
    assertFleetOperator(ctx, 'The fleet service request list');
    return this.db.withTenant(ctx, async (client) => {
      // ⚠️ NO `fleet_organization_id` PREDICATE, DELIBERATELY — RLS supplies it
      // (`requests_fleet_side`). Writing it here as well would be a second
      // source of truth that can drift from the policy.
      const res = await client.query(
        `SELECT ${REQUEST_COLUMNS} FROM fleet.service_requests r
          WHERE r.fleet_organization_id = $1
          ORDER BY r.created_at DESC LIMIT 200`,
        [ctx.organizationId],
      );
      return res.rows.map((r) => toRequest(r as Record<string, unknown>));
    });
  }

  /**
   * Raise a request with a workshop.
   *
   * 🔴 THE CALLER NAMES A DIRECTORY ROW, NOT AN ORGANISATION. ADR-023
   * decision 2: a fleet may only address a workshop that CHOSE to be publicly
   * listed. The trigger derives `workshop_organization_id` and `workshop_name`
   * from that row — the service never supplies them, because that column is
   * what the workshop-side RLS predicate reads.
   */
  async createServiceRequest(
    ctx: TenantContext,
    input: {
      vehicleId: string;
      workshopDirectoryId: string;
      requestType: string;
      summary: string;
      detail?: string;
      priority?: string;
      preferredDate?: string;
      odometerKm?: number;
    },
  ): Promise<ServiceRequestRow> {
    assertFleetOperator(ctx, 'Raising a service request');
    return this.db.withTenant(ctx, async (client) => {
      // The snapshots. Read from the fleet's OWN tenant, which is the only
      // session that can see them — ADR-023 decision 3.
      const veh = await client.query(
        `SELECT v.registration_number,
                trim(concat_ws(' ', mk.name, md.name, v.model_year::text)) AS description
           FROM core.vehicles v
           LEFT JOIN core.vehicle_makes  mk ON mk.id = v.make_id
           LEFT JOIN core.vehicle_models md ON md.id = v.model_id
          WHERE v.id = $1`,
        [input.vehicleId],
      );
      const v = veh.rows[0] as Record<string, unknown> | undefined;
      // Not this fleet's vehicle, or not a vehicle. ONE answer for both:
      // telling a caller an id exists but belongs elsewhere is a disclosure.
      if (!v) throw new NotFoundException('That vehicle was not found in your fleet.');

      const org = await client.query(
        `SELECT name FROM identity.organizations WHERE id = $1`,
        [ctx.organizationId],
      );
      const fleetName = (org.rows[0] as Record<string, unknown> | undefined)?.name as
        | string
        | undefined;
      if (!fleetName) throw new NotFoundException('Your fleet organisation was not found.');

      const reference = `FS-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

      let res;
      try {
        res = await client.query(
          `INSERT INTO fleet.service_requests
             (reference, fleet_tenant_id, fleet_organization_id, vehicle_id,
              workshop_directory_id, workshop_organization_id,
              fleet_name, workshop_name, vehicle_registration, vehicle_description,
              request_type, summary, detail, priority, preferred_date, odometer_km,
              status, submitted_at, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,
                   -- Placeholders. The BEFORE trigger overwrites both from the
                   -- directory row; supplying them here is unavoidable only
                   -- because they are NOT NULL.
                   $3, $6, '', $7, $8, $9, $10, $11, $12, $13,
                   'submitted', now(), $14, $14)
        RETURNING ${REQUEST_COLUMNS}`,
          [
            reference,
            ctx.tenantId,
            ctx.organizationId,
            input.vehicleId,
            input.workshopDirectoryId,
            fleetName,
            v.registration_number,
            (v.description as string) || null,
            input.requestType,
            input.summary,
            input.detail ?? null,
            input.priority ?? 'normal',
            input.preferredDate ?? null,
            input.odometerKm ?? null,
            ctx.userId,
          ],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // The trigger's own wording reaches the user as an answer rather than a
        // 500 — the treatment the registration routes give database refusals.
        if (
          message.includes('not currently accepting requests') ||
          message.includes('not in the public directory') ||
          message.includes('cannot raise a service request with itself')
        ) {
          throw new BadRequestException(message);
        }
        throw err;
      }

      const row = res.rows[0] as Record<string, unknown>;
      await this.audit.write(client, ctx, {
        action: 'fleet.service_request.raised',
        resourceType: 'fleet_service_request',
        resourceId: row.id as string,
        detail: { reference, workshopDirectoryId: input.workshopDirectoryId },
      });
      return toRequest(row);
    });
  }

  /** The published workshops a fleet may address. */
  async listPublishedWorkshops(ctx: TenantContext): Promise<PublishedWorkshop[]> {
    assertFleetOperator(ctx, 'The workshop directory');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, trading_name, city, country
           FROM catalogue.mechanic_directory
          WHERE is_published AND organization_id <> $1
          ORDER BY trading_name LIMIT 500`,
        [ctx.organizationId],
      );
      return res.rows.map((r: Record<string, unknown>) => ({
        directoryId: r.id as string,
        tradingName: r.trading_name as string,
        city: r.city as string,
        country: r.country as string,
      }));
    });
  }

  // ── THE WORKSHOP'S SIDE OF THE SAME TABLE ───────────────────────────────

  /**
   * Requests addressed TO this workshop — the cross-tenant read.
   *
   * 🔴 GATED BY `assertWorkshopStaff`, NOT `assertFleetOperator`. This is the
   * one place a workshop reads a row that lives in another tenant, admitted by
   * `requests_workshop_read`. Gating it with the fleet helper would lock the
   * workshop out of the work it has been asked to do.
   */
  async listIncomingRequests(ctx: TenantContext): Promise<ServiceRequestRow[]> {
    assertWorkshopStaff(ctx, 'Incoming fleet service requests');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${REQUEST_COLUMNS} FROM fleet.service_requests r
          WHERE r.workshop_organization_id = $1
            AND r.status <> 'draft'
          ORDER BY r.created_at DESC LIMIT 200`,
        [ctx.organizationId],
      );
      return res.rows.map((r) => toRequest(r as Record<string, unknown>));
    });
  }

  /**
   * The workshop answers: accept, decline, start, complete.
   *
   * 🔴 THE TRANSITION TABLE IS THE GATE, NOT THE COLUMN GRANT. 087 grants
   * UPDATE on `status` to the application role, and the database cannot tell
   * which party is calling — both arrive as `autoworkshop_app`. So the legal
   * moves live here, and a move that is not legal is refused with the states
   * that ARE reachable named in the message.
   */
  async respondToRequest(
    ctx: TenantContext,
    id: string,
    input: { status: string; declineReason?: string },
  ): Promise<ServiceRequestRow> {
    assertWorkshopStaff(ctx, 'Responding to a fleet service request');
    return this.db.withTenant(ctx, async (client) => {
      const current = await client.query(
        `SELECT status FROM fleet.service_requests
          WHERE id = $1 AND workshop_organization_id = $2`,
        [id, ctx.organizationId],
      );
      const row = current.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new NotFoundException('That service request was not found.');

      const from = row.status as string;
      const allowed = WORKSHOP_TRANSITIONS[from] ?? [];
      if (!allowed.includes(input.status)) {
        throw new BadRequestException(
          allowed.length > 0
            ? `A request that is "${from}" can be moved to ${allowed.join(' or ')}.`
            : `A request that is "${from}" has been settled and cannot be changed. ` +
              'The fleet must raise a new request.',
        );
      }
      if (input.status === 'declined' && !input.declineReason?.trim()) {
        // 087's CHECK refuses this too. Caught here so the message names the
        // field a person filled in rather than a constraint name.
        throw new BadRequestException('Say why you cannot take this work — the fleet sees only this.');
      }

      const res = await client.query(
        `UPDATE fleet.service_requests r
            SET status = $2,
                decline_reason = CASE WHEN $2 = 'declined' THEN $3 ELSE r.decline_reason END,
                responded_at   = COALESCE(r.responded_at, now()),
                completed_at   = CASE WHEN $2 = 'completed' THEN now() ELSE r.completed_at END,
                updated_by     = $4
          WHERE r.id = $1
      RETURNING ${REQUEST_COLUMNS}`,
        [id, input.status, input.declineReason?.trim() ?? null, ctx.userId],
      );
      const updated = res.rows[0] as Record<string, unknown> | undefined;
      if (!updated) throw new NotFoundException('That service request was not found.');

      await this.audit.write(client, ctx, {
        action: `fleet.service_request.${input.status}`,
        resourceType: 'fleet_service_request',
        resourceId: id,
        detail: { from, to: input.status },
      });
      return toRequest(updated);
    });
  }
}
