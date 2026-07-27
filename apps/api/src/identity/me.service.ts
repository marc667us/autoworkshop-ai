import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { permissionsForRole } from '../authz/permission-matrix';
import type { TenantContext } from '../tenancy/tenant-context';

export interface ViewerMembership {
  organizationId: string;
  organizationName: string;
  branchId: string | null;
  branchName: string | null;
  roleName: string;
}

export interface Viewer {
  userId: string;
  displayName: string;
  email: string;
  tenantId: string;
  organizationId: string;
  branchId: string | null;
  /** The ONE role active for this request, not the user's full role set. */
  activeRole: string;
  /** What that role may see. Derived server-side; never sent by the client. */
  permissions: readonly string[];
  /** Everything the org/branch switchers may offer (T-0016). */
  memberships: ViewerMembership[];
}

/**
 * The viewer contract — T-0005.
 *
 * This is the endpoint that ends `viewerGrants()`/`viewerRole()` being demo
 * data. Both currently return hardcoded arrays in the browser bundle; once the
 * Next apps hold a Keycloak session they call this instead, and every value
 * below is derived server-side from a validated token plus membership records.
 *
 * WHY PERMISSIONS ARE COMPUTED HERE AND NOT SENT BY THE CLIENT. `1.txt` §9:
 * the gateway must never trust an identifier supplied only by the client. The
 * role arrives from `TenantContext`, which `TenantGuard` resolved from the
 * token subject and the membership table — there is no request field that can
 * influence it. The permission list is then a pure function of that role.
 *
 * The response is a VIEW, not an authorization decision. A client that ignores
 * it and requests a gated route still meets the API's own role checks and RLS,
 * which deny independently (CLAUDE.md §8).
 */
@Injectable()
export class MeService {
  constructor(private readonly db: DatabaseService) {}

  async describe(ctx: TenantContext): Promise<Viewer> {
    return this.db.withTenant(ctx, async (client) => {
      // The profile, reached THROUGH memberships rather than from
      // `identity.users` directly — that table has no RLS, so a bare select
      // would cross tenants. Same rule as `UserService`; see its header.
      const profile = await client.query(
        `SELECT u.id, u.display_name, u.email
           FROM identity.memberships m
           JOIN identity.users u ON u.id = m.user_id
          WHERE u.id = $1
          LIMIT 1`,
        [ctx.userId],
      );

      // Memberships visible in the ACTIVE tenant, with the names the switchers
      // need. RLS scopes this to the current tenant; a user's memberships in
      // other tenants are deliberately not listed here, because switching
      // tenant is a re-authentication concern, not a dropdown.
      const memberships = await client.query(
        `SELECT m.organization_id,
                o.name        AS organization_name,
                m.branch_id,
                b.name        AS branch_name,
                m.role_name
           FROM identity.memberships m
           JOIN identity.organizations o ON o.id = m.organization_id
      LEFT JOIN identity.branches b      ON b.id = m.branch_id
          WHERE m.user_id = $1
            AND m.status = 'active'
          ORDER BY o.name, b.name NULLS FIRST`,
        [ctx.userId],
      );

      const row = profile.rows[0];

      return {
        userId: ctx.userId,
        // A viewer with a context but no readable profile row is a data fault,
        // not an auth fault: the guard already proved the identity. Degrade to
        // an honest placeholder rather than 500-ing the whole shell, which
        // would take out every page including the ones that need no profile.
        displayName: row?.display_name ?? 'Unknown user',
        email: row?.email ?? '',
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        activeRole: ctx.activeRole,
        permissions: permissionsForRole(ctx.activeRole),
        memberships: memberships.rows.map((m: {
          organization_id: string;
          organization_name: string;
          branch_id: string | null;
          branch_name: string | null;
          role_name: string;
        }) => ({
          organizationId: m.organization_id,
          organizationName: m.organization_name,
          branchId: m.branch_id,
          branchName: m.branch_name,
          roleName: m.role_name,
        })),
      };
    });
  }
}
