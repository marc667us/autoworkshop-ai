import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';

export interface Organization {
  id: string;
  name: string;
  orgType: string;
  status: string;
  createdAt: string;
}

/** Roles permitted to create an organization. */
// 085 added `insurance_owner` and `towing_owner`, mirroring `supplier_owner`
// and `fleet_administrator` exactly. The org admin of an insurer or a recovery
// firm has the same standing inside its own tenant as the supplier and fleet
// admins have inside theirs, and omitting them would have made "mirror the
// existing org admins" true in the grant path and false here.
const CAN_CREATE_ORG = new Set([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
  'insurance_owner',
  'towing_owner',
]);

/**
 * Organization domain service.
 *
 * Authoritative business rules live HERE, not in the controller and not in an
 * MCP tool. A REST controller and an MCP tool are both thin callers of this
 * same service, so the identical rules apply whether the caller is a human or
 * an AI agent (`0.txt` §13, §26).
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<Organization[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The organisations in this tenant');
    return this.db.withTenant(ctx, async (client) => {
      // CLAUDE.md §6 requires BOTH layers: the application filters, and RLS is
      // the backstop. This query used to be left bare with a comment claiming
      // the repository layer filtered it — there is no such layer, so RLS was
      // the only control.
      //
      // That was not merely a policy breach. The RLS policy reads
      // `is_platform_admin() OR tenant_id = current_tenant_id()`, so for a
      // platform administrator a bare query returns EVERY tenant's
      // organizations from an endpoint scoped to one. The explicit predicate is
      // what makes this endpoint mean the same thing for every role.
      const res = await client.query(
        `SELECT id, name, org_type, status, created_at
           FROM identity.organizations
          WHERE tenant_id = $1
          ORDER BY name`,
        [ctx.tenantId],
      );
      return res.rows.map(this.toDomain);
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Organization> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'This organisation');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, name, org_type, status, created_at
           FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // A row in another tenant is invisible under RLS, so this is a 404 and
        // not a 403 — deliberately. Returning 403 would confirm the id exists,
        // turning the error code into a cross-tenant existence oracle.
        throw new NotFoundException('organization not found');
      }
      return this.toDomain(row);
    });
  }

  async create(
    ctx: TenantContext,
    input: { name: string; orgType: string },
  ): Promise<Organization> {
    if (!CAN_CREATE_ORG.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not create an organization`,
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO identity.organizations (tenant_id, name, org_type, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, org_type, status, created_at`,
        [ctx.tenantId, input.name, input.orgType, ctx.userId],
      );
      const row = res.rows[0];

      // Same transaction as the insert: the change and its audit row commit or
      // roll back together.
      await this.audit.write(client, ctx, {
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: row.id,
        detail: { name: input.name, orgType: input.orgType },
      });

      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    name: string;
    org_type: string;
    status: string;
    created_at: Date;
  }): Organization => ({
    id: row.id,
    name: row.name,
    orgType: row.org_type,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}
