/**
 * Tenant context.
 *
 * The single most important rule in the platform (`autoworkshop 1.txt` §9):
 *
 *   "The gateway must never trust a tenant identifier supplied only by the
 *    client. Tenant context shall be derived from the validated identity and
 *    membership claims."
 *
 * Every request resolves EXACTLY ONE active tenant context, server-side, from
 * a validated Keycloak token plus a membership lookup. There is deliberately
 * no constructor path that accepts a client-supplied tenant id.
 */
// Ranks roles for the DEFAULT selection only. Not an authorization decision:
// everything it ranks is already a membership the server has proved.
import { rolePrecedence, PLATFORM_ADMIN_ROLE_NAME } from '../authz/permission-matrix';

export interface TenantContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly userId: string;
  /** The ONE active role for this request, not the user's full role set. */
  readonly activeRole: string;
  /**
   * Does this user hold an un-revoked row in `identity.platform_administrators`?
   *
   * 🔴 THIS IS THE ONLY SOURCE OF PLATFORM AUTHORITY IN THE API. It is read
   * from the database per request via `identity.platform_grant_for_subject`
   * (migration 078), keyed on the validated Keycloak subject — never on a role
   * name, never on a token claim.
   *
   * WHY IT EXISTS. Migration 077 made the DATABASE require a grant row and
   * deliberately left the API deriving `platform.admin` from the membership
   * `role_name`. Between 2026-08-10 and this change, revoking a grant removed
   * database reach and left every API gate open — including two endpoints
   * (`/security/posture`, `/operations/report`) that read server-wide catalogues
   * with no row-level security underneath, where the application check IS the
   * enforcement.
   *
   * ⚠️ IT IS NOT THE ONLY CHECK, ON PURPOSE. `resolveTenantContext` also refuses
   * to SELECT a `platform_administrator` membership without it, so a role name
   * cannot become `activeRole` at all. Two independent checks, the same shape
   * this repository already uses for `ROLE_TARGET_STAGES` + `STAGE_TRANSITIONS`:
   * either one alone would close the hole, and neither is relied on to.
   */
  readonly hasPlatformGrant: boolean;
  readonly correlationId: string;
}

/** Raised when a request cannot resolve exactly one tenant context. */
export class TenantResolutionError extends Error {
  constructor(reason: string) {
    super(`tenant context could not be resolved: ${reason}`);
    this.name = 'TenantResolutionError';
  }
}

/**
 * A validated membership record, as loaded from the database after the token
 * signature and claims have been verified.
 */
export interface ValidatedMembership {
  tenantId: string;
  organizationId: string;
  branchId: string | null;
  roleName: string;
  status: 'active' | 'suspended' | 'revoked';
}

/**
 * Resolve the active tenant context.
 *
 * `requestedOrganizationId` may come from the client (the org switcher), but it
 * is only ever used to SELECT among memberships the server already proved the
 * user holds. It can never introduce a tenant the user has no membership in —
 * which is the confused-deputy attack this design exists to prevent.
 */
export function resolveTenantContext(params: {
  userId: string;
  memberships: readonly ValidatedMembership[];
  requestedOrganizationId?: string;
  /**
   * The ROLE switcher, and it obeys exactly the same rule as the organisation
   * one: it SELECTS among memberships the server has already proved, and can
   * never introduce a role the user does not hold.
   *
   * ⚠️ THE CLIENT NAMES A PREFERENCE, NEVER A GRANT. If this ever admitted a
   * role with no membership row behind it, that is privilege escalation by
   * header — the confused-deputy attack `1.txt` §9 forbids. Asking for a role
   * you do not hold THROWS; it is never quietly downgraded to one you do,
   * because a silent downgrade hides an authorization probe.
   *
   * Why this exists: `identity.memberships` is unique on
   * (organization_id, user_id, role_name), so one user holding several roles is
   * already representable — but the default selection below sorts on
   * ORGANISATION ID ALONE. Two roles in the SAME organisation compare equal, so
   * the winner fell out of database row order and a user could resolve as the
   * weaker of their own roles. Stacking roles without this parameter produces a
   * confusing account, not a powerful one.
   */
  requestedRoleName?: string;
  /**
   * Whether the user holds an un-revoked platform administrator grant, read
   * from the database by `TenantGuard` before this runs.
   *
   * ⚠️ DEFAULTS TO FALSE, and that default is load-bearing. Every existing
   * caller and every test that does not pass it resolves WITHOUT platform
   * authority, which is the safe direction. A default of `true` would make an
   * omitted argument silently confer the thing this parameter exists to
   * withhold.
   */
  hasPlatformGrant?: boolean;
  correlationId: string;
}): TenantContext {
  const {
    userId,
    memberships,
    requestedOrganizationId,
    requestedRoleName,
    hasPlatformGrant = false,
    correlationId,
  } = params;

  // ⚠️ NARROW BY ROLE **BEFORE** ANYTHING ELSE, INCLUDING THE `length === 1`
  // SHORTCUT. Filtering afterwards would let the single-membership fast path
  // return a membership whose role contradicts the request — a switcher that
  // silently ignores what it was asked for is worse than one that refuses.
  const activeRaw = memberships.filter((m) => m.status === 'active');

  // 🔴 A `platform_administrator` MEMBERSHIP IS NOT ELIGIBLE WITHOUT A GRANT.
  //
  // This one filter is what closes the hole migration 077 left open, and it
  // closes it for THIRTY-THREE call sites at once rather than for the seven a
  // reviewer first counted.
  //
  // Seven endpoints gate on `permissionsForContext(...).includes(platform.admin)`
  // or on `activeRole === 'platform_administrator'` directly. But the role name
  // also appears in a role ALLOW-LIST in twenty-nine further files, and several
  // of those confer authority nothing else does: `UNLIMITED_ROLES` in
  // `authz/approval-limits.ts` (a platform administrator approves ANY amount),
  // `ROLE_TARGET_STAGES` in `repair/job-card-stages.ts` (EVERY stage, quality
  // control and vehicle release included), `MAY_GOVERN` in
  // `settings/settings.service.ts`, and `CAN_CREATE_ORG` in
  // `identity/organization.service.ts`. Regating those one by one would be
  // twenty-nine chances to miss one, and a missed one is silent.
  //
  // Fixing the FACT instead means the string can never reach `activeRole`
  // without a grant behind it, so every consumer — including one written
  // tomorrow by someone who has not read this comment — is correct by
  // construction.
  //
  // ⚠️ THIS CAN LEAVE A USER WITH NO MEMBERSHIP AT ALL, and that is the intended
  // answer, not an accident. Someone whose ONLY membership is
  // `platform_administrator` and whose grant has been revoked holds no authority
  // anywhere; 401 is what revocation is supposed to mean. `revoked_at` is
  // checked per request, so it takes effect on the next call rather than at the
  // next login.
  //
  // ⚠️ IT DOES NOT SWALLOW A FAILED READ. `TenantGuard` does not catch the
  // database error from `platform_grant_for_subject`, deliberately: the same
  // request already hard-depends on `memberships_for_subject`, so a database
  // behind on migrations is already a loud failure rather than a quiet change
  // of privilege. A caught error defaulting to `false` would be the silent
  // fail-closed-for-everyone this repository has recorded three times.
  const ineligiblePlatformAdmin = !hasPlatformGrant
    ? activeRaw.filter((m) => m.roleName === PLATFORM_ADMIN_ROLE_NAME)
    : [];
  const activeAll = hasPlatformGrant
    ? activeRaw
    : activeRaw.filter((m) => m.roleName !== PLATFORM_ADMIN_ROLE_NAME);

  // Refused EXPLICITLY rather than folded into "role not among your
  // memberships", which would be true-ish and useless: the row does exist, and
  // an administrator debugging a revocation needs to be told that it is the
  // GRANT that is missing, not the membership.
  if (requestedRoleName === PLATFORM_ADMIN_ROLE_NAME && !hasPlatformGrant) {
    throw new TenantResolutionError(
      'platform administrator authority requires an un-revoked grant in ' +
        'identity.platform_administrators; the membership role alone confers none',
    );
  }

  const active =
    requestedRoleName === undefined
      ? activeAll
      : activeAll.filter((m) => m.roleName === requestedRoleName);

  if (activeAll.length === 0) {
    throw new TenantResolutionError(
      ineligiblePlatformAdmin.length > 0
        ? 'the only active membership is platform_administrator and no un-revoked ' +
          'grant backs it, so it confers nothing'
        : 'user holds no active membership',
    );
  }
  if (active.length === 0) {
    // Held no such role. REFUSED, not downgraded — same reasoning as the
    // organisation branch below.
    throw new TenantResolutionError(
      'requested role is not among the user active memberships',
    );
  }

  let selected: ValidatedMembership | undefined;

  if (requestedOrganizationId) {
    selected = active.find((m) => m.organizationId === requestedOrganizationId);
    if (!selected) {
      // The user asked for an organization they are not a member of. This is
      // refused, not silently downgraded to a default — a silent fallback would
      // hide an authorization probe.
      throw new TenantResolutionError(
        'requested organization is not among the user active memberships',
      );
    }
  } else if (active.length === 1) {
    selected = active[0];
  } else {
    // No selection, several memberships: take a DETERMINISTIC default.
    //
    // ⚠️ THIS USED TO THROW, AND THAT WAS A LATENT LOCKOUT. Every request goes
    // through this function, `GET /me` included — so a user holding two
    // memberships and no stored selection could not load the shell that
    // contains the switcher they would have used to make one. The failure was
    // invisible only because every seeded identity happened to hold exactly one
    // membership; the first user granted a second would have been locked out of
    // the whole application.
    //
    // Defaulting is NOT the fallback this function refuses elsewhere. A
    // REQUESTED organization that is not among the user's memberships still
    // throws, because that is an authorization probe and silently downgrading
    // it would hide one. Here there is no request to contradict: every
    // candidate is a membership the server has already proved, so choosing one
    // grants nothing the user did not already hold.
    //
    // Sorted by organization id so the default is STABLE across requests.
    // Picking `active[0]` unsorted would depend on row order, and a viewer whose
    // tenant silently changed between two requests is far worse than an
    // arbitrary-but-fixed choice.
    //
    // ⚠️ THE SECOND KEY IS NOT DECORATION. Sorting on the organisation ALONE
    // left two roles in the SAME organisation comparing equal, and `sort` is
    // stable, so the winner was database row order — a user holding
    // `workshop_owner` and `technician` at one workshop could resolve as the
    // TECHNICIAN and see less than they hold. Ranking by role authority makes
    // the default the STRONGEST role held, which grants nothing (every
    // candidate is an already-proved membership) and is what makes stacking
    // roles on one account safe. The role switcher is how they go the other way.
    //
    // 🔴 ROLE AUTHORITY IS THE PRIMARY KEY. ORGANISATION ONLY BREAKS ITS TIES.
    //
    // THIS ORDER WAS THE OTHER WAY ROUND AND IT WAS THE DEFECT THE OWNER
    // REPORTED ON 2026-08-07: *"still customer page showup for every role user
    // login"*.
    //
    // With `organizationId` first, role precedence could only choose between
    // roles inside ONE organisation — so the default was decided by whichever
    // organisation's UUID happened to sort first, and the role that came with
    // it. Registering as a customer at any workshop whose id sorted low
    // silently demoted the account on every subsequent login.
    //
    // REPRODUCED against the real data rather than argued: an account holding
    // `platform_administrator`, `workshop_owner` and `technician` at one
    // workshop, plus `customer` at another whose id sorted first, resolved to
    //
    //     customer@1f290945 | platform_administrator@aaaaaaaa | ... -> customer
    //
    // The comment above already said the intent was "the default is the
    // STRONGEST role held". The implementation did not do that. This is the
    // third time in this repository that a confident comment has described a
    // rule the code did not implement, so the code is changed to match the
    // stated intent rather than the comment softened to match the code.
    //
    // ⚠️ THE OLD COMMENT'S WORRY — that a tie-break might "move the request to a
    // different tenant" — is real but is not an authorization concern. EVERY
    // candidate here is a membership the server has already proved from the
    // validated token subject, so choosing among them grants nothing. The
    // choice is about which of the user's OWN workspaces opens first, and
    // opening the weakest one because of a UUID is the worse answer: it hides
    // the whole application behind a switcher the user must first realise they
    // need.
    //
    // Organisation remains the tie-break so the result is still STABLE across
    // requests when one role is held at several workshops — an arbitrary but
    // fixed choice, never a viewer whose tenant changes between two requests.
    selected = [...active].sort(
      (a, b) =>
        rolePrecedence(a.roleName) - rolePrecedence(b.roleName) ||
        a.organizationId.localeCompare(b.organizationId),
    )[0];
  }

  // Narrowed explicitly rather than with a non-null assertion: `!` would
  // silence the compiler without proving anything, and this is the function
  // that decides which tenant's data a request may touch.
  if (!selected) {
    throw new TenantResolutionError('no membership selected');
  }

  return {
    tenantId: selected.tenantId,
    organizationId: selected.organizationId,
    branchId: selected.branchId,
    userId,
    activeRole: selected.roleName,
    // Carried through even when the selected role is NOT the platform one,
    // because it states a fact about the user rather than about this request.
    //
    // ⚠️ HOLDING THE GRANT IS NOT ENOUGH ON ITS OWN. `permissionsForContext`
    // requires the grant AND `activeRole === 'platform_administrator'`, so a
    // granted administrator who switches to `workshop_owner` genuinely acts as
    // one — which is the entire point of the role switcher, and what the
    // twenty-nine allow-list files already do by testing the role name. A
    // permission that followed the person across a deliberate downgrade would
    // make the switcher decorative.
    hasPlatformGrant,
    correlationId,
  };
}

/** A parameterised statement: SQL text plus bound values. */
export interface BoundStatement {
  readonly text: string;
  /** Mutable by design — `pg` accepts `any[]`, not a readonly array. */
  readonly values: string[];
}

/**
 * The statements that bind the resolved context to the database transaction,
 * so PostgreSQL RLS becomes the final backstop.
 *
 * Two deliberate choices:
 *
 * 1. `set_config(..., true)` rather than `SET LOCAL app.current_role = '...'`.
 *    `current_role` is a RESERVED KEYWORD in PostgreSQL and the SET LOCAL form
 *    is a syntax error — verified against a live database, which rejected it
 *    with: syntax error at or near "current_role".
 *
 * 2. Values are BOUND, never interpolated. Even though these values originate
 *    from validated membership rows rather than user input, building SQL by
 *    string concatenation is how injection defects are introduced later, when
 *    someone adds a field whose provenance is less certain. Binding removes the
 *    question entirely.
 *
 * The `true` third argument makes each setting transaction-local, so a pooled
 * connection cannot carry one tenant's context into the next request.
 */
export function tenantSessionStatements(ctx: TenantContext): BoundStatement[] {
  const set = (key: string, value: string): BoundStatement => ({
    text: 'SELECT set_config($1, $2, true)',
    values: [key, value],
  });

  return [
    set('app.tenant_id', ctx.tenantId),
    set('app.user_id', ctx.userId),
    set('app.current_role', ctx.activeRole),
    set('app.organization_ids', ctx.organizationId),
    set('app.branch_ids', ctx.branchId ?? ''),
  ];
}
