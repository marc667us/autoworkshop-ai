import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';

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
 * The roles a WORKSHOP organisation may hold — the eight of `07.txt` pt2 §50,
 * plus the two the product genuinely puts there.
 *
 * Derived from `GRANTABLE_ROLES` rather than retyped, so a role added above
 * cannot be silently absent here. The four partner roles are subtracted by
 * name because each belongs to its own organisation type.
 */
const WORKSHOP_ROLE_SET: readonly string[] = [
  ...[...GRANTABLE_ROLES].filter(
    (r) =>
      r !== 'supplier_owner' &&
      r !== 'fleet_administrator' &&
      r !== 'insurance_assessor' &&
      r !== 'towing_operator',
  ),
  // Not in `GRANTABLE_ROLES` — it cannot be granted through this service at all
  // (migration 077/078 made it a grant RECORD). It is listed here because
  // existing memberships carry the name inside the owner's workshop, and this
  // map must not describe those as invalid.
  'platform_administrator',
];

/**
 * Which roles belong in which kind of organisation.
 *
 * 🔴 THE GAP THIS CLOSES, MEASURED. `grant()` checked who may grant, that the
 * role is grantable, that the organisation is in the caller's tenant and that
 * the branch is in the organisation — and never that the ROLE SUITS THE
 * ORGANISATION. A query of the development database found
 * `parts_supplier | reception_staff`, a workshop reception role inside a parts
 * supplier, which every one of those gates passed.
 *
 * ⚠️ THE ORG TYPE KEYS ARE `ORG_TYPES` FROM `organization.schemas.ts`, which
 * mirrors the `organizations_org_type_check` CHECK constraint in
 * `001_tenancy_foundation.sql`. Two lists that must agree are a drift risk, and
 * `membership-role-fit.spec.ts` reads the schema module and fails if this one
 * names a type the database does not admit.
 *
 * ⚠️ AN ORG TYPE ABSENT FROM THIS MAP GRANTS NOTHING. `vehicle_owner` and
 * `training_institution` have no roles defined yet, so a grant into one is
 * refused rather than waved through. That is the fail-closed direction: a role
 * nobody has designed for an organisation nobody has built is not a thing to
 * guess at. When those organisations get roles, they get an entry here.
 */
const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // The three workshop shapes take the eight workshop roles of `07.txt` pt2
  // §50, plus `customer` — migration 061 enrols a vehicle owner INTO the
  // workshop's own organisation, so that pairing is what the product produces —
  // plus `platform_administrator`, the documented compromise described above.
  individual_workshop: WORKSHOP_ROLE_SET,
  multi_branch_workshop: WORKSHOP_ROLE_SET,
  mobile_technician: WORKSHOP_ROLE_SET,

  parts_supplier: ['supplier_owner'],
  fleet_operator: ['fleet_administrator'],
  insurance_company: ['insurance_assessor'],
  towing_company: ['towing_operator'],

  // The platform's own organisation, if one is ever created. Named because
  // leaving it out would refuse the one role that obviously belongs in it.
  platform_operator: ['platform_administrator'],
});

/** Whether `roleName` may be granted inside an organisation of `orgType`. */
function roleSuitsOrganisation(roleName: string, orgType: string): boolean {
  // `Object.hasOwn` rather than a bare lookup, for the reason
  // `permissionsForRole` documents: a plain index resolves up the PROTOTYPE
  // chain, so `ROLES_BY_ORG_TYPE['constructor']` returns the Object function —
  // truthy — and `?? []` never fires. On this function that would admit every
  // role into an organisation type called `constructor`.
  if (!Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)) return false;
  return ROLES_BY_ORG_TYPE[orgType]!.includes(roleName);
}

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
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop membership roster');
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
      userId?: string;
      /** The person's email — resolved here, so no lookup endpoint exists to harvest. */
      userEmail?: string;
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
    // 🔴 THE "EXACTLY ONE" RULE BELONGS HERE, NOT ONLY IN THE ZOD SCHEMA.
    //
    // `GrantMembershipBody` refines it at the HTTP boundary, and this service is
    // NOT only reached over HTTP: ADR-010/013 route agents through MCP into
    // these same domain services, and CLAUDE.md is explicit that business rules
    // live in the service. A direct caller sending BOTH would have had `userId`
    // silently win, and one sending NEITHER would have run an email lookup for
    // `undefined` — on the platform's privilege-granting operation, either is a
    // silent disagreement about WHO is being given access. (Codex, 2026-08-04.)
    if (Boolean(input.userId) === Boolean(input.userEmail)) {
      throw new BadRequestException('send exactly one of userId or userEmail');
    }
    if (!GRANTABLE_ROLES.has(input.roleName)) {
      // Names the constraint, not the valid set: enumerating grantable roles in
      // an error message hands a caller the platform's authorization taxonomy,
      // which is the disclosure the catch-all route was already fixed to avoid.
      throw new BadRequestException('unknown role');
    }

    return this.db.withTenant(ctx, async (client) => {
      // ── resolve WHO, before anything else ────────────────────────────────
      //
      // `identity.users` is deliberately NOT tenant-scoped (one human may hold
      // memberships in several tenants), so this lookup can see an account that
      // is not yet a member — which is the entire point: without it there was
      // no way to add anybody who was not already inside.
      //
      // ⚠️ EXACT MATCH, CASE-INSENSITIVE, ONE ROW. Not a prefix, not a LIKE.
      // The caller learns only whether the single address they already typed
      // has an account, and only after passing the role gate above. That is not
      // an enumeration oracle; a search endpoint would have been one.
      let userId = input.userId ?? null;
      if (!userId) {
        const found = await client.query(
          `SELECT id FROM identity.users WHERE lower(email) = lower($1)`,
          [input.userEmail],
        );
        if (found.rows.length === 0) {
          // Names the way forward rather than just refusing. There is no invite
          // flow yet (T-0028), so the honest instruction is that the person
          // signs up first — a refusal with no reachable next step is the wall
          // this repository keeps writing down.
          throw new NotFoundException(
            'no account with that email address. Ask them to sign up first, then add them here.',
          );
        }
        userId = found.rows[0].id as string;
      }

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
      const org = await client.query<{ org_type: string }>(
        // 🔴 `org_type`, NOT `1`. See the compatibility check below — the row's
        // EXISTENCE was all this asked for, and existence is not the whole
        // question on the privilege-granting operation.
        `SELECT org_type FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (org.rows.length === 0) throw new NotFoundException('organization not found');

      // ── 🔴 THE ROLE MUST SUIT THE ORGANISATION IT IS GRANTED IN ───────────
      //
      // MEASURED, NOT HYPOTHETICAL. Before this check, a query of the
      // development database returned:
      //
      //     parts_supplier | reception_staff | 1
      //
      // — a workshop reception role inside a PARTS SUPPLIER organisation. Every
      // gate above passed it: `reception_staff` is in `GRANTABLE_ROLES`, the
      // organisation was in the caller's tenant, and RLS `WITH CHECK` validates
      // the tenant of the row being inserted and says nothing about whether the
      // role makes sense where it landed.
      //
      // The consequence is not a cross-tenant leak — `resolveTenantContext`
      // still pins the request to this organisation — it is INCOHERENCE, which
      // fails in the quiet direction this repository keeps paying for. A
      // `reception_staff` in a supplier organisation resolves the WORKSHOP
      // reception navigation tree (`workspaceForRole`), so the person is shown
      // Vehicle Intake and Customer Complaints for an organisation that has
      // neither, and `isForeignToWorkspace` sends them to the workshop pack,
      // where every API call is scoped to a supplier's tenant. Nothing errors.
      //
      // ⚠️ ENFORCED ON THE GRANT, NOT ON EXISTING ROWS. This is a forward
      // constraint: the row above keeps working and is not migrated away, so no
      // live membership breaks. A database CHECK would have been the stronger
      // place and is not available — the pairing spans two tables.
      //
      // ⚠️ `platform_administrator` IS DELIBERATELY VALID IN A WORKSHOP. It is
      // the documented compromise the model forces (the owner holds it via a
      // membership attached to their own workshop), and since migration 078 the
      // AUTHORITY comes from a grant record rather than this name, so admitting
      // the name here confers nothing on its own.
      const orgType = org.rows[0]!.org_type;
      if (!roleSuitsOrganisation(input.roleName, orgType)) {
        // Names the mismatch without enumerating the taxonomy, matching the
        // deliberately vague 'unknown role' above: the caller learns that the
        // pair is wrong, not what the full set of valid pairs is.
        throw new BadRequestException(
          `role '${input.roleName}' cannot be granted in a ${orgType} organisation`,
        );
      }

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
          userId,
          input.roleName,
          ctx.userId,
        ],
      );

      let row = res.rows[0];
      if (!row) {
        // ── the unique constraint fired: this grant already exists ──────────
        //
        // 🔴 AND IT MAY BE A REVOKED ONE, WHICH USED TO BE A DEAD END. A
        // membership is never deleted — withdrawal sets `status = 'revoked'`
        // and keeps the row so "was this person ever granted access?" stays
        // answerable. But the row still occupies the unique key, so re-hiring
        // somebody previously removed hit `ON CONFLICT DO NOTHING` and was
        // refused with "membership already exists" — a message that is the
        // OPPOSITE of the truth, told to an owner looking at a colleague who
        // demonstrably has no access, with nothing anywhere to undo it.
        //
        // A rule whose escape hatch is unreachable is a wall, not a rule.
        const existing = await client.query(
          `UPDATE identity.memberships
              -- 🔴 THE BRANCH IS RE-SET, NOT INHERITED. The unique key is
              -- (organization_id, user_id, role_name) and does NOT include the
              -- branch, so re-hiring the same person into the same role at a
              -- DIFFERENT site matched the old row and would have reactivated
              -- it with the OLD branch_id — quietly granting access to a site
              -- nobody approved, which is exactly what §50's "approved role AND
              -- branch" forbids. The branchId parameter has already been
              -- validated against this organization above.
              --
              -- NO BACKTICKS IN THIS COMMENT: it sits inside a TS template
              -- literal, so one terminates the string. FIFTH instance.
              -- (Codex, 2026-08-04.)
              SET status = 'active', branch_id = $6,
                  updated_at = now(), updated_by = $1
            WHERE organization_id = $2 AND user_id = $3 AND role_name = $4
              AND tenant_id = $5
              -- Only a WITHDRAWN one is reinstated. An ACTIVE row matches
              -- nothing here and still falls through to the refusal below,
              -- because "add them again" when they are already there changed
              -- nothing and must not read as though it did.
              AND status <> 'active'
            RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
          [ctx.userId, input.organizationId, userId, input.roleName, ctx.tenantId,
           input.branchId ?? null],
        );
        row = existing.rows[0];
      }
      if (!row) {
        throw new BadRequestException('membership already exists');
      }

      await this.audit.write(client, ctx, {
        action: 'membership.granted',
        resourceType: 'membership',
        resourceId: row.id,
        detail: {
          // 🔴 THE RESOLVED ID, NOT `input.userId`. Once `userEmail` became an
          // accepted input, `input.userId` was undefined for every grant made
          // by email — so the audit entry for the platform's PRIVILEGE-GRANTING
          // operation would have recorded `userId: undefined` and lost the one
          // fact it exists to preserve: who was given access.
          userId,
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
