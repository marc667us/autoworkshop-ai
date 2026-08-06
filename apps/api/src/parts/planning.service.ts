import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * TECHNICIAN PLANNING — slice 14, `NEXT_SESSION_SCHEDULE.md` B2.
 *
 * The five `/plan-work/*` routes: finding a part, checking it fits, booking a
 * tool or a bay, and asking for a specialist.
 *
 * ── ⚠️ STAFF ONLY, EVERY METHOD ────────────────────────────────────────────
 *
 * All of this is the WORKSHOP'S operational data — what is on the shelf, what
 * it cost, which ramp is free. `customer` is a real membership role in the same
 * organisation, so `assertWorkshopStaff` is on every method rather than on the
 * controller: a controller guard covers the routes that exist today, and the
 * rule needs to cover the caller that arrives tomorrow.
 *
 * That asymmetry — writes gated, reads open — is what let a customer read the
 * whole invoice book on 2026-08-07. It is not repeated here.
 */

export interface StockSearchRow {
  stockItemId: string;
  partNumber: string;
  name: string;
  brand: string | null;
  unit: string | null;
  shelfLocation: string | null;
  onHand: string;
  reserved: string;
  available: string;
  needsReorder: boolean;
}

export interface FitmentRow {
  partId: string;
  partNumber: string | null;
  name: string | null;
  make: string;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface BookingRow {
  id: string;
  resourceKind: string;
  resourceId: string;
  resourceName: string | null;
  jobCardId: string;
  jobNumber: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  bookedByName: string | null;
}

export interface BookableResource {
  id: string;
  kind: string;
  name: string;
  detail: string | null;
  isAvailable: boolean;
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ── find parts ────────────────────────────────────────────────────────────

  /**
   * Search the workshop's own shelves.
   *
   * ⚠️ READS `parts.stock_on_hand`, THE VIEW, NOT `stock_items`. The view
   * already computes on-hand, reserved and available from the movement ledger.
   * Re-deriving them here would be a second answer to "how many are there",
   * and the two would disagree the first time a movement was inserted by
   * anything but this method.
   */
  async findParts(ctx: TenantContext, q?: string): Promise<StockSearchRow[]> {
    assertWorkshopStaff(ctx, 'The workshop parts shelf');
    return this.db.withTenant(ctx, async (client) => {
      const term = (q ?? '').trim();
      const r = await client.query(
        `SELECT stock_item_id, part_number, name, brand, unit, shelf_location,
                on_hand, reserved, available, needs_reorder
           FROM parts.stock_on_hand
          WHERE tenant_id = $1 AND organization_id = $2 AND is_active
            AND ($3::text = '' OR part_number ILIKE '%' || $3 || '%'
                 OR name ILIKE '%' || $3 || '%'
                 OR COALESCE(brand, '') ILIKE '%' || $3 || '%')
          ORDER BY (available > 0) DESC, name
          LIMIT 200`,
        [ctx.tenantId, ctx.organizationId, term],
      );
      return r.rows.map((x) => ({
        stockItemId: x.stock_item_id as string,
        partNumber: x.part_number as string,
        name: x.name as string,
        brand: (x.brand as string | null) ?? null,
        unit: (x.unit as string | null) ?? null,
        shelfLocation: (x.shelf_location as string | null) ?? null,
        onHand: String(x.on_hand),
        reserved: String(x.reserved),
        available: String(x.available),
        needsReorder: x.needs_reorder as boolean,
      }));
    });
  }

  // ── compatibility ─────────────────────────────────────────────────────────

  /**
   * Which vehicles a part is recorded as fitting.
   *
   * 🔴 THIS ANSWERS "WHAT IS RECORDED", NOT "WHAT FITS". `catalogue.part_fitments`
   * is data suppliers and the workshop entered; absence of a row means nobody
   * has recorded that combination, NOT that the part does not fit. The screen
   * says so, because a technician who reads a silent empty list as "does not
   * fit" will order a part they already have.
   */
  async partsCompatibility(
    ctx: TenantContext,
    opts: { make?: string; partNumber?: string } = {},
  ): Promise<FitmentRow[]> {
    assertWorkshopStaff(ctx, 'The parts compatibility register');
    return this.db.withTenant(ctx, async (client) => {
      const make = (opts.make ?? '').trim();
      const pn = (opts.partNumber ?? '').trim();
      const r = await client.query(
        `SELECT f.part_id, f.make, f.model, f.year_from, f.year_to,
                p.part_number, p.name
           FROM catalogue.part_fitments f
           LEFT JOIN catalogue.parts p ON p.id = f.part_id
          WHERE ($1::text = '' OR f.make ILIKE '%' || $1 || '%')
            AND ($2::text = '' OR COALESCE(p.part_number, '') ILIKE '%' || $2 || '%')
          ORDER BY f.make, f.model NULLS FIRST, f.year_from NULLS FIRST
          LIMIT 200`,
        [make, pn],
      );
      return r.rows.map((x) => ({
        partId: x.part_id as string,
        partNumber: (x.part_number as string | null) ?? null,
        name: (x.name as string | null) ?? null,
        make: x.make as string,
        model: (x.model as string | null) ?? null,
        yearFrom: x.year_from === null ? null : Number(x.year_from),
        yearTo: x.year_to === null ? null : Number(x.year_to),
      }));
    });
  }

  // ── bookable resources ────────────────────────────────────────────────────

  /**
   * Tools or bays, each flagged with whether it is free RIGHT NOW.
   *
   * ⚠️ "AVAILABLE" IS COMPUTED AGAINST THE BOOKING TABLE, not read from
   * `tools.status`. A status column goes stale the moment a booking starts or
   * ends and nothing updates it; the bookings are the record, and a flag that
   * disagreed with them would send two technicians to the same ramp.
   */
  async listBookable(ctx: TenantContext, kind: 'tool' | 'bay'): Promise<BookableResource[]> {
    assertWorkshopStaff(ctx, 'The workshop tools and bays');
    return this.db.withTenant(ctx, async (client) => {
      const r =
        kind === 'tool'
          ? await client.query(
              `SELECT t.id, t.name, t.asset_tag AS detail,
                      NOT EXISTS (
                        SELECT 1 FROM parts.resource_bookings b
                         WHERE b.resource_kind = 'tool' AND b.resource_id = t.id
                           AND b.organization_id = t.organization_id
                           AND b.status = 'booked'
                           AND tstzrange(b.starts_at, b.ends_at) @> now()
                      ) AS is_available
                 FROM parts.tools t
                WHERE t.tenant_id = $1 AND t.organization_id = $2
                ORDER BY t.name`,
              [ctx.tenantId, ctx.organizationId],
            )
          : await client.query(
              `SELECT s.id, s.name, s.bay_type AS detail,
                      NOT EXISTS (
                        SELECT 1 FROM parts.resource_bookings b
                         WHERE b.resource_kind = 'bay' AND b.resource_id = s.id
                           AND b.organization_id = s.organization_id
                           AND b.status = 'booked'
                           AND tstzrange(b.starts_at, b.ends_at) @> now()
                      ) AS is_available
                 FROM core.service_bays s
                WHERE s.tenant_id = $1 AND s.organization_id = $2 AND s.is_active
                ORDER BY s.name`,
              [ctx.tenantId, ctx.organizationId],
            );
      return r.rows.map((x) => ({
        id: x.id as string,
        kind,
        name: x.name as string,
        detail: (x.detail as string | null) ?? null,
        isAvailable: x.is_available as boolean,
      }));
    });
  }

  async listBookings(ctx: TenantContext, kind?: 'tool' | 'bay'): Promise<BookingRow[]> {
    assertWorkshopStaff(ctx, 'The workshop booking diary');
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT b.id, b.resource_kind, b.resource_id, b.job_card_id, b.starts_at,
                b.ends_at, b.status, j.job_number, u.display_name AS booked_by_name,
                COALESCE(t.name, s.name) AS resource_name
           FROM parts.resource_bookings b
           LEFT JOIN repair.job_cards j ON j.id = b.job_card_id
                AND j.tenant_id = b.tenant_id AND j.organization_id = b.organization_id
           LEFT JOIN identity.users u ON u.id = b.booked_by
           LEFT JOIN parts.tools t ON t.id = b.resource_id AND b.resource_kind = 'tool'
                AND t.organization_id = b.organization_id
           LEFT JOIN core.service_bays s ON s.id = b.resource_id AND b.resource_kind = 'bay'
                AND s.organization_id = b.organization_id
          WHERE b.tenant_id = $1 AND b.organization_id = $2
            AND ($3::text IS NULL OR b.resource_kind = $3)
          ORDER BY b.starts_at DESC
          LIMIT 200`,
        [ctx.tenantId, ctx.organizationId, kind ?? null],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        resourceKind: x.resource_kind as string,
        resourceId: x.resource_id as string,
        resourceName: (x.resource_name as string | null) ?? null,
        jobCardId: x.job_card_id as string,
        jobNumber: (x.job_number as string | null) ?? null,
        startsAt: (x.starts_at as Date).toISOString(),
        endsAt: (x.ends_at as Date).toISOString(),
        status: x.status as string,
        bookedByName: (x.booked_by_name as string | null) ?? null,
      }));
    });
  }

  /**
   * Book a tool or a bay.
   *
   * 🔴 THE OVERLAP RULE IS THE DATABASE'S, NOT THIS METHOD'S. An
   * `EXCLUDE USING gist` constraint refuses a clash even when two requests
   * arrive together and both read "free" — the READ COMMITTED race a service
   * check cannot win. This translates the constraint's error into a sentence;
   * it does not re-implement it.
   */
  async book(
    ctx: TenantContext,
    input: {
      resourceKind: 'tool' | 'bay';
      resourceId: string;
      jobCardId: string;
      startsAt: string;
      endsAt: string;
    },
  ): Promise<BookingRow[]> {
    assertWorkshopStaff(ctx, 'Booking a workshop tool or bay');
    await this.db.withTenant(ctx, async (client) => {
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO parts.resource_bookings
             (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
              starts_at, ends_at, booked_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$8)
           RETURNING id`,
          [
            ctx.tenantId, ctx.organizationId, input.resourceKind, input.resourceId,
            input.jobCardId, input.startsAt, input.endsAt, ctx.userId,
          ],
        );
        await this.audit.write(client, ctx, {
          action: 'planning.resource.booked',
          resourceType: 'resource_booking',
          resourceId: created.rows[0]!.id,
          detail: { kind: input.resourceKind },
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        // 23P01 = exclusion_violation. The clash, said as a sentence.
        if (code === '23P01') {
          throw new ConflictException(
            'That is already booked for part of the time you asked for. ' +
              'Pick another window, or use the diary below to see when it is free.',
          );
        }
        if (code === '23503') {
          throw new NotFoundException(
            'That tool, bay or job card is not in this workshop.',
          );
        }
        if (code === '23514') {
          throw new ConflictException('The booking must end after it starts.');
        }
        throw e;
      }
    });
    return this.listBookings(ctx, input.resourceKind);
  }

  /** Give it back. Released rather than deleted: who had it and when is a fact. */
  async release(ctx: TenantContext, bookingId: string, reason?: string): Promise<BookingRow[]> {
    assertWorkshopStaff(ctx, 'Releasing a workshop tool or bay');
    const kind = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query<{ resource_kind: string }>(
        `UPDATE parts.resource_bookings
            SET status = 'released', release_reason = $4, updated_by = $3, updated_at = now()
          WHERE id = $1 AND tenant_id = $5 AND organization_id = $2 AND status = 'booked'
          RETURNING resource_kind`,
        [bookingId, ctx.organizationId, ctx.userId, reason ?? null, ctx.tenantId],
      );
      if (!r.rowCount) {
        throw new NotFoundException('That booking is not open, or is not in this workshop.');
      }
      await this.audit.write(client, ctx, {
        action: 'planning.resource.released',
        resourceType: 'resource_booking',
        resourceId: bookingId,
      });
      return r.rows[0]!.resource_kind as 'tool' | 'bay';
    });
    return this.listBookings(ctx, kind);
  }
}
