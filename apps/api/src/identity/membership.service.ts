import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

export interface Membership {
  id: string;
  organizationId: string;
  branchId: string | null;
  userId: string;
  roleName: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
}

/**
 * Roles permitted to grant or withdraw a membership.
 *
 * Deliberately the narrowest list in the identity module. A membership IS the
 * authority — PLAN_EXTENSION_v1 §2.1: "Authority derives from membership and
 * role, never from the account type claim itself." Whoever can mint one can
 * mint access, so this is the privilege-escalation surface of the whole
 * platform and it is not shared with operational roles.
 *
 * `07.txt` part 2 §3 assigns roles and approval limits at INVITATION time, and
 * §50 gives only the owner "full workshop governance, staff ... access". The
 * manager, who has "daily operational control", is excluded on purpose.
 */
const CAN_GRANT_MEMBERSHIP = new Set([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
]);

/**
 * Roles a membership may confer.
 *
 * An allow-list, not free text. `role_name` is a plain `TEXT` column with no
 * database CHECK, so without this the grant endpoint would accept any string —
 * including one that a future authorization rule happens to treat as
 * privileged. An unconstrained role name is a privilege-escalation hole that
 * types cannot catch.
 *
 * The eight workshop roles are `07.txt` part 2 §50 verbatim.
 */
const GRANTABLE_ROLES = new Set([
  // 07 pt2 §50 — workshop
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'workshop_supervisor',
  'technician',
  'storekeeper',
  'quality_control_inspector',
  'cashier',
  // other workspaces
  'supplier_owner',
  'fleet_administrator',
  'insurance_assessor',
  'towing_operator',
  'customer',
]);

/**
 * Membership domain service — T-0003.
 *
 * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
 * SECURITY`, so cross-tenant reads fail closed at the database. The rules that
 * RLS cannot express — who may grant, which roles exist, and that nobody may
 * quietly widen their own access — live here.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
    return this.db.withTenant(ctx, async (client) => {
      // CLAUDE.md §6: the application filters AND RLS backstops it. Seeded
      // rather than appended, so the tenant predicate cannot go missing when
      // no other filter is supplied -- and so a platform administrator, whom
      // the RLS policy permits across tenants, still gets the ONE tenant this
      // request resolved to.
      const values: unknown[] = [ctx.tenantId];
      const where: string[] = ['tenant_id = $1'];
      if (filter.userId) {
        values.push(filter.userId);
        where.push(`user_id = $${values.length}`);
      }
      if (filter.organizationId) {
        values.push(filter.organizationId);
        where.push(`organization_id = $${values.length}`);
      }
      const res = await client.query(
        `SELECT id, organization_id, branch_id, user_id, role_name, status, created_at
           FROM identity.memberships
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY created_at`,
        values,
      );
      return res.rows.map(this.toDomain);
    });
  }

  /**
   * Grant a membership — the platform's privilege-granting operation.
   *
   * `07.txt` part 2 §3 (staff invitation): role and approval limits are set at
   * invitation. §50's closing rule governs the result: "No user shall receive
   * functions outside the user's approved role and branch."
   */
  async grant(
    ctx: TenantContext,
    input: {
      userId: string;
      organizationId: string;
      branchId?: string | null;
      roleName: string;
    },
  ): Promise<Membership> {
    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not grant a membership`,
      );
    }
    if (!GRANTABLE_ROLES.has(input.roleName)) {
      // Names the constraint, not the valid set: enumerating grantable roles in
      // an error message hands a caller the platform's authorization taxonomy,
      // which is the disclosure the catch-all route was already fixed to avoid.
      throw new BadRequestException('unknown role');
    }

    return this.db.withTenant(ctx, async (client) => {
      // The organization must belong to the ACTIVE TENANT, and the branch (if
      // given) must belong to that organization. Nothing else in the stack
      // checks either of these.
      //
      // The foreign keys reference `identity.organizations(id)` and
      // `identity.branches(id)` by id alone — a foreign key cannot carry a
      // tenant predicate — and RLS `WITH CHECK` validates the `tenant_id` of
      // the row being INSERTED, not the tenant of the rows it points at. So
      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
      // satisfies the FK and the policy at once. On the platform's
      // privilege-GRANTING operation, that is a membership filed under one
      // tenant and pointing into another's organization.
      //
      // Both lookups work because those tables are under FORCE RLS: a row in
      // another tenant is simply invisible here and returns nothing.
      const org = await client.query(
        `SELECT 1 FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (org.rows.length === 0) throw new NotFoundException('organization not found');

      if (input.branchId) {
        // Also asserts the branch belongs to THIS organization — a branch from
        // a sibling organization in the same tenant would pass a bare
        // existence check while scoping the membership to the wrong site,
        // which §50's "approved role and branch" rule forbids.
        const branch = await client.query(
          `SELECT 1 FROM identity.branches
              WHERE id = $1 AND organization_id = $2 AND tenant_id = $3`,
          [input.branchId, input.organizationId, ctx.tenantId],
        );
        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
      }

      const res = await client.query(
        `INSERT INTO identity.memberships
           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
        [
          // From the resolved context, never the request body. RLS `WITH CHECK`
          // would reject a mismatch anyway — both layers, by design.
          ctx.tenantId,
          input.organizationId,
          input.branchId ?? null,
          input.userId,
          input.roleName,
          ctx.userId,
        ],
      );

      const row = res.rows[0];
      if (!row) {
        // The unique constraint fired: this exact grant already exists. Report
        // it as a conflict rather than silently returning success, so an
        // "invitation" that changed nothing cannot read as one that did.
        throw new BadRequestException('membership already exists');
      }

      await this.audit.write(client, ctx, {
        action: 'membership.granted',
        resourceType: 'membership',
        resourceId: row.id,
        detail: {
          userId: input.userId,
          organizationId: input.organizationId,
          branchId: input.branchId ?? null,
          roleName: input.roleName,
        },
      });

      return this.toDomain(row);
    });
  }

  /**
   * Suspend or revoke a membership — withdrawing access.
   *
   * Status only ever moves toward LESS access. Re-granting is a new grant, with
   * its own audit row, rather than a status flip: the audit trail for approvals
   * and access is append-only per CLAUDE.md, and a reversible toggle would make
   * "was this person ever revoked?" unanswerable.
   */
  async withdraw(
    ctx: TenantContext,
    id: string,
    status: 'suspended' | 'revoked',
  ): Promise<Membership> {
    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not withdraw a membership`,
      );
    }

    // Validate the target status AT RUNTIME. The parameter's union type is
    // erased at compile time, and the controller passes the request body
    // straight through, so `{ "status": "active" }` reached this method as a
    // string the database's CHECK constraint happily accepts — turning a
    // withdrawal into a silent no-op that still wrote an audit row reading
    // `membership.active`, an action this service never performs. Any other
    // string produced a constraint violation and a 500 where a 400 was owed.
    //
    // The check belongs HERE and not only in the controller because an MCP tool
    // calls this service directly, without passing through any controller. A
    // rule enforced only at the HTTP edge is not enforced for agents — which is
    // the whole premise of the AI boundary (`0.txt` §13, §26).
    if (status !== 'suspended' && status !== 'revoked') {
      throw new BadRequestException('status must be suspended or revoked');
    }

    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE identity.memberships
            SET status = $2, updated_at = now(), updated_by = $3
          WHERE id = $1
            AND status = 'active'
            AND tenant_id = $4
        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
        [id, status, ctx.userId, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // Either it is not in this tenant (RLS hid it) or it was not active.
        // One message for both, so the response cannot be used to probe which.
        throw new NotFoundException('active membership not found');
      }

      await this.audit.write(client, ctx, {
        action: `membership.${status}`,
        resourceType: 'membership',
        resourceId: row.id,
        detail: { userId: row.user_id, roleName: row.role_name },
      });

      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    organization_id: string;
    branch_id: string | null;
    user_id: string;
    role_name: string;
    status: Membership['status'];
    created_at: Date;
  }): Membership => ({
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    userId: row.user_id,
    roleName: row.role_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}
