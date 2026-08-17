/**
 * Role → permission matrix (T-0004).
 *
 * WHY THIS EXISTS NOW. `viewerGrants()` in the web apps returns demo data, and
 * it cannot stop doing so until something can answer "what may this viewer
 * see?" from a real role. Nothing could: the navigation gates on
 * `finance.read`, `organization.admin` and `platform.admin`, and no code
 * anywhere mapped a role to any of them. T-0005 is blocked on this, so it is
 * built here rather than stubbed again.
 *
 * SOURCE, not invention. Every entry below is derived from a specification:
 *   · `07.txt` part 2 §50 — the role-based control summary, which states in one
 *     line what each of the eight workshop roles is permitted to do.
 *   · `01 (1).txt` §29 — "Sensitive financial menu items shall be restricted by
 *     permission", which is what `finance.read` gates.
 *   · `02.txt` §58 / `01 (1).txt` §32 — the administration surface is visible
 *     only to authorised administrative, security and operational users, which
 *     is what `platform.admin` gates.
 *
 * DELIBERATELY SMALL. Only three permission keys exist in the navigation model
 * today, so only three are granted here. Inventing a broad taxonomy now would
 * be unreviewable guesswork and would create keys no screen consumes — the kind
 * of speculative structure that later gets copied as if it were decided. New
 * keys arrive with the modules that gate on them.
 *
 * ⚠️ THIS IS NOT THE ENFORCEMENT POINT. It decides what the UI admits exists.
 * Enforcement is the API's own role checks plus Postgres RLS, which deny
 * independently. CLAUDE.md §8: "Hidden ≠ secure."
 */

/** Permission keys the navigation model actually gates on today. */
export const PERMISSIONS = {
  /** §29 — invoices, payments, balances, refunds, revenue, financial reports. */
  financeRead: 'finance.read',
  /** Organisation settings: staff, roles, branches, workflow rules. */
  organizationAdmin: 'organization.admin',
  /** §32 — the platform administration surface in its entirety. */
  platformAdmin: 'platform.admin',
} as const;

// ⚠️ `platformAdmin` IS NOT DESTRUCTURED HERE, ON PURPOSE. No entry in
// ROLE_PERMISSIONS may reference it — it is added by permissionsForContext
// from the grant, and by nothing else. Leaving it in scope would make
// re-adding it to a role a one-word edit.
const { financeRead, organizationAdmin } = PERMISSIONS;

/**
 * Role name → the permissions it confers.
 *
 * Role names are the `identity.memberships.role_name` values accepted by
 * `MembershipService`'s grantable-role allow-list. The two lists must agree: a
 * role that can be granted but has no entry here silently receives NO
 * permissions, which fails closed but looks like a bug at the screen. The test
 * `every grantable role has a matrix entry` asserts they stay in step.
 */
export const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // ── 07 pt2 §50, the eight workshop roles ────────────────────────────────
  /** "Full workshop governance, staff, financial and reporting access." */
  workshop_owner: [financeRead, organizationAdmin],
  /** "Daily operational control, assignment, workflow and performance access."
   *  Operational control is not financial or governance authority, so neither
   *  key is granted — §47's own navigation has no FINANCE group at all. */
  workshop_manager: [],
  /** "Customer, vehicle, complaint, appointment, intake, INVOICE and release
   *  functions." §48 gives reception Invoices / Receive Payment / Receipts. */
  reception_staff: [financeRead],
  /** "Technical review, repair-plan approval, testing and quality oversight." */
  workshop_supervisor: [],
  /** "Assigned-job inspection, diagnosis, repair planning, execution, testing."
   *  §49's technician navigation contains no financial item. */
  technician: [],
  /** "Parts catalogue, inventory, reservation, issue, return and procurement." */
  storekeeper: [],
  /** "Independent testing, quality review, rejection and approval." */
  quality_control_inspector: [],
  /** "Invoice review, payment collection and receipt generation." */
  cashier: [financeRead],

  // ── other workspaces ────────────────────────────────────────────────────
  /** §32 — the whole administration surface, plus the two it supersedes. */
  /*
   * 🔴 `platformAdmin` IS DELIBERATELY ABSENT FROM THIS LIST.
   *
   * It used to be here, and that was the whole of the defect migration 077 left
   * open. `permissionsForRole` is a pure function of a role NAME, and a role
   * name is a plain TEXT column on a membership row inside one organisation.
   * Deriving `platform.admin` from it meant revoking a grant in
   * `identity.platform_administrators` removed database reach and left every
   * API gate open.
   *
   * `platform.admin` is now added by `permissionsForContext` and by nothing
   * else, from `TenantContext.hasPlatformGrant`. Removing it here rather than
   * subtracting it later is the fail-closed direction: there is no longer any
   * code path from a role name to this permission, so a caller that reaches for
   * `permissionsForRole` by habit cannot accidentally confer it.
   *
   * The other two keys stay: they describe what this role does INSIDE the
   * organisation its membership names, which is exactly what a role name is
   * competent to say.
   */
  platform_administrator: [organizationAdmin, financeRead],
  /** §35's supplier tree gates Invoices and Settlements on finance.read. */
  supplier_owner: [financeRead, organizationAdmin],
  /** §36's fleet tree gates Invoices on finance.read. */
  fleet_administrator: [financeRead, organizationAdmin],
  /**
   * 085 — the insurer's ORG ADMIN.
   *
   * `organizationAdmin` is what makes the role meaningful: it is the permission
   * the insurance and towing organisations had NO holder of, which is why they
   * could never appoint a second member. Modelled on `supplier_owner` and
   * `fleet_administrator` above, which have carried exactly this pair since
   * they were written.
   *
   * ⚠️ A GRANTABLE ROLE WITH NO ENTRY IN THIS MAP SILENTLY GETS NOTHING —
   * `permissionsForRole` returns `[]` for an unknown key rather than throwing.
   * That is the fail-closed direction and it is also how a new role ships
   * looking present and doing nothing, so an addition to `GRANTABLE_ROLES`
   * without an addition here is a defect, not an omission.
   */
  insurance_owner: [financeRead, organizationAdmin],
  /** §37's insurance tree gates Payments and Claim Costs on finance.read. */
  insurance_assessor: [financeRead],
  /**
   * 085 — the towing firm's ORG ADMIN. `financeRead` because the admin sees the
   * firm's own invoices; §52's operational tree still has no gated entry, which
   * is why `towing_operator` below keeps its empty list.
   */
  towing_owner: [financeRead, organizationAdmin],
  /** §52's towing tree has no gated entry. */
  towing_operator: [],
  /** §33's customer tree has no gated entry — a customer's own invoices are
   *  their own data, not the workshop's finance surface. */
  customer: [],
});

/**
 * Permissions for one role.
 *
 * An unknown role gets NOTHING, never a default set. A typo in a role name must
 * remove access, not grant it — the failure has to point the safe way.
 *
 * `Object.hasOwn` rather than a bare lookup, and this is not defensive
 * decoration: a plain `ROLE_PERMISSIONS[roleName] ?? []` resolves up the
 * PROTOTYPE CHAIN, so `permissionsForRole('constructor')` returned the `Object`
 * function itself — truthy, so `??` never fired — and `permissionsForRole
 * ('toString')` returns a function too. The caller then ships something that is
 * not an array to the client and `.includes()` behaves unpredictably on it.
 * `Object.freeze` does not help; it seals the object's own properties and says
 * nothing about inherited ones.
 *
 * The grantable-role allow-list means such a name cannot reach the database
 * today, but this function is exported and its contract is "a role name in, a
 * permission list out". It should not depend on a caller elsewhere having
 * filtered first.
 */
export function permissionsForRole(roleName: string): readonly string[] {
  return Object.hasOwn(ROLE_PERMISSIONS, roleName) ? ROLE_PERMISSIONS[roleName]! : [];
}

/**
 * The membership `role_name` that USED to confer platform authority by itself.
 *
 * Exported so `resolveTenantContext` can refuse to select such a membership
 * without a grant, and so tests can name it without re-typing a magic string in
 * two files that must agree.
 *
 * 🔴 IT IS NOT A LIST OF ADMINISTRATORS. Holding this role name proves nothing;
 * an un-revoked row in `identity.platform_administrators` does.
 */
export const PLATFORM_ADMIN_ROLE_NAME = 'platform_administrator';

/**
 * The EFFECTIVE permissions for a request — the only correct source of
 * `platform.admin`.
 *
 * 🔴 EVERY GATE THAT TESTS FOR `platform.admin` MUST CALL THIS, NOT
 * `permissionsForRole`. The role function cannot answer the question: migration
 * 077 made platform authority an un-revoked row in
 * `identity.platform_administrators`, and a role name knows nothing about that
 * row. Between 2026-08-10 and 2026-08-11 seven endpoints were gated on the role
 * function on production, and two of them — `GET /security/posture` and
 * `GET /operations/report` — read server-wide catalogues with no row-level
 * security underneath, so that check WAS the enforcement.
 *
 * ⚠️ BOTH CONDITIONS ARE REQUIRED, and neither is redundant:
 *
 *   · `hasPlatformGrant` — the authority itself, read per request from the
 *     database by `TenantGuard` via `identity.platform_grant_for_subject`
 *     (migration 078), keyed on the validated Keycloak subject. Revocation
 *     takes effect on the next request.
 *   · `activeRole === PLATFORM_ADMIN_ROLE_NAME` — the role the user is ACTING
 *     AS on this request. A granted administrator who uses the role switcher to
 *     act as `workshop_owner` is acting as one; a permission that followed them
 *     across a deliberate downgrade would make the switcher decorative, and
 *     would also disagree with the twenty-nine allow-list files that test the
 *     role name directly.
 *
 * The two are independent on purpose, which is the same shape as
 * `ROLE_TARGET_STAGES` + `STAGE_TRANSITIONS` in `repair/job-card-stages.ts`.
 * `resolveTenantContext` already refuses to make this role active without a
 * grant, so in practice the first condition implies the second is safe — but
 * "another function makes this unreachable" is not a property a security gate
 * should depend on.
 */
export function permissionsForContext(ctx: {
  activeRole: string;
  hasPlatformGrant: boolean;
}): readonly string[] {
  const base = permissionsForRole(ctx.activeRole);
  if (ctx.hasPlatformGrant && ctx.activeRole === PLATFORM_ADMIN_ROLE_NAME) {
    return [...base, PERMISSIONS.platformAdmin];
  }
  return base;
}

/**
 * The role names Postgres accepts as "the platform administrator".
 *
 * 🔴 THIS CONSTANT EXISTS BECAUSE THE TWO VOCABULARIES SILENTLY DISAGREED FOR
 * FOUR MIGRATIONS. Every admin policy in 021-024 tested
 * `identity.current_role_name() = 'admin'`, and the application never sets that
 * string: `tenantSessionStatements` writes `app.current_role` from
 * `ctx.activeRole`, which is the membership's `role_name` —
 * `platform_administrator`. Nine policies and three triggers were therefore
 * unreachable from the running application, and the failure mode was `UPDATE 0`:
 * no error, no refusal, simply nothing happening. Measured 2026-08-01 and fixed
 * in migration 025.
 *
 * The file already warned that the database and the navigation speak different
 * role vocabularies and maps between them (`navRoleFor`). Nothing mapped for
 * SQL, because the policies were written against a name somebody expected the
 * application to use rather than the one it does.
 *
 * `admin` is retained deliberately: seed scripts, migrations and hand-run psql
 * legitimately act as the platform and all set that literal.
 *
 * `permission-matrix.spec` asserts this list against the SQL text of migration
 * 025, so the two cannot drift apart again without a test failing.
 */
/*
 * ⚠️ MIGRATION 077 REMOVED `platform_administrator` FROM THE SQL PREDICATE, so
 * this list is now the single database-compatibility alias and nothing more.
 *
 * Everything above describes why 025 ADDED that name. 077 removed it again, and
 * the two are not a contradiction: 025 fixed policies that were unreachable
 * from the application, and it fixed them with the tool available at the time —
 * the membership `role_name`. 077 replaces the tool. Platform authority is now
 * an un-revoked row in `identity.platform_administrators`, checked by
 * `is_platform_admin()` against `app.user_id`, because a `role_name` is a plain
 * TEXT column on a row inside ONE organisation and had no business opening every
 * tenant table in the database.
 *
 * 🔴 THIS IS NOT A LIST OF ADMINISTRATORS AND MUST NEVER BE USED AS AN
 * AUTHORIZATION GATE. It contains `admin` — the literal that seed scripts,
 * migrations and hand-run psql set — and a real platform administrator's
 * `activeRole` is NOT in it. Gate on `PERMISSIONS.platformAdmin` via
 * `permissionsForRole`, as `security.controller.ts`, `operations.controller.ts`
 * and (since 077) `catalogue.controller.ts` all do.
 */
export const DB_PLATFORM_ADMIN_ROLE_NAMES: readonly string[] = Object.freeze(['admin']);

/**
 * Role authority, STRONGEST FIRST — the tie-break for the default selection in
 * `resolveTenantContext`.
 *
 * ⚠️ WHY THIS IS NEEDED, AND WHY IT IS NOT COSMETIC. The default sorts
 * memberships by ORGANISATION ID ALONE. Two roles in the SAME organisation
 * therefore compare equal, and `Array.prototype.sort` is stable — so the winner
 * was whatever order the database returned the rows in. A user holding both
 * `workshop_owner` and `technician` at one workshop could resolve as the
 * TECHNICIAN and see less than they hold, with nothing on screen to explain it,
 * and the result could differ between two identical requests after a VACUUM.
 *
 * That is precisely why the owner account was given ONE strong role instead of
 * several weak ones (2026-07-31). Stacking roles is only safe once the default
 * is deterministic, which is what this list makes it.
 *
 * ⚠️ IT GRANTS NOTHING. Every candidate it ranks is already an active
 * membership the server proved from the validated token subject. Choosing the
 * strongest of them cannot reach a role the user does not hold — and the role
 * switcher exists so they can deliberately act as a weaker one. Compare the
 * REQUESTED-role path, which throws rather than picking: there a client named
 * something, and silently substituting would hide an authorization probe. Here
 * nothing was named, so there is nothing to contradict.
 *
 * ORDERING IS SOURCED, not invented: `07.txt` pt2 §50 describes owner as "full
 * workshop governance, staff, financial and reporting access" and each
 * subsequent role as a narrower slice. `platform_administrator` leads because
 * §32 gives it the administration surface in its entirety.
 *
 * An UNRANKED role sorts LAST rather than first — a role added to the database
 * before it is added here must never silently outrank a governance role.
 */
export const ROLE_PRECEDENCE: readonly string[] = Object.freeze([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
  // 🔴 085 — AND THIS IS THE SITE THE ORIGINAL ELEVEN-FILE SURVEY MISSED.
  //
  // A role absent from this list ranks WEAKEST (`Number.MAX_SAFE_INTEGER`, see
  // `rolePrecedence` below), so default-role selection silently prefers ANY
  // other membership the person holds. An org admin that loses the tie-break to
  // `customer` would sign in to the wrong workspace and read as a permissions
  // bug rather than a missing list entry.
  //
  // Placed beside the other three org admins because that is what they are:
  // each is the top authority inside one organisation type, and none outranks
  // another. Their operational roles keep their existing, lower positions.
  'insurance_owner',
  'towing_owner',
  'workshop_manager',
  'workshop_supervisor',
  'quality_control_inspector',
  'insurance_assessor',
  'reception_staff',
  'cashier',
  'storekeeper',
  'technician',
  'towing_operator',
  'customer',
]);

/**
 * Rank for the tie-break: LOWER IS STRONGER, unknown roles last.
 *
 * `Number.MAX_SAFE_INTEGER` rather than `Infinity` so the value survives a JSON
 * round trip if it is ever logged — `JSON.stringify(Infinity)` is `null`, and a
 * null in a comparator is a silent zero.
 */
export function rolePrecedence(roleName: string): number {
  const i = ROLE_PRECEDENCE.indexOf(roleName);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
