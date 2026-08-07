import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import type { CreateServiceRequestBody, DecideServiceRequestBody } from './reception.schemas';

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
  constructor(private readonly db: DatabaseService) {}

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
      const rows = await client.query<{ id: string }>(
        `UPDATE reception.service_requests
            SET status = $4,
                decline_reason = $5,
                decided_by = $6,
                decided_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'new'
        RETURNING id`,
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
}
