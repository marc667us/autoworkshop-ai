import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { MembershipRepository } from './membership.repository';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * ENROLMENT — a signed-up person becomes a customer of a workshop.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THE DEFECT THIS SERVICE CLOSES, MEASURED 2026-08-08:
 * THE `customer` ROLE COULD NOT EXIST ON PRODUCTION.
 *
 * `identity.memberships` had exactly two writers in the whole product —
 * `register_workshop` (grants `workshop_owner`) and the admin-only
 * `MembershipService.grant()`. Neither can produce a `customer`. Every
 * customer route sits behind `TenantGuard`, which throws `user holds no active
 * membership` when there is none.
 *
 * So a real Keycloak sign-up produced an account that could browse the
 * marketplace and nothing else: sign-in succeeded, `/vehicles` 401'd into an
 * empty garage, and the Request for Service form POSTed into a 401. From
 * outside that is indistinguishable from "I cannot sign in", which is how the
 * owner reported it.
 *
 * It survived every test because `scripts/seed-dev-identity.sh` INSERTs a
 * `customer` membership with raw SQL. The end-to-end proof of 2026-08-07 ran
 * against a fixture no production code path can create.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── TWO STEPS, AND THE SECOND IS NOT OPTIONAL ─────────────────────────────
 *
 * 1. The MEMBERSHIP, via `identity.enrol_as_customer` (migration 061). Makes
 *    the API answer at all.
 * 2. The `core.customers` RECORD, here, through the ordinary tenant path.
 *    Makes the answers contain the person's own data.
 *
 * Step 2 exists because every customer-scoped read in this product is the
 * predicate `AND ($n::uuid IS NULL OR c.user_id = $n::uuid)` — about forty of
 * them — which resolves through `core.customers.user_id`. And **no application
 * code has ever written that column**: `CustomerService.create` omits it, and
 * the only writes anywhere are test fixtures. A membership on its own therefore
 * produces the worst of both worlds — an account that reaches the workshop's
 * shared surfaces and none of its own records, with `/my/*` answering "this
 * workshop has no customer record for your account yet" forever.
 *
 * ⚠️ STEP 2 IS DELIBERATELY NOT INSIDE THE SQL FUNCTION. `core.customers`
 * carries migration 054's RESTRICTIVE `org_restrict` policy, which ANDs with
 * every permissive policy and demands `organization_id =
 * identity.current_organization_id()`. Satisfying that from inside a definer
 * function with no context would need a third bootstrap door. Doing it
 * afterwards needs none: by then the caller genuinely holds the membership, so
 * this runs under full RLS with nothing relaxed.
 */
@Injectable()
export class CustomerEnrolmentService {
  private readonly log = new Logger(CustomerEnrolmentService.name);

  constructor(
    private readonly memberships: MembershipRepository,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Enrol the caller as a customer of `organizationId`.
   *
   * @param subject   the Keycloak subject, from a signature-validated token.
   *                  NEVER a user id from a request body.
   * @param displayName the label to put on a NEW customer record. Taken from
   *                  the token, not the body — a body field here would let a
   *                  caller name themselves anything in a workshop's records.
   */
  async enrol(
    subject: string,
    organizationId: string,
    displayName: string | undefined,
    email: string | undefined,
  ): Promise<{
    organizationId: string;
    roleName: 'customer';
    membershipId: string;
    customerId: string;
    /** False when the person was already enrolled — the funnel calls this often. */
    created: boolean;
  }> {
    let enrolled: Awaited<ReturnType<MembershipRepository['enrolAsCustomer']>>;
    try {
      enrolled = await this.memberships.enrolAsCustomer(subject, organizationId);
    } catch (err) {
      // 🔴 THE DATABASE'S REFUSALS MUST REACH THE USER AS ANSWERS, NOT 500s.
      // Same reasoning as `registerWorkshop` in the controller: a refusal
      // reported as "Internal server error" makes a working guard look like a
      // broken product, and the person retries into the same wall.
      //
      // Matched on the wording migration 061 raises. That is a coupling, and it
      // is the coupling the repo already accepts for 036/037 — both strings are
      // quoted in the migration so a rewording is visible on both sides.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not accepting customers online')) {
        throw new BadRequestException(
          'That workshop is not taking new customers online. Contact them directly to be added.',
        );
      }
      if (message.includes('already has a role at that workshop')) {
        throw new BadRequestException(
          'This account already works at that workshop. Use your staff workspace instead.',
        );
      }
      if (message.includes('no active application user')) {
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('a workshop must be chosen')) {
        throw new BadRequestException('Choose a workshop first.');
      }
      throw err;
    }

    // ── step 2, under the context the enrolment just proved ────────────────
    //
    // ⚠️ THIS CONTEXT IS NOT CLIENT-SUPPLIED, AND THAT IS THE WHOLE ARGUMENT
    // FOR CONSTRUCTING ONE HERE. `TenantGuard` normally builds it, but this
    // request arrived on `UserGuard` with no membership to resolve. Every field
    // below comes from the RETURN of `identity.enrol_as_customer`, i.e. from a
    // membership row the database has just written and pinned to this token
    // subject — the same provenance the guard would have used, one step
    // earlier. Nothing here originates in the request body.
    const ctx: TenantContext = {
      tenantId: enrolled.tenantId,
      organizationId: enrolled.organizationId,
      branchId: enrolled.branchId,
      userId: await this.userIdFor(subject),
      activeRole: 'customer',
      // Hard `false`, not a lookup. This context exists solely to write the
      // customer record the enrolment just created, as that customer; asking
      // whether the person is also a platform administrator would be a question
      // with no bearing on the one statement it is used for, and answering it
      // `true` here would confer platform authority on a path that never
      // resolved a membership.
      hasPlatformGrant: false,
      correlationId: randomUUID(),
    };

    const customerId = await this.db.withTenant(ctx, async (client) => {
      // Idempotent against the unique index added in migration 063
      // (organization_id, user_id) WHERE user_id IS NOT NULL. Without that
      // index this check-then-insert would race under READ COMMITTED and
      // produce two customer records for one person — which would split their
      // repair history across two rows that every scoped read joins through.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM core.customers
          WHERE organization_id = $1 AND user_id = $2
          LIMIT 1`,
        [ctx.organizationId, ctx.userId],
      );
      if (existing.rowCount && existing.rows[0]) return existing.rows[0].id;

      // 🔴 THIS DOES NOT CLAIM AN EXISTING WALK-IN RECORD BY EMAIL.
      //
      // Migration 004 imagines a walk-in whose row "gains a user_id and their
      // garage lights up with the history already there". That merge is the
      // right product behaviour and it is NOT safe to do automatically today:
      // `verifyEmail` is OFF on the live realm (turned off 2026-08-07 because
      // Keycloak has no SMTP), so an email address is not proof of ownership.
      // Auto-claiming would let anyone sign up as a stranger's address and
      // inherit their vehicles, invoices and repair history.
      //
      // So a FRESH record is created and merging is left to staff, who can see
      // both. Revisit when R1's MX record lands and verification is back on.
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO core.customers
           (tenant_id, organization_id, user_id, customer_type,
            display_name, email, preferred_contact, created_by)
         VALUES ($1, $2, $3, 'individual', $4, $5, 'in_app', $3)
         ON CONFLICT (organization_id, user_id) WHERE user_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          ctx.userId,
          // A person must have SOME label in a workshop's book. The email local
          // part is a poor name but a truthful one; "Unknown" would be worse
          // for the receptionist reading it.
          displayName?.trim() || email?.split('@')[0] || 'New customer',
          email ?? null,
          // `in_app` rather than `email`: the in-app inbox is delivered the
          // moment it is written and needs no mail provider, which is the only
          // channel this platform can currently promise (migration 060).
        ],
      );
      if (inserted.rowCount && inserted.rows[0]) return inserted.rows[0].id;

      // Lost the race against a concurrent identical enrolment. The winner's
      // row is the answer.
      const winner = await client.query<{ id: string }>(
        `SELECT id FROM core.customers
          WHERE organization_id = $1 AND user_id = $2
          LIMIT 1`,
        [ctx.organizationId, ctx.userId],
      );
      const id = winner.rows[0]?.id;
      if (!id) {
        // Neither inserted nor found: the unique index is not what this code
        // believes it is. Fail loudly rather than return a blank id that would
        // then be handed to the caller as a customer record.
        throw new Error(
          'customer record was neither created nor found after enrolment',
        );
      }
      return id;
    });

    if (enrolled.created) {
      // Logged only on a real enrolment. The funnel calls this on every visit,
      // so logging unconditionally would bury the signal in its own noise.
      this.log.log(
        `customer enrolled: membership=${enrolled.membershipId} org=${enrolled.organizationId} customer=${customerId}`,
      );
    }

    return {
      organizationId: enrolled.organizationId,
      roleName: 'customer',
      membershipId: enrolled.membershipId,
      customerId,
      created: enrolled.created,
    };
  }

  /**
   * The application user id behind a token subject.
   *
   * `identity.users` is not tenant-scoped (`rls=false`, verified), so this
   * needs no context — which is what makes it callable at this point in the
   * request, before any membership has been resolved.
   */
  private async userIdFor(subject: string): Promise<string> {
    const rows = await this.db.queryWithoutTenant<{ id: string }>(
      `SELECT id FROM identity.users WHERE keycloak_subject = $1 AND status = 'active'`,
      [subject],
    );
    const id = rows[0]?.id;
    if (!id) {
      // Unreachable in practice: `enrol_as_customer` raises first if the user
      // is missing. Kept because returning `undefined` here would put a blank
      // user id into a TenantContext, and that context decides which rows the
      // next statement may touch.
      throw new BadRequestException('This account is not active.');
    }
    return id;
  }
}
