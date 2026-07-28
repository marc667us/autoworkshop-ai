import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  operatingHours: string | null;
  status: string;
  createdAt: string;
}

/**
 * Roles permitted to create a branch.
 *
 * `07.txt` part 2 §46 puts Branches under the Workshop Owner's WORKSHOP
 * MANAGEMENT group, and §50 gives the owner "full workshop governance". A
 * manager has "daily operational control", which is not the same as creating
 * legal operating locations, so the manager is deliberately absent.
 */
const CAN_CREATE_BRANCH = new Set([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
]);

/**
 * Branch domain service — T-0003.
 *
 * Follows `OrganizationService` exactly, for the same reason: a REST controller
 * and an MCP tool are both thin callers of this one service, so the identical
 * rules apply whether the caller is a human or an agent (`0.txt` §13, §26).
 *
 * `identity.branches` carries `tenant_id` and is under `ENABLE` + `FORCE ROW
 * LEVEL SECURITY`, so the database is the final backstop. Queries here are
 * deliberately written WITHOUT a hand-added tenant filter, exactly as
 * `OrganizationService` does — the isolation proof in
 * `tests/tenant-isolation/` depends on those queries being bare, because a
 * query that filters in application code proves nothing about the policy.
 */
@Injectable()
export class BranchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Branches in the active tenant, optionally narrowed to one organization. */
  async list(ctx: TenantContext, organizationId?: string): Promise<Branch[]> {
    return this.db.withTenant(ctx, async (client) => {
      const res = organizationId
        ? await client.query(
            `SELECT id, organization_id, name, location, operating_hours, status, created_at
               FROM identity.branches
              WHERE organization_id = $1 AND tenant_id = $2
              ORDER BY name`,
            [organizationId, ctx.tenantId],
          )
        : await client.query(
            `SELECT id, organization_id, name, location, operating_hours, status, created_at
               FROM identity.branches
              WHERE tenant_id = $1
              ORDER BY name`,
            [ctx.tenantId],
          );
      return res.rows.map(this.toDomain);
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Branch> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, organization_id, name, location, operating_hours, status, created_at
           FROM identity.branches WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // 404 and not 403, deliberately: a branch in another tenant is
        // invisible under RLS, and answering 403 would confirm the id exists,
        // turning the status code into a cross-tenant existence oracle.
        throw new NotFoundException('branch not found');
      }
      return this.toDomain(row);
    });
  }

  async create(
    ctx: TenantContext,
    input: {
      organizationId: string;
      name: string;
      location?: string;
      operatingHours?: string;
    },
  ): Promise<Branch> {
    if (!CAN_CREATE_BRANCH.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not create a branch`);
    }

    return this.db.withTenant(ctx, async (client) => {
      // The parent organization must belong to the ACTIVE TENANT, and nothing
      // else in the stack checks that.
      //
      // The foreign key references `identity.organizations(id)` alone — a
      // foreign key cannot carry a tenant predicate. RLS `WITH CHECK` validates
      // the `tenant_id` of the row being INSERTED, not the tenant of the row it
      // points at. So `tenant_id = <A>` with `organization_id = <an org in
      // tenant B>` satisfies the FK and the policy simultaneously, and creates
      // a branch filed under tenant A that belongs to someone else's
      // organization.
      //
      // The lookup below closes it precisely because `identity.organizations`
      // IS under FORCE RLS: an organization in another tenant is invisible
      // here, so it returns no row. The check is the join, not a comparison we
      // could get wrong.
      const parent = await client.query(
        `SELECT 1 FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (parent.rows.length === 0) {
        // 404, not 403 — same non-oracle reasoning as findById.
        throw new NotFoundException('organization not found');
      }

      // `tenant_id` comes from the RESOLVED context, never from the caller's
      // body. The RLS `WITH CHECK` clause would reject a mismatched value
      // anyway, which is the point of having both layers.
      const res = await client.query(
        `INSERT INTO identity.branches
           (tenant_id, organization_id, name, location, operating_hours, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id, name, location, operating_hours, status, created_at`,
        [
          ctx.tenantId,
          input.organizationId,
          input.name,
          input.location ?? null,
          input.operatingHours ?? null,
          ctx.userId,
        ],
      );
      const row = res.rows[0];

      // Same transaction as the insert: the change and its audit row commit or
      // roll back together.
      await this.audit.write(client, ctx, {
        action: 'branch.created',
        resourceType: 'branch',
        resourceId: row.id,
        detail: { name: input.name, organizationId: input.organizationId },
      });

      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    organization_id: string;
    name: string;
    location: string | null;
    operating_hours: string | null;
    status: string;
    created_at: Date;
  }): Branch => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    location: row.location,
    operatingHours: row.operating_hours,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}
