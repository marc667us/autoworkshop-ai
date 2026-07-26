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
      `SELECT u.id            AS user_id,
              m.tenant_id     AS tenant_id,
              m.organization_id,
              m.branch_id,
              m.role_name,
              m.status
         FROM identity.users u
    LEFT JOIN identity.memberships m ON m.user_id = u.id
        WHERE u.keycloak_subject = $1
          AND u.status = 'active'`,
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
