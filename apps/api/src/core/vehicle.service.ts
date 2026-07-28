import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  FUEL_TYPES,
  TRANSMISSIONS,
  optionalDate,
  optionalInt,
  optionalOneOf,
  optionalText,
  optionalUuid,
  requireText,
  requireUuid,
} from './validate';

/** A row of the shared make taxonomy, for form pickers. */
export interface VehicleMake {
  id: string;
  name: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  /** Joined from core.customers — the relationship, resolved for display. */
  customerName: string;
  registrationNumber: string;
  vin: string | null;
  /** Joined from core.vehicle_makes / core.vehicle_models. */
  make: string;
  model: string | null;
  variant: string | null;
  modelYear: number | null;
  engineType: string | null;
  transmissionType: string | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  colour: string | null;
  insurerName: string | null;
  insuranceExpiresOn: string | null;
  status: string;
  createdAt: string;
}

/**
 * Roles permitted to register a vehicle.
 *
 * `07.txt` part 2 §50 — reception staff hold "customer, VEHICLE, complaint,
 * appointment, intake" functions. `2.txt` §537 also has the vehicle OWNER
 * registering their own vehicles, which is why `customer` appears here; what a
 * customer may then attach it to is constrained in `create` below.
 */
const CAN_CREATE_VEHICLE = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'customer',
]);

/**
 * Roles permitted to READ the organisation's vehicle register.
 *
 * Same list, same reasoning and the same measured cause as
 * `CAN_READ_CUSTOMERS` — with a real technician token, `GET /api/v1/vehicles`
 * answered **HTTP 200 with all three vehicles** while the screen 404'd the same
 * viewer. The page gate is not the control; this is.
 *
 * A technician's absence here is the one worth restating, because it looks
 * wrong at a glance: a technician obviously needs vehicle details to repair a
 * vehicle. What they do not need is the register of EVERY vehicle the workshop
 * has ever seen. §49's navigation gives them "My Assigned Work", and Phase 5's
 * job card is what will carry the vehicle for the job they are assigned —
 * scoped by assignment rather than by role. Granting the whole list now, on the
 * grounds that a narrower grant does not exist yet, is how a temporary
 * convenience becomes the permission model.
 */
const CAN_READ_VEHICLES = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'cashier',
  'customer',
]);

/**
 * Vehicle domain service — Phase 4, Release 0.3.
 *
 * THE OWNER'S SCHEMA RULE IS VISIBLE HERE. A vehicle stores `customer_id`,
 * `make_id` and `model_id` — not a customer's name, not the text "Toyota" — and
 * these queries JOIN to resolve them. That is what "real foreign keys, joins,
 * normalised" buys: rename a customer once and every vehicle screen is correct,
 * because there is only one copy of the fact.
 */
@Injectable()
export class VehicleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Vehicles visible to this viewer, newest first.
   *
   * `01 (1).txt` §19 states the two rules this implements:
   *   · "Workshop staff shall see organizational customer records."
   *   · "Vehicle owners shall see only vehicles they own or are authorized to
   *     manage."
   *
   * So a viewer in the `customer` role is narrowed to vehicles belonging to the
   * customer record linked to THEIR user account. RLS cannot make this
   * distinction — it isolates tenants, and a customer is inside the tenant, not
   * outside it. Without the predicate below a signed-in customer would see every
   * vehicle the workshop services.
   *
   * `optionalCustomerId` is a display filter (the customer detail page), applied
   * ON TOP of that scope and never instead of it.
   */
  async list(ctx: TenantContext, optionalCustomerId?: string): Promise<Vehicle[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const scopeToSelf = ctx.activeRole === 'customer';
      const res = await client.query(
        `SELECT v.id, v.customer_id, c.display_name AS customer_name,
                v.registration_number, v.vin,
                mk.name AS make, md.name AS model, v.variant, v.model_year,
                v.engine_type, v.transmission_type, v.fuel_type,
                v.current_mileage_km, v.colour,
                v.insurer_name, v.insurance_expires_on,
                v.status, v.created_at
           FROM core.vehicles v
           -- INNER join: customer_id is NOT NULL and ON DELETE RESTRICT, so a
           -- vehicle without a customer cannot exist. If one ever did, dropping
           -- it from the list is the safe outcome — an orphan is a data defect,
           -- not a record to display with a blank owner.
           JOIN core.customers c
             ON c.id = v.customer_id
            AND c.tenant_id = v.tenant_id
           JOIN core.vehicle_makes  mk ON mk.id = v.make_id
           -- LEFT: model is optional by design (see migration 004), and an inner
           -- join here would hide every vehicle whose exact model is unknown.
           LEFT JOIN core.vehicle_models md ON md.id = v.model_id
          WHERE v.tenant_id = $1
            AND v.organization_id = $2
            AND ($3::uuid IS NULL OR v.customer_id = $3::uuid)
            AND ($4::uuid IS NULL OR c.user_id     = $4::uuid)
          ORDER BY v.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, optionalCustomerId ?? null, scopeToSelf ? ctx.userId : null],
      );
      return res.rows.map(this.toDomain);
    });
  }

  /**
   * The vehicle-make taxonomy, for the "register a vehicle" form's picker.
   *
   * Shared reference data with no tenant dimension (migration 004), so there is
   * nothing to isolate — but it is still gated, because the make list is only
   * useful to someone registering or reading a vehicle and an ungated endpoint
   * is one more thing to reason about later.
   *
   * Anyone who may CREATE a vehicle can read it, not only those who may read the
   * register: `2.txt` §537 has the vehicle OWNER registering their own vehicles,
   * and a customer must be able to say what they drive.
   */
  async listMakes(ctx: TenantContext): Promise<VehicleMake[]> {
    if (!CAN_READ_VEHICLES.has(ctx.activeRole) && !CAN_CREATE_VEHICLE.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not read vehicle makes`,
      );
    }
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, name FROM core.vehicle_makes ORDER BY name`,
        [],
      );
      return res.rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Vehicle> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const scopeToSelf = ctx.activeRole === 'customer';
      const res = await client.query(
        `SELECT v.id, v.customer_id, c.display_name AS customer_name,
                v.registration_number, v.vin,
                mk.name AS make, md.name AS model, v.variant, v.model_year,
                v.engine_type, v.transmission_type, v.fuel_type,
                v.current_mileage_km, v.colour,
                v.insurer_name, v.insurance_expires_on,
                v.status, v.created_at
           FROM core.vehicles v
           JOIN core.customers c
             ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
           JOIN core.vehicle_makes  mk ON mk.id = v.make_id
           LEFT JOIN core.vehicle_models md ON md.id = v.model_id
          WHERE v.id = $1 AND v.tenant_id = $2
            AND v.organization_id = $3
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)`,
        [id, ctx.tenantId, ctx.organizationId, scopeToSelf ? ctx.userId : null],
      );
      const row = res.rows[0];
      if (!row) {
        // 404, not 403 — same non-oracle reasoning as everywhere else in this
        // codebase. A customer probing another customer's vehicle id gets the
        // identical answer they would get for an id that does not exist.
        throw new NotFoundException('vehicle not found');
      }
      return this.toDomain(row);
    });
  }

  async create(
    ctx: TenantContext,
    input: {
      customerId: string;
      registrationNumber: string;
      makeId: string;
      modelId?: string;
      vin?: string;
      variant?: string;
      modelYear?: number;
      engineType?: string;
      transmissionType?: string;
      fuelType?: string;
      currentMileageKm?: number;
      colour?: string;
      insurerName?: string;
      insurancePolicyNo?: string;
      insuranceExpiresOn?: string;
    },
  ): Promise<Vehicle> {
    if (!CAN_CREATE_VEHICLE.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not register a vehicle`,
      );
    }

    // Validated BEFORE any SQL, and in the service so an MCP tool gets the same
    // checks a REST caller does. Codex P2: the body's ids carried no
    // `ParseUUIDPipe`, so a malformed one reached a comparison against a `uuid`
    // column and PostgreSQL raised 22P02 — a 500 for what is a bad field.
    const customerId = requireUuid(input.customerId, 'customerId');
    const makeId = requireUuid(input.makeId, 'makeId');
    const modelId = optionalUuid(input.modelId, 'modelId');
    const registration = requireText(input.registrationNumber, 'registrationNumber', 32);
    const vin = optionalText(input.vin, 'vin', 32);
    const variant = optionalText(input.variant, 'variant', 120);
    const engineType = optionalText(input.engineType, 'engineType', 120);
    const colour = optionalText(input.colour, 'colour', 60);
    const insurerName = optionalText(input.insurerName, 'insurerName', 200);
    const insurancePolicyNo = optionalText(input.insurancePolicyNo, 'insurancePolicyNo', 120);
    // These mirror the CHECK constraints in migration 004. The constraint stays
    // the authority; this turns the common case into a 400 naming the field
    // rather than a raw constraint violation.
    const transmissionType = optionalOneOf(input.transmissionType, TRANSMISSIONS, 'transmissionType');
    const fuelType = optionalOneOf(input.fuelType, FUEL_TYPES, 'fuelType');
    const modelYear = optionalInt(input.modelYear, 'modelYear', 1900, 2100);
    const currentMileageKm = optionalInt(input.currentMileageKm, 'currentMileageKm', 0, 100_000_000);
    const insuranceExpiresOn = optionalDate(input.insuranceExpiresOn, 'insuranceExpiresOn');

    return this.db.withTenant(ctx, async (client) => {
      // ── the parent must belong to the ACTIVE TENANT ─────────────────────
      //
      // A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE. `customer_id` REFERENCES
      // `core.customers(id)` and nothing else; RLS `WITH CHECK` validates the
      // `tenant_id` of the row being INSERTED, not the tenant of the row it
      // points at. So `tenant_id = <A>` with `customer_id = <a customer in
      // tenant B>` satisfies the foreign key AND the policy at the same time,
      // and files a vehicle under tenant A that belongs to someone else's
      // customer. `BranchService.create` documents the identical trap.
      //
      // The lookup closes it precisely BECAUSE `core.customers` is under FORCE
      // RLS: a customer in another tenant is invisible to this query, so it
      // returns no row. The check is the join, not a comparison that could be
      // written the wrong way round.
      //
      // The `user_id` clause additionally stops a signed-in CUSTOMER attaching a
      // vehicle to a different customer's record inside their own tenant —
      // authorised to register vehicles, but only their own (`2.txt` §537).
      const scopeToSelf = ctx.activeRole === 'customer';
      const parent = await client.query(
        `SELECT 1 FROM core.customers
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND ($4::uuid IS NULL OR user_id = $4::uuid)`,
        [customerId, ctx.tenantId, ctx.organizationId, scopeToSelf ? ctx.userId : null],
      );
      if (parent.rows.length === 0) {
        throw new NotFoundException('customer not found');
      }

      // The make must exist. It is shared reference data with no tenant
      // dimension, so this is an integrity check rather than an isolation one —
      // but an unchecked id would surface as a raw FK violation 500 instead of
      // a 404 the form can act on.
      const make = await client.query(`SELECT 1 FROM core.vehicle_makes WHERE id = $1`, [
        makeId,
      ]);
      if (make.rows.length === 0) {
        throw new NotFoundException('vehicle make not found');
      }

      // A model, when given, must belong to the make given. Without this the
      // row would be internally inconsistent in a way no constraint catches:
      // both ids are individually valid, so the FKs are satisfied while the
      // vehicle reads "Toyota Sportage".
      if (modelId) {
        const model = await client.query(
          `SELECT 1 FROM core.vehicle_models WHERE id = $1 AND make_id = $2`,
          [modelId, makeId],
        );
        if (model.rows.length === 0) {
          throw new BadRequestException('model does not belong to the given make');
        }
      }

      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO core.vehicles
             (tenant_id, organization_id, customer_id, registration_number, vin,
              make_id, model_id, variant, model_year, engine_type, transmission_type,
              fuel_type, current_mileage_km, colour, insurer_name, insurance_policy_no,
              insurance_expires_on, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           RETURNING id`,
          [
            ctx.tenantId,
            ctx.organizationId,
            customerId,
            registration,
            vin,
            makeId,
            modelId,
            variant,
            modelYear,
            engineType,
            transmissionType,
            fuelType,
            currentMileageKm,
            colour,
            insurerName,
            insurancePolicyNo,
            insuranceExpiresOn,
            ctx.userId,
          ],
        );
      } catch (err) {
        // 23505 = unique_violation. Migration 005 makes registration and VIN
        // unique PER ORGANIZATION — the same scope these queries READ at — so a
        // collision can only be with a vehicle the caller is already entitled to
        // see, and this 409 tells them nothing they could not learn by listing.
        //
        // ⚠️ THAT MATCHING SCOPE IS THE WHOLE POINT, not an implementation
        // detail. Under 004 the constraint was per TENANT while reads were per
        // ORGANIZATION, and the mismatch made this response a cross-organization
        // existence oracle: a 409 confirmed that another organization in the
        // same tenant held that plate, so iterating a plate list enumerated
        // their vehicle register. Narrowing reads without narrowing the
        // constraint would reopen it.
        //
        // Translated to a 409 the form can act on; left raw it is a 500 that
        // tells reception nothing about what to change.
        if ((err as { code?: string }).code === '23505') {
          throw new ConflictException(
            'a vehicle with this registration number or VIN already exists',
          );
        }
        throw err;
      }

      await this.audit.write(client, ctx, {
        action: 'vehicle.created',
        resourceType: 'vehicle',
        resourceId: inserted.rows[0].id,
        // The registration number identifies the ASSET, not the person, and it
        // is the field an investigator needs to trace the record. The owner's
        // contact details are not repeated here — see CustomerService.create.
        detail: { registrationNumber: registration, customerId },
      });

      // Re-read through the same join the list uses, inside the same
      // transaction, so the created vehicle comes back with its make, model and
      // customer name resolved exactly as the screen will show them — rather
      // than a second shape assembled by hand that could drift from it.
      return this.readOne(client, ctx, inserted.rows[0].id);
    });
  }

  /**
   * 403 rather than 404: this depends only on the caller's own role, which they
   * already know, so it is not an existence oracle — and telling a legitimate
   * user "not found" when the real answer is "not your role" sends them to a bug
   * report instead of to an administrator. See `CustomerService.assertMayRead`.
   */
  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_VEHICLES.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not read vehicle records`,
      );
    }
  }

  /** Shared read used by `create`, so one query shape serves both paths. */
  private async readOne(
    client: PoolClient,
    ctx: TenantContext,
    id: string,
  ): Promise<Vehicle> {
    const res = await client.query(
      `SELECT v.id, v.customer_id, c.display_name AS customer_name,
              v.registration_number, v.vin,
              mk.name AS make, md.name AS model, v.variant, v.model_year,
              v.engine_type, v.transmission_type, v.fuel_type,
              v.current_mileage_km, v.colour,
              v.insurer_name, v.insurance_expires_on,
              v.status, v.created_at
         FROM core.vehicles v
         JOIN core.customers c
           ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
         JOIN core.vehicle_makes  mk ON mk.id = v.make_id
         LEFT JOIN core.vehicle_models md ON md.id = v.model_id
        WHERE v.id = $1 AND v.tenant_id = $2 AND v.organization_id = $3`,
      [id, ctx.tenantId, ctx.organizationId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException('vehicle not found');
    return this.toDomain(row);
  }

  private toDomain = (row: {
    id: string;
    customer_id: string;
    customer_name: string;
    registration_number: string;
    vin: string | null;
    make: string;
    model: string | null;
    variant: string | null;
    model_year: number | null;
    engine_type: string | null;
    transmission_type: string | null;
    fuel_type: string | null;
    current_mileage_km: number | null;
    colour: string | null;
    insurer_name: string | null;
    insurance_expires_on: Date | null;
    status: string;
    created_at: Date;
  }): Vehicle => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    registrationNumber: row.registration_number,
    vin: row.vin,
    make: row.make,
    model: row.model,
    variant: row.variant,
    modelYear: row.model_year,
    engineType: row.engine_type,
    transmissionType: row.transmission_type,
    fuelType: row.fuel_type,
    currentMileageKm: row.current_mileage_km,
    colour: row.colour,
    insurerName: row.insurer_name,
    // A DATE column, not a timestamp: rendering it as an ISO instant would
    // introduce a timezone the value never had and can shift the day shown.
    insuranceExpiresOn: row.insurance_expires_on
      ? row.insurance_expires_on.toISOString().slice(0, 10)
      : null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}
