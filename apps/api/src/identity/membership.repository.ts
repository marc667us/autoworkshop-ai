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
    /**
     * The person's name, carried out of the SAME boundary query.
     *
     * `/me` cannot supply it to a viewer with no membership — it is behind
     * TenantGuard — and for `customer-web` that viewer is the entire audience.
     * Reading it here costs nothing: `memberships_for_subject` already joins
     * `identity.users`.
     */
    displayName?: string;
    memberships: ValidatedMembership[];
  } | null> {
    const rows = await this.db.queryWithoutTenant<{
      user_id: string;
      display_name: string;
      tenant_id: string;
      organization_id: string;
      branch_id: string | null;
      role_name: string;
      status: 'active' | 'suspended' | 'revoked';
    }>(
      /*
       * 🔴 NO JOIN. `display_name` is returned by the function itself since
       * migration 039.
       *
       * This used to be `FROM identity.memberships_for_subject($1) m JOIN
       * identity.users u ON u.id = m.user_id`, with a comment saying the join
       * "costs nothing" because the function already joins that table. It was
       * free only because `identity.users` happens to carry no RLS — which is
       * true today and is not a property anything guarantees. A SECURITY
       * DEFINER function's exemption does NOT extend to a join written outside
       * it: that join runs as the caller.
       *
       * ⚠️ AND IT IS STILL A LEFT JOIN INSIDE THE FUNCTION, which is the shape
       * that hid the real defect. A membership refused by RLS comes back as a
       * row with NULL membership columns, indistinguishable from a user who
       * genuinely has none — so `rows.filter(tenant_id !== null)` reported
       * "no workshop" to somebody who had just created one. 039 makes the
       * lookup able to read those rows; the filter below is still correct for
       * a genuinely new user, which is the case it was written for.
       */
      `SELECT m.user_id, m.display_name, m.tenant_id, m.organization_id,
              m.branch_id, m.role_name, m.status
         FROM identity.memberships_for_subject($1) m`,
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

    return { userId, displayName: rows[0]!.display_name, memberships };
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

  /**
   * REGISTRATION — an identity becomes a PARTS SUPPLIER (migration 068).
   *
   * 🔴 THE SAME DEFECT THE CUSTOMER ROLE HAD, FOUND BEFORE IT SHIPPED. A grep
   * for writers of `identity.memberships` returned exactly two —
   * `register_workshop` (always `workshop_owner`) and the admin-only
   * `MembershipService.grant()` — so NO production code path could create a
   * `supplier_owner`, even though the role appears in `ROLE_PRECEDENCE`, the
   * permission matrix, the supplier navigation tree and the `supplier-web` app.
   * A "Register as parts supplier" button without this would have produced an
   * account that signs in and is then refused by every supplier route.
   *
   * ⚠️ SAME RULES AS `registerWorkshop`, for the same reasons: the caller is
   * the token SUBJECT and never a user id from a body, the ROLE and the ORG
   * TYPE are literals inside the function and not parameters, and "already
   * belongs to an organisation" is enforced in the database so a
   * double-submitted form cannot race two tenants into existence.
   *
   * ⚠️ `queryWithoutTenant`, NECESSARILY. The caller has no membership yet, so
   * there is no tenant context to run under — that is the entire situation this
   * route exists for.
   */
  async registerSupplier(
    subject: string,
    supplierName: string,
    locationName: string | undefined,
  ): Promise<{
    tenantId: string;
    organizationId: string;
    branchId: string;
    membershipId: string;
  }> {
    const rows = await this.db.queryWithoutTenant<{
      o_tenant_id: string;
      o_organization_id: string;
      o_branch_id: string;
      o_membership_id: string;
    }>(
      // ⚠️ THE `o_` PREFIXES ARE THE FUNCTION'S REAL COLUMN NAMES, not a local
      // alias choice. Migration 068 needs them because a `RETURNS TABLE` column
      // called `organization_id` makes every unqualified reference inside the
      // body ambiguous — at RUNTIME, not at CREATE time.
      `SELECT o_tenant_id, o_organization_id, o_branch_id, o_membership_id
         FROM identity.register_supplier($1, $2, $3)`,
      [subject, supplierName, locationName ?? ''],
    );
    const row = rows[0];
    if (!row) throw new Error('register_supplier returned no row');
    return {
      tenantId: row.o_tenant_id,
      organizationId: row.o_organization_id,
      branchId: row.o_branch_id,
      membershipId: row.o_membership_id,
    };
  }

  /**
   * REGISTRATION — an identity becomes a FLEET OPERATOR (migration 075).
   *
   * 🔴 THE THIRD ROLE THAT COULD NOT EXIST, and the last of the three to get a
   * caller. `customer` (2026-08-08) and `supplier_owner` (2026-08-09) each
   * shipped with a navigation tree, a permission matrix entry and an entire web
   * app before anybody asked which production path WRITES the role. The answer
   * was "none" all three times.
   *
   * `fleet_administrator` was found the same way and migration 075 built the
   * door — and then the door had no handle for a day: `identity.register_fleet`
   * existed in the database while `POST /registration/fleet` answered 404, so
   * fleet-web could be deployed, could render all 29 of its routes, and could
   * not be signed into by anybody at all. A CALLER WITH NO ROUTE, which is the
   * exact inverse of the customer defect where a route had no caller. Both ship
   * green.
   *
   * ⚠️ SAME RULES AS `registerSupplier`, for the same reasons: the caller is the
   * token SUBJECT and never a user id from a body, and the ROLE
   * (`fleet_administrator`) and the ORG TYPE (`fleet_operator`) are literals
   * inside migration 075 rather than parameters.
   *
   * 🔴 AND THE DOUBLE-SUBMIT GUARANTEE IS MIGRATION 076's, NOT 075's. This
   * comment first said "enforced in the database so a double-submitted form
   * cannot race two tenants into existence" — copied from `registerSupplier`,
   * where it is true. It was FALSE here: 075 shipped the `IF EXISTS` membership
   * check with no advisory lock, so two concurrent submissions could each see
   * no membership and create a tenant apiece, and a fleet could race a WORKSHOP
   * registration because that one holds a lock this function never took. Codex
   * found it reviewing the route. 076 adds
   * `pg_advisory_xact_lock('identity.register:' || user)` — the same key as
   * 071/072 — and asserts from `pg_get_functiondef` that all three registration
   * functions hold it.
   *
   * ⚠️ `queryWithoutTenant`, NECESSARILY. The caller has no membership yet —
   * that is the entire situation this route exists for.
   */
  async registerFleet(
    subject: string,
    fleetName: string,
    locationName: string | undefined,
  ): Promise<{
    tenantId: string;
    organizationId: string;
    branchId: string;
    membershipId: string;
  }> {
    const rows = await this.db.queryWithoutTenant<{
      o_tenant_id: string;
      o_organization_id: string;
      o_branch_id: string;
      o_membership_id: string;
    }>(
      // ⚠️ THE `o_` PREFIXES ARE THE FUNCTION'S REAL COLUMN NAMES, not a local
      // alias choice. Migration 075 needs them because a `RETURNS TABLE` column
      // called `organization_id` makes every unqualified reference inside the
      // body ambiguous — at RUNTIME, not at CREATE time.
      `SELECT o_tenant_id, o_organization_id, o_branch_id, o_membership_id
         FROM identity.register_fleet($1, $2, $3)`,
      [subject, fleetName, locationName ?? ''],
    );
    const row = rows[0];
    if (!row) throw new Error('register_fleet returned no row');
    return {
      tenantId: row.o_tenant_id,
      organizationId: row.o_organization_id,
      branchId: row.o_branch_id,
      membershipId: row.o_membership_id,
    };
  }

  /**
   * ENROLMENT — an identity becomes a CUSTOMER of a workshop that publishes
   * itself (migration 061).
   *
   * 🔴 THE DEFECT THIS EXISTS FOR: until 061, `registerWorkshop` above and the
   * admin-only `MembershipService.grant()` were the ONLY two writers of
   * `identity.memberships` in the product, and neither produces a `customer`.
   * So on production the customer role could not exist, and every customer
   * route — which all sit behind `TenantGuard` — answered 401 to a person who
   * had just signed in successfully. It survived every test because
   * `scripts/seed-dev-identity.sh` INSERTs the membership with raw SQL, so
   * locally the role always existed.
   *
   * ⚠️ Same rules as `registerWorkshop`: the caller is the token SUBJECT, never
   * a user id from a body, and the ROLE is not a parameter here or in the
   * function — it is the literal `'customer'` in migration 061. The refusals
   * (unpublished workshop, an account that already has a role there) live in
   * the database for the same reason the duplicate-workshop check does: a
   * double-submitted form races two requests past any application-code check.
   *
   * Runs without a tenant context — the caller has none yet. That is precisely
   * why the function is SECURITY DEFINER, and why
   * `rehearse/061_customer_enrolment_render_privileges.sql` drives it under a
   * NOSUPERUSER NOBYPASSRLS role: locally the definer owner bypasses RLS, so a
   * green local run proves nothing about production.
   */
  async enrolAsCustomer(
    subject: string,
    organizationId: string,
  ): Promise<{
    tenantId: string;
    organizationId: string;
    branchId: string | null;
    membershipId: string;
    /** False when the membership already existed — the funnel calls this often. */
    created: boolean;
  }> {
    const rows = await this.db.queryWithoutTenant<{
      o_tenant_id: string;
      o_organization_id: string;
      o_branch_id: string | null;
      o_membership_id: string;
      o_created: boolean;
    }>(
      // The `o_` prefixes are the function's real column names — see migration
      // 061 for why they cannot be the bare ones.
      `SELECT o_tenant_id, o_organization_id, o_branch_id, o_membership_id, o_created
         FROM identity.enrol_as_customer($1, $2)`,
      [subject, organizationId],
    );
    const row = rows[0];
    if (!row) throw new Error('enrol_as_customer returned no row');
    return {
      tenantId: row.o_tenant_id,
      organizationId: row.o_organization_id,
      branchId: row.o_branch_id,
      membershipId: row.o_membership_id,
      created: row.o_created,
    };
  }
}
