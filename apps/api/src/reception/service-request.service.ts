import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { ServiceRequestTriageAgent } from '../agents/service-request-triage.agent';
import type {
  ConvertServiceRequestBody,
  CreateServiceRequestBody,
  DecideServiceRequestBody,
} from './reception.schemas';
import { JobCardService } from '../repair/job-card.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * The customer's Request for Service — the owner's value chain, steps 4-7.
 *
 * The customer searches the PUBLIC mechanic directory, picks a workshop, and
 * asks it for help. What arrives at that workshop's reception is this record,
 * not a job card: see `058_service_requests.sql` for why those are different
 * things, and why a job card cannot express an unaccepted request from somebody
 * whose car is not on file anywhere.
 *
 * ⚠️ THE ORGANISATION IS THE ONE FIELD THAT NAMES SOMEWHERE ELSE. Everywhere
 * else in this API `ctx.organizationId` IS the row's organisation. Here the
 * customer is choosing, and is usually not a member of what they choose — which
 * is why the migration's INSERT policy deliberately does not constrain it, and
 * why its SELECT policy must distinguish "I wrote this" from "this was sent to
 * my workshop".
 */
export interface ServiceRequestRow {
  id: string;
  organizationId: string;
  organizationName: string;
  vehicleDescription: string;
  registrationNumber: string | null;
  complaint: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

const SELECT_COLUMNS = `
  sr.id, sr.organization_id, o.name AS organization_name,
  sr.vehicle_description, sr.registration_number, sr.complaint,
  sr.status, sr.decline_reason, sr.created_at, sr.decided_at`;

function toRow(r: Record<string, unknown>): ServiceRequestRow {
  return {
    id: r['id'] as string,
    organizationId: r['organization_id'] as string,
    organizationName: r['organization_name'] as string,
    vehicleDescription: r['vehicle_description'] as string,
    registrationNumber: (r['registration_number'] as string | null) ?? null,
    complaint: r['complaint'] as string,
    status: r['status'] as string,
    declineReason: (r['decline_reason'] as string | null) ?? null,
    createdAt: String(r['created_at']),
    decidedAt: r['decided_at'] === null ? null : String(r['decided_at']),
  };
}

@Injectable()
export class ServiceRequestService {
  constructor(
    private readonly db: DatabaseService,
    // Reused, NEVER re-implemented. Opening a job card allocates a job number,
    // sets the opening stage and writes the lifecycle history; a direct INSERT
    // here would produce a row that looks like a job card and is outside the
    // state machine every later screen assumes.
    private readonly jobCards: JobCardService,
    // Migration 060. Reception must HEAR about an intake, not discover it by
    // opening a screen.
    private readonly notifications: NotificationsService,
    // The triage agent. Called AFTER the transaction commits — see `create`.
    private readonly triage: ServiceRequestTriageAgent,
  ) {}

  /**
   * File a request at a chosen workshop.
   *
   * ⚠️ `requested_by` IS `ctx.userId`, NEVER THE BODY. The schema does not even
   * accept an author field, so there is nothing to forget to ignore. A
   * client-supplied author would let anybody file a request in another person's
   * name, and the workshop would ring the wrong person about a car that is not
   * theirs.
   */
  async create(ctx: TenantContext, input: CreateServiceRequestBody): Promise<ServiceRequestRow> {
    const created = await this.createInTransaction(ctx, input);

    // 🔴 THE AGENT RECEIVES THE REQUEST HERE — AFTER IT IS SAFELY COMMITTED.
    //
    // Owner, 2026-08-08: "AI agent must receive the request and used to on
    // interflow setup the customer request in the workshop and assign
    // technicians get job started."
    //
    // ⚠️ DELIBERATELY *NOT* INSIDE THE TRANSACTION ABOVE, unlike migration
    // 060's notification. The two look similar and need opposite treatment:
    //
    //   · the notification MUST be atomic with the request — a request that
    //     fails to reach reception must not exist;
    //   · the triage proposal must NOT be, because a model generation takes
    //     seconds and holding the customer's INSERT transaction open, with
    //     locks, while they watch a spinner is a bad trade for an opinion.
    //
    // A missing proposal costs reception a convenience. A failed POST costs the
    // workshop a customer. Those must not share a failure mode — so this cannot
    // throw, is not awaited, and reception can ask for a re-run at
    // `POST /agents/triage/service-request/:id` if the agent was down.
    this.triage.triageInBackground(ctx, created.id, {
      complaint: input.complaint,
      vehicleDescription: input.vehicleDescription,
      registrationNumber: input.registrationNumber,
    });

    return created;
  }

  private async createInTransaction(
    ctx: TenantContext,
    input: CreateServiceRequestBody,
  ): Promise<ServiceRequestRow> {
    return this.db.withTenant(ctx, async (client) => {
      // The chosen workshop must be a real organisation IN THIS TENANT. The FK
      // alone would happily accept an organisation from ANOTHER tenant, so a
      // request could be addressed into a stranger's reception — the isolation
      // defect migration 054 exists to prevent, arriving through a new door.
      const org = await client.query(
        `SELECT 1 FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (org.rowCount === 0) {
        throw new NotFoundException('That workshop was not found.');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reception.service_requests
           (tenant_id, organization_id, requested_by, vehicle_id,
            vehicle_description, registration_number, complaint, preferred_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          ctx.tenantId,
          input.organizationId,
          ctx.userId,
          input.vehicleId ?? null,
          input.vehicleDescription.trim(),
          input.registrationNumber ?? null,
          input.complaint.trim(),
          input.preferredContact ?? null,
        ],
      );
      // 🔴 THE STEP THAT MAKES RECEPTION HEAR ABOUT IT (migration 060).
      //
      // The owner's value chain says the request "is received at the reception".
      // Until now that meant a row appeared in a list nobody was watching: the
      // product had no sender of any kind, so an intake could sit unseen until
      // somebody happened to open the inbox screen.
      //
      // ⚠️ IN THE SAME TRANSACTION as the request itself, deliberately. If the
      // request commits, the notification it owes commits with it; neither can
      // exist without the other. Delivery is a separate concern and happens in
      // the drain — a dead mail relay must never stop a customer filing a
      // request.
      //
      // ⚠️ The dedupe prefix is the REQUEST id, so a retried submission cannot
      // ring reception twice for one car.
      await this.notifications.notifyWorkshopStaff(client, ctx, {
        organizationId: input.organizationId,
        event: 'service_request.created',
        subject: 'New service request',
        body:
          `A customer has asked for service.\n\n` +
          `Vehicle: ${input.vehicleDescription.trim()}\n` +
          `Complaint: ${input.complaint.trim()}\n\n` +
          `Open Reception → Service requests to accept or decline it.`,
        resourceType: 'service_request',
        resourceId: inserted.rows[0]!.id,
        dedupePrefix: `service_request.created:${inserted.rows[0]!.id}`,
      });

      const created = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM reception.service_requests sr
           JOIN identity.organizations o ON o.id = sr.organization_id
          WHERE sr.id = $1`,
        [inserted.rows[0]!.id],
      );
      return toRow(created.rows[0]! as Record<string, unknown>);
    });
  }

  /** The caller's OWN requests, across every workshop they have asked. */
  async listMine(ctx: TenantContext): Promise<ServiceRequestRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM reception.service_requests sr
           JOIN identity.organizations o ON o.id = sr.organization_id
          WHERE sr.requested_by = $1
          ORDER BY sr.created_at DESC`,
        [ctx.userId],
      );
      return rows.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * Reception's inbox for THIS workshop.
   *
   * ⚠️ REFUSED FOR A CUSTOMER, EXPLICITLY. A customer holds a real membership in
   * the workshop's organisation, so an organisation predicate ALONE would hand
   * them every other customer's request. That is exactly the shape of the
   * 45-screen leak — an org predicate mistaken for an authorization one — and it
   * is why the RLS SELECT policy carries the same role clause independently.
   */
  async listForWorkshop(ctx: TenantContext, status?: string): Promise<ServiceRequestRow[]> {
    if (ctx.activeRole === 'customer') {
      throw new ForbiddenException('A customer cannot read a workshop inbox.');
    }
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM reception.service_requests sr
           JOIN identity.organizations o ON o.id = sr.organization_id
          WHERE sr.tenant_id = $1 AND sr.organization_id = $2
            AND ($3::text IS NULL OR sr.status = $3)
          ORDER BY sr.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, status ?? null],
      );
      return rows.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * Accept or decline an incoming request.
   *
   * A customer may not decide their own request — checked here AND in the RLS
   * UPDATE policy, because a rule enforced in one layer only is a rule a new
   * caller can arrive without.
   */
  async decide(
    ctx: TenantContext,
    id: string,
    input: DecideServiceRequestBody,
  ): Promise<ServiceRequestRow> {
    if (ctx.activeRole === 'customer') {
      throw new ForbiddenException('A customer cannot decide a service request.');
    }
    if (input.status === 'declined' && !input.declineReason) {
      // Refused here as well as by `ck_service_request_declined`, so the person
      // reads a sentence they can act on rather than a constraint violation.
      throw new ForbiddenException('Say why the request is being declined.');
    }
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<{ id: string; requested_by: string }>(
        `UPDATE reception.service_requests
            SET status = $4,
                decline_reason = $5,
                decided_by = $6,
                decided_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'new'
        -- requested_by comes back from the UPDATE rather than a second SELECT:
        -- it is the person who must be TOLD, and reading it separately would be
        -- a second answer to "whose request is this" that could disagree.
        RETURNING id, requested_by`,
        [
          id, ctx.tenantId, ctx.organizationId, input.status,
          input.declineReason ?? null, ctx.userId,
        ],
      );
      if (rows.rowCount === 0) {
        // Covers all three cases: not this workshop's, already decided, or
        // absent. Deliberately ONE message — distinguishing them would confirm
        // the existence of another workshop's request to someone who cannot
        // read it.
        throw new NotFoundException('That request is no longer awaiting a decision.');
      }

      // 🔴 THE CUSTOMER LEARNS WHAT HAPPENED (migration 060). Without this the
      // decision is visible only to whoever thinks to re-open the page they
      // submitted — and a DECLINE that nobody is told about is the worst case:
      // the customer waits for a workshop that has already said no.
      //
      // The decline reason is included because a refusal with no reason sends
      // them back to the directory knowing nothing they did not know before.
      await this.notifications.notifyUser(client, ctx, {
        recipientId: rows.rows[0]!.requested_by,
        event: 'service_request.decided',
        subject:
          input.status === 'accepted'
            ? 'Your service request was accepted'
            : 'Your service request was declined',
        body:
          input.status === 'accepted'
            ? 'The workshop has accepted your request and will be in touch about next steps.'
            : `The workshop declined your request.\n\nReason: ${input.declineReason ?? 'not given'}\n\n` +
              'You can choose another workshop from the directory.',
        resourceType: 'service_request',
        resourceId: id,
        // The STATUS is in the key, so accepting and later declining are two
        // different events — while a retried decision of the SAME kind is one.
        dedupePrefix: `service_request.decided:${id}:${input.status}`,
      });

      const after = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM reception.service_requests sr
           JOIN identity.organizations o ON o.id = sr.organization_id
          WHERE sr.id = $1`,
        [id],
      );
      return toRow(after.rows[0]! as Record<string, unknown>);
    });
  }

  /**
   * Turn an accepted request into a job card — the owner's value chain, step 8.
   *
   * ── 🔴 CLAIM FIRST, THEN OPEN THE CARD. THE ORDER IS THE CORRECTNESS. ─────
   *
   * The obvious sequence — read the status, open the job card, mark the request
   * converted — is CHECK-THEN-ACT across three separate transactions, because
   * `JobCardService.create` owns its own (it must: it allocates a job number and
   * writes lifecycle history). Two receptionists, or two clicks on a slow
   * connection, both read `accepted`, both open a job card, and one real
   * customer ends up with two. Codex caught that before it reached production.
   *
   * So this claims the row FIRST with a single conditional UPDATE
   * `accepted -> converting`. Postgres serialises that write, so exactly one
   * caller sees `rowCount === 1` and only that caller opens a card. The loser is
   * told plainly, having created nothing.
   *
   * ⚠️ AND THE CLAIM IS RELEASED IF THE CARD FAILS. Without that, a transient
   * failure would strand the request in `converting` for ever with no way back —
   * trading a duplicate-work bug for a stuck-request bug. `converting` is
   * therefore a state the system passes THROUGH, never one it settles in.
   */
  async convert(
    ctx: TenantContext,
    id: string,
    input: ConvertServiceRequestBody,
  ): Promise<{ requestId: string; jobCardId: string; jobNumber: string }> {
    if (ctx.activeRole === 'customer') {
      throw new ForbiddenException('A customer cannot convert a service request.');
    }

    // THE CLAIM. `status = 'accepted'` is required, not merely `<> converted`:
    // a request must be accepted before it becomes work, or the triage step the
    // whole inbox exists for is skippable. (Codex, MEDIUM.)
    const claimed = await this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<{ complaint: string }>(
        `UPDATE reception.service_requests
            SET status = 'converting'
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'accepted'
        RETURNING complaint`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      return rows.rows[0] ?? null;
    });

    if (!claimed) {
      // One message for every reason — not accepted yet, already converting,
      // already converted, declined, or another workshop's. Distinguishing them
      // would confirm the existence of a request the caller may not read.
      throw new ConflictException(
        'That request is not ready to convert. It may already have been converted, or it has not been accepted yet.',
      );
    }

    let card: { id: string; jobNumber: string };
    try {
      card = await this.jobCards.create(ctx, {
        vehicleId: input.vehicleId,
        // ⚠️ THE STORED COMPLAINT, returned by the claim itself — never the
        // request body. The customer's own words are what the job card must
        // carry, and `ConvertServiceRequestBody` does not accept a complaint at
        // all, so reception cannot rewrite what was reported on the way through.
        complaint: claimed.complaint,
        priority: input.priority,
        // ⚠️ PASSED STRAIGHT THROUGH, AND VALIDATED ONE LAYER DOWN — not here.
        // `JobCardService.create` refuses a customer outright and refuses an id
        // that is not an active `technician` of THIS organisation. Re-checking
        // in this file would be a second authority that can drift from the
        // first; the reason this line exists at all is that the value was being
        // DROPPED, not that it was unchecked.
        //
        // A refusal from there throws, and the `catch` below RELEASES THE CLAIM
        // — so a bad technician id leaves the request `accepted` and reception
        // can try again, rather than stranding it in `converting` where no
        // screen offers a way out.
        assignedTechnicianId: input.assignedTechnicianId,
      });
    } catch (error) {
      // RELEASE THE CLAIM. The card was not opened, so the request must go back
      // to where reception can act on it again rather than sit in a state no
      // screen offers a way out of.
      await this.db
        .withTenant(ctx, async (client) => {
          await client.query(
            `UPDATE reception.service_requests
                SET status = 'accepted'
              WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
                AND status = 'converting'`,
            [id, ctx.tenantId, ctx.organizationId],
          );
        })
        // Swallowed deliberately: the ORIGINAL failure is the one worth
        // reporting, and rethrowing from the cleanup would replace a useful
        // message ("that vehicle is not yours") with a confusing one.
        .catch(() => undefined);
      throw error;
    }

    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `UPDATE reception.service_requests
            SET status = 'converted',
                converted_job_card_id = $4,
                decided_by = COALESCE(decided_by, $5),
                decided_at = COALESCE(decided_at, now())
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'converting'`,
        [id, ctx.tenantId, ctx.organizationId, card.id, ctx.userId],
      );
    });

    return { requestId: id, jobCardId: card.id, jobNumber: card.jobNumber };
  }
}
