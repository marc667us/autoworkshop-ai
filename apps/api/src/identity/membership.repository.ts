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

  /**
   * SIGN-UP — a validated Keycloak subject becomes an application user.
   *
   * Owner instruction 2026-08-03: "users must sign up via kc". Keycloak creates
   * the account; this is what makes it usable. Without it a person who signs up
   * holds a perfectly valid token and is refused by BOTH guards with "no
   * application user for this identity" — which reads like an auth failure and
   * is really a missing row.
   *
   * ⚠️ THIS GRANTS NOTHING, and the whole safety argument rests on that. The
   * new user has no membership, so `resolveTenantContext` still refuses every
   * workshop route and `withUser` leaves `app.tenant_id` unset, which makes
   * every tenant-owned table return zero rows for them. Creating an identity
   * and granting access are separate acts; only the first happens here.
   *
   * ⚠️ EVERY ARGUMENT COMES FROM A SIGNATURE-VALIDATED TOKEN, never from a
   * request body. `subject` is the key; `email` and `name` are labels the
   * database will substitute for if absent. A caller-supplied subject here
   * would be account takeover by header.
   *
   * Runs without a tenant context, like `findByKeycloakSubject` above and for
   * the same reason — see migration 036 for why it must be SECURITY DEFINER.
   */
  async provisionUser(
    subject: string,
    email: string | undefined,
    displayName: string | undefined,
  ): Promise<string> {
    const rows = await this.db.queryWithoutTenant<{ id: string }>(
      `SELECT identity.provision_user_from_subject($1, $2, $3) AS id`,
      [subject, email ?? '', displayName ?? ''],
    );
    const id = rows[0]?.id;
    if (!id) {
      // The function RETURNS a uuid or raises; an empty result means the shape
      // changed underneath us. Failing loudly beats returning a blank user id
      // that would then be written into a membership row.
      throw new Error('provision_user_from_subject returned no id');
    }
    return id;
  }

  /**
   * REGISTRATION — an identity becomes a workshop.
   *
   * Creates tenant + organisation + branch + an owner membership for the
   * CALLER, atomically. The caller is identified by SUBJECT, not by a user id,
   * so no request can register a workshop in somebody else's name.
   *
   * ⚠️ The database refuses a caller who already belongs to an organisation.
   * That check lives in the function rather than here deliberately: a
   * double-submitted form races two requests through any check made in
   * application code, and the loser creates a second tenant that no screen
   * would ever reveal.
   */
  async registerWorkshop(
    subject: string,
    workshopName: string,
    branchName: string | undefined,
  ): Promise<{
    tenantId: string;
    organizationId: string;
    branchId: string;
    membershipId: string;
  }> {
    const rows = await this.db.queryWithoutTenant<{
      tenant_id: string;
      organization_id: string;
      branch_id: string;
      membership_id: string;
    }>(
      `SELECT tenant_id, organization_id, branch_id, membership_id
         FROM identity.register_workshop($1, $2, $3)`,
      [subject, workshopName, branchName ?? ''],
    );
    const row = rows[0];
    if (!row) throw new Error('register_workshop returned no row');
    return {
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      membershipId: row.membership_id,
    };
  }
}
