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

export interface WarrantyPolicy {
  id: string;
  policyNumber: string;
  jobCardId: string;
  jobNumber: string | null;
  vehicleId: string | null;
  registrationNumber: string | null;
  customerName: string | null;
  coverSummary: string;
  startsOn: string;
  expiresOn: string | null;
  expiresAtOdometer: number | null;
  status: string;
  voidReason: string | null;
  /** Derived at read time — see `decorate` for why it is not stored. */
  isCurrentlyInForce: boolean;
  claimCount: number;
  createdAt: string;
}

export interface WarrantyClaim {
  id: string;
  claimNumber: string;
  policyId: string;
  policyNumber: string;
  registrationNumber: string | null;
  customerName: string | null;
  reportedFault: string;
  reportedAt: string;
  odometerReading: number | null;
  status: string;
  remedialJobCardId: string | null;
  events?: Array<{
    id: string;
    eventKind: string;
    reason: string | null;
    note: string | null;
    decidedByName: string | null;
    decidedAt: string;
  }>;
}

/**
 * Who may decide a warranty claim.
 *
 * 🔴 NOT THE PERSON WHO TOOK IT IN. Approving a claim commits the workshop to
 * doing work for nothing, which is a commercial decision, not a clerical one —
 * the same reasoning that makes a refund narrower than taking a payment. The
 * supervisor is included because §47/§50 give technical review to that role and
 * most claims turn on whether the original repair was at fault.
 */
const MAY_DECIDE = ['workshop_owner', 'workshop_manager', 'workshop_supervisor'] as const;

/** Anyone at the front desk can RECORD a claim — refusing to take one is worse. */
const MAY_RECORD = [
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',
  'cashier',
] as const;

/**
 * Warranty — slice 5 of `COMPLETION_PLAN.md`.
 *
 * Sequenced after invoicing because a claim with no invoice to claim against is
 * a form with nowhere to write: the question a claim answers is "was this the
 * work we already charged for, and is it still covered?"
 *
 * ⚠️ EVERY DECISION IS AN EVENT, NEVER AN OVERWRITE. `warranty.claim_events` is
 * append-only on UPDATE **and** DELETE; the claim's `status` is a cache the
 * trigger keeps in step. A workshop that could rewrite a rejection into an
 * approval has a warranty record that means nothing (CLAUDE.md — warranty
 * decisions are append-only).
 *
 * ⚠️ EVERY QUERY CARRIES tenant_id AND organization_id. RLS here is tenant-wide
 * and a tenant holds more than one organisation.
 */
@Injectable()
export class WarrantyService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayRecord(ctx: TenantContext): void {
    if (!MAY_RECORD.includes((ctx.activeRole ?? '') as (typeof MAY_RECORD)[number])) {
      throw new ForbiddenException(
        'Recording a warranty claim is a front-desk function. Ask reception, the cashier, ' +
          'the supervisor, the workshop manager or the owner.',
      );
    }
  }

  private assertMayDecide(ctx: TenantContext): void {
    if (!MAY_DECIDE.includes((ctx.activeRole ?? '') as (typeof MAY_DECIDE)[number])) {
      throw new ForbiddenException(
        'Approving or rejecting a claim commits the workshop to doing work for nothing, so ' +
          'it is the supervisor, the workshop manager or the owner. You can still record the ' +
          'claim and add notes to it.',
      );
    }
  }

  // ── policies ──────────────────────────────────────────────────────────────

  async listPolicies(ctx: TenantContext): Promise<WarrantyPolicy[]> {
    // 🔴 STAFF ONLY. `customer` is a real role inside this same
    // organisation and RLS cannot tell it apart from staff — see
    // `authz/workshop-roles.ts`. Their OWN records are a different query.
    assertWorkshopStaff(ctx, 'The workshop warranty policies');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT p.*, j.job_number, v.registration_number, c.display_name AS customer_name,
                (SELECT count(*) FROM warranty.claims cl WHERE cl.policy_id = p.id) AS claim_count
           FROM warranty.policies p
           LEFT JOIN repair.job_cards j ON j.id = p.job_card_id
           LEFT JOIN core.vehicles    v ON v.id = p.vehicle_id
           LEFT JOIN core.customers   c ON c.id = v.customer_id
          WHERE p.tenant_id = $1 AND p.organization_id = $2
          ORDER BY p.created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows.map((r) => this.decorate(r));
    });
  }

  async createPolicy(
    ctx: TenantContext,
    input: {
      jobCardId: string;
      coverSummary: string;
      expiresOn?: string;
      expiresAtOdometer?: number;
    },
  ): Promise<WarrantyPolicy> {
    this.assertMayRecord(ctx);

    // Checked here as well as by `chk_policy_has_a_limit`, so the person gets a
    // sentence naming the choice rather than a constraint name.
    if (!input.expiresOn && input.expiresAtOdometer === undefined) {
      throw new BadRequestException(
        'Give the warranty a limit: an end date, a mileage, or both. A policy with neither ' +
          'would cover this repair forever, which no workshop means.',
      );
    }

    const id = await this.db.withTenant(ctx, async (client) => {
      const job = await client.query<{ vehicle_id: string | null }>(
        `SELECT vehicle_id FROM repair.job_cards
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [input.jobCardId, ctx.tenantId, ctx.organizationId],
      );
      if (!job.rowCount) throw new NotFoundException('no such job card');

      const number = await this.nextNumber(client, ctx, 'WTY', 'warranty.policies', 'policy_number');

      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO warranty.policies
             (tenant_id, organization_id, job_card_id, vehicle_id, policy_number,
              cover_summary, expires_on, expires_at_odometer, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [ctx.tenantId, ctx.organizationId, input.jobCardId, job.rows[0]!.vehicle_id,
           number, input.coverSummary.trim(), input.expiresOn ?? null,
           input.expiresAtOdometer ?? null, ctx.userId],
        );
        return created.rows[0]!.id;
      } catch (error) {
        // `uq_policy_job` — one live warranty per job. Two would leave two
        // different answers to "is this covered".
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(
            'This job card already has a warranty. Void that one first if its terms are wrong.',
          );
        }
        throw error;
      }
    });

    const all = await this.listPolicies(ctx);
    const created = all.find((p) => p.id === id);
    if (!created) throw new NotFoundException('policy could not be read back');
    return created;
  }

  // ── claims ────────────────────────────────────────────────────────────────

  async listClaims(ctx: TenantContext, opts: { status?: string } = {}): Promise<WarrantyClaim[]> {
    // 🔴 STAFF ONLY. `customer` is a real role inside this same
    // organisation and RLS cannot tell it apart from staff — see
    // `authz/workshop-roles.ts`. Their OWN records are a different query.
    assertWorkshopStaff(ctx, 'The workshop warranty claims');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT cl.*, p.policy_number, v.registration_number, c.display_name AS customer_name
           FROM warranty.claims cl
           JOIN warranty.policies p ON p.id = cl.policy_id
           LEFT JOIN core.vehicles  v ON v.id = p.vehicle_id
           LEFT JOIN core.customers c ON c.id = v.customer_id
          WHERE cl.tenant_id = $1 AND cl.organization_id = $2
            AND ($3::text IS NULL OR cl.status = $3)
          ORDER BY
            -- Anything still open first: a queue ordered purely by date buries
            -- the claim somebody is waiting on under last month's settled ones.
            CASE WHEN cl.status IN ('submitted','assessing') THEN 0 ELSE 1 END,
            cl.reported_at DESC`,
        [ctx.tenantId, ctx.organizationId, opts.status ?? null],
      );

      const claims = rows.rows.map((r) => this.toClaim(r));

      const events = await client.query<Record<string, unknown>>(
        `SELECT e.*, u.display_name AS decided_by_name
           FROM warranty.claim_events e
           LEFT JOIN identity.users u ON u.id = e.decided_by
          WHERE e.tenant_id = $1 AND e.organization_id = $2
          ORDER BY e.decided_at ASC`,
        [ctx.tenantId, ctx.organizationId],
      );
      const byClaim = new Map<string, WarrantyClaim['events']>();
      for (const e of events.rows) {
        const list = byClaim.get(e.claim_id as string) ?? [];
        list.push({
          id: e.id as string,
          eventKind: e.event_kind as string,
          reason: (e.reason as string) ?? null,
          note: (e.note as string) ?? null,
          decidedByName: (e.decided_by_name as string) ?? null,
          decidedAt: e.decided_at as string,
        });
        byClaim.set(e.claim_id as string, list);
      }
      for (const claim of claims) claim.events = byClaim.get(claim.id) ?? [];
      return claims;
    });
  }

  async recordClaim(
    ctx: TenantContext,
    input: { policyId: string; reportedFault: string; odometerReading?: number },
  ): Promise<WarrantyClaim> {
    this.assertMayRecord(ctx);

    const id = await this.db.withTenant(ctx, async (client) => {
      const policy = await client.query<{ status: string; expires_on: string | null }>(
        `SELECT status, expires_on FROM warranty.policies
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [input.policyId, ctx.tenantId, ctx.organizationId],
      );
      if (!policy.rowCount) throw new NotFoundException('no such warranty');
      if (policy.rows[0]!.status === 'voided') {
        throw new ConflictException('That warranty was voided, so there is nothing to claim on.');
      }

      // ⚠️ AN EXPIRED POLICY STILL ACCEPTS A CLAIM. Whether cover had run out is
      // the ASSESSMENT's job, and refusing at the counter would mean a customer
      // in dispute has no record that they ever asked. Recording it and
      // rejecting it with a reason is honest; turning them away silently is not.
      const number = await this.nextNumber(client, ctx, 'WCL', 'warranty.claims', 'claim_number');

      const created = await client.query<{ id: string }>(
        `INSERT INTO warranty.claims
           (tenant_id, organization_id, policy_id, claim_number, reported_fault,
            odometer_reading, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, input.policyId, number,
         input.reportedFault.trim(), input.odometerReading ?? null, ctx.userId],
      );

      // The opening event, so the history is complete from the first moment
      // rather than starting at the first decision.
      await client.query(
        `INSERT INTO warranty.claim_events
           (tenant_id, organization_id, claim_id, event_kind, decided_by)
         VALUES ($1,$2,$3,'submitted',$4)`,
        [ctx.tenantId, ctx.organizationId, created.rows[0]!.id, ctx.userId],
      );
      return created.rows[0]!.id;
    });

    const all = await this.listClaims(ctx);
    const created = all.find((c) => c.id === id);
    if (!created) throw new NotFoundException('claim could not be read back');
    return created;
  }

  /**
   * Record a decision.
   *
   * ⚠️ IT INSERTS AN EVENT AND NEVER UPDATES THE CLAIM'S STATUS DIRECTLY. The
   * trigger moves the cache; the event IS the record. Writing the status here as
   * well would create a second source of truth that could disagree with the
   * history the customer is shown.
   */
  async decide(
    ctx: TenantContext,
    claimId: string,
    input: { eventKind: string; reason?: string; note?: string },
  ): Promise<WarrantyClaim> {
    // A NOTE is not a decision, so anyone who may record a claim may add one.
    if (input.eventKind === 'note') this.assertMayRecord(ctx);
    else this.assertMayDecide(ctx);

    if (input.eventKind === 'rejected' && !input.reason?.trim()) {
      throw new BadRequestException(
        'Say why the claim is being rejected. It is the first thing the customer will ask, ' +
          'and the reason is kept permanently with the decision.',
      );
    }

    await this.db.withTenant(ctx, async (client) => {
      const claim = await client.query<{ status: string }>(
        `SELECT status FROM warranty.claims
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [claimId, ctx.tenantId, ctx.organizationId],
      );
      if (!claim.rowCount) throw new NotFoundException('no such claim');

      const current = claim.rows[0]!.status;
      if (input.eventKind !== 'note' && (current === 'completed' || current === 'withdrawn')) {
        throw new ConflictException(
          `This claim is already ${current}. Its history cannot be changed — record a note ` +
            'if there is more to say, or raise a new claim.',
        );
      }

      await client.query(
        `INSERT INTO warranty.claim_events
           (tenant_id, organization_id, claim_id, event_kind, reason, note, decided_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ctx.tenantId, ctx.organizationId, claimId, input.eventKind,
         input.reason?.trim() ?? null, input.note?.trim() ?? null, ctx.userId],
      );
    });

    const all = await this.listClaims(ctx);
    const updated = all.find((c) => c.id === claimId);
    if (!updated) throw new NotFoundException('no such claim');
    return updated;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Whether the policy is in force TODAY.
   *
   * ⚠️ DERIVED AT READ TIME, NOT STORED. A stored `expired` flag is wrong the
   * moment the clock passes midnight and stays wrong until something writes to
   * the row — so a warranty would appear valid for however long nobody touched
   * it. `status` records what a PERSON did (voided it); expiry is arithmetic.
   *
   * Only the DATE limit is evaluated here. The odometer limit cannot be, because
   * it depends on the vehicle's mileage TODAY, which the workshop only learns
   * when the car comes back — the claim carries a reading and the assessor
   * compares it.
   */
  private decorate(r: Record<string, unknown>): WarrantyPolicy {
    const expiresOn = (r.expires_on as string) ?? null;
    const dateStillValid = expiresOn === null || new Date(expiresOn) >= new Date(new Date().toDateString());
    return {
      id: r.id as string,
      policyNumber: r.policy_number as string,
      jobCardId: r.job_card_id as string,
      jobNumber: (r.job_number as string) ?? null,
      vehicleId: (r.vehicle_id as string) ?? null,
      registrationNumber: (r.registration_number as string) ?? null,
      customerName: (r.customer_name as string) ?? null,
      coverSummary: r.cover_summary as string,
      startsOn: r.starts_on as string,
      expiresOn,
      expiresAtOdometer: r.expires_at_odometer === null ? null : Number(r.expires_at_odometer),
      status: r.status as string,
      voidReason: (r.void_reason as string) ?? null,
      isCurrentlyInForce: r.status === 'active' && dateStillValid,
      claimCount: Number(r.claim_count ?? 0),
      createdAt: r.created_at as string,
    };
  }

  private toClaim(r: Record<string, unknown>): WarrantyClaim {
    return {
      id: r.id as string,
      claimNumber: r.claim_number as string,
      policyId: r.policy_id as string,
      policyNumber: r.policy_number as string,
      registrationNumber: (r.registration_number as string) ?? null,
      customerName: (r.customer_name as string) ?? null,
      reportedFault: r.reported_fault as string,
      reportedAt: r.reported_at as string,
      odometerReading: r.odometer_reading === null ? null : Number(r.odometer_reading),
      status: r.status as string,
      remedialJobCardId: (r.remedial_job_card_id as string) ?? null,
    };
  }

  /** Locks the organisation row so two desks cannot allocate the same number. */
  private async nextNumber(
    client: { query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    ctx: TenantContext,
    prefix: string,
    table: 'warranty.policies' | 'warranty.claims',
    column: 'policy_number' | 'claim_number',
  ): Promise<string> {
    // Table and column come from a closed set at the call sites and are never
    // caller text — the same rule `MediaService.OWNER_TABLES` follows.
    await client.query(`SELECT 1 FROM identity.organizations WHERE id = $1 FOR UPDATE`, [
      ctx.organizationId,
    ]);
    const rows = await client.query<{ next: string }>(
      `SELECT COALESCE(max(substring(${column} from '[0-9]+$')::bigint), 0) + 1 AS next
         FROM ${table} WHERE organization_id = $1 AND ${column} LIKE $2`,
      [ctx.organizationId, `${prefix}-%`],
    );
    return `${prefix}-${String(rows.rows[0]!.next).padStart(6, '0')}`;
  }
}
