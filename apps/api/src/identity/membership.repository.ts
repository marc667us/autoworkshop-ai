import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ValidatedMembership } from '../tenancy/tenant-context';

/**
 * Membership lookup — the source of truth for what a user may access.
 *
 * This runs WITHOUT a tenant context on purpose: it is the query that
 * *establishes* which tenants a user belongs to, so it cannot itself be scoped
 * to one. It is therefore keyed strictly on the Keycloak subject taken from a
 * validated token signature, and returns nothing else.
 *
 * This is the one place a tenant boundary is crossed, which is exactly why it
 * is small, parameterised, and does not accept a tenant id from anywhere.
 *
 * IT MUST GO THROUGH `identity.memberships_for_subject()` (migration 003), NOT
 * a plain SELECT. `identity.memberships` is under ENABLE + FORCE RLS, and with
 * no tenant context its policy evaluates `tenant_id = NULL`, which hides every
 * row. Measured on the live database as `autoworkshop_app`: 1 membership
 * present, 0 visible, and the bootstrap query returning the user with a NULL
 * tenant. That returned an empty membership list for every user alive —
 * authorization failing closed for everyone, with the whole test suite green.
 *
 * The SECURITY DEFINER function is the tenant-boundary crossing, and it is
 * about ten auditable lines. Reverting to a direct query reintroduces the
 * outage silently, because nothing in unit tests connects as the app role.
 */
@Injectable()
export class MembershipRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByKeycloakSubject(subject: string): Promise<{
    userId: string;
    memberships: ValidatedMembership[];
  } | null> {
    const rows = await this.db.queryWithoutTenant<{
      user_id: string;
      tenant_id: string;
      organization_id: string;
      branch_id: string | null;
      role_name: string;
      status: 'active' | 'suspended' | 'revoked';
    }>(
      `SELECT user_id, tenant_id, organization_id, branch_id, role_name, status
         FROM identity.memberships_for_subject($1)`,
      [subject],
    );

    if (rows.length === 0) return null;

    const userId = rows[0]!.user_id;
    const memberships = rows
      .filter((r) => r.tenant_id !== null)
      .map((r) => ({
        tenantId: r.tenant_id,
        organizationId: r.organization_id,
        branchId: r.branch_id,
        roleName: r.role_name,
        status: r.status,
      }));

    return { userId, memberships };
  }
}
