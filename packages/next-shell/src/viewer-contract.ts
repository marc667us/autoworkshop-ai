import type { PermissionKey, RoleId } from '@autoworkshop/navigation';
// A pure string helper in its own server-safe module. Importing it here keeps
// this file free of any client boundary — see the header of `role-label.ts`
// for what happened the last time a pure function lived in a `'use client'`
// module and a server component called it.
import { roleLabel } from './role-label';

/**
 * The viewer contract, as PURE DATA AND PURE FUNCTIONS.
 *
 * WHY THIS FILE IS SEPARATE FROM `viewer.ts`. Resolving the real viewer needs a
 * Keycloak session, which needs `next/headers`, which only exists inside a Next
 * server runtime. But three other things need to reason about the same viewer
 * and none of them run in one: the Playwright journey imports these functions to
 * derive the hrefs it expects, the unit tests exercise the role mapping, and
 * Storybook renders the shell with a fixture. Putting the mapping behind a
 * `next/headers` import would make all three impossible — the suite would fail
 * to load, and the usual repair is to stop importing and hardcode the expected
 * values, at which point the test no longer tests the model.
 *
 * So: this file knows how to TURN a viewer into navigation decisions and never
 * how to FETCH one. `viewer.ts` fetches.
 */

/**
 * `GET /api/v1/me` — the shape the API returns.
 *
 * Mirrors `apps/api/src/identity/me.service.ts::Viewer`. It is duplicated as a
 * type rather than imported because the web apps must not depend on the NestJS
 * application package; the HTTP response is the contract between them, and
 * `describes the /me response` in the API's own spec is what keeps the two in
 * step.
 */
export interface ViewerDescription {
  userId: string;
  displayName: string;
  email: string;
  tenantId: string;
  organizationId: string;
  branchId: string | null;
  /** The ONE role active for this request — `identity.memberships.role_name`. */
  activeRole: string;
  /** Derived server-side from that role. Never sent by the client. */
  permissions: readonly string[];
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    branchId: string | null;
    branchName: string | null;
    roleName: string;
  }>;
}

/**
 * `identity.memberships.role_name` → the navigation's `RoleId`.
 *
 * TWO VOCABULARIES, AND THEY ARE NOT THE SAME ONE. The database and the API
 * speak the snake_case names in `MembershipService`'s grantable-role allow-list
 * (`workshop_owner`, `reception_staff`, `quality_control_inspector`); the
 * navigation model speaks `07.txt` part 2 §50's role ids (`owner`, `reception`,
 * `quality-control`). Nothing mapped between them before, because until now
 * nothing had a real role to map.
 *
 * Only the eight WORKSHOP roles appear. That is correct, not an omission: the
 * role trees of §46–§49 exist only inside the workshop workspace, and a
 * `supplier_owner` resolving to `undefined` here is exactly right — it falls
 * back to the supplier workspace's own §35 tree.
 *
 * FAILS CLOSED. An unrecognised role returns `undefined`, which yields the
 * workspace DEFAULT tree, never a privileged one. `Object.hasOwn` rather than a
 * bare lookup for the reason the API's `permissionsForRole` documents at length:
 * `ROLE_TO_NAV['constructor']` resolves up the prototype chain to the `Object`
 * function, which is truthy, so `?? undefined` never fires and a string that is
 * not a role becomes a "role".
 */
const ROLE_TO_NAV: Readonly<Record<string, RoleId>> = Object.freeze({
  workshop_owner: 'owner',
  workshop_manager: 'manager',
  reception_staff: 'reception',
  workshop_supervisor: 'supervisor',
  technician: 'technician',
  storekeeper: 'storekeeper',
  quality_control_inspector: 'quality-control',
  cashier: 'cashier',
});

export function navRoleFor(activeRole: string | undefined): RoleId | undefined {
  if (!activeRole) return undefined;
  return Object.hasOwn(ROLE_TO_NAV, activeRole) ? ROLE_TO_NAV[activeRole] : undefined;
}

/**
 * Roles that are REAL, and belong to a different workspace than the workshop.
 *
 * 🔴 THE DEFECT THIS EXISTS TO FIX — MEASURED, NOT THEORISED. A signed-in
 * `customer` on workshop-web saw **45 of 45** items in the workshop default
 * tree: Customers (the whole customer book), Vehicles, Job Cards, Technicians,
 * Quotations, Customer Proposals, Parts Depot, Procurement, Suppliers, Warranty
 * Claims and four Reports screens. Permission filtering removed NOTHING,
 * because every item in that tree is ungated.
 *
 * The cause is a single value carrying two facts. `navRoleFor()` returns
 * `undefined` for anything not in `ROLE_TO_NAV`, and `workspaceForRole(base,
 * undefined)` returns the workshop's DEFAULT staff tree. `workspaces.ts`
 * defends that default as "what a member whose role is not yet resolved should
 * see" — which is sound for a STAFF member mid-resolution and wrong for a
 * customer, who is not staff and never becomes staff. `undefined` meant both
 * "staff role not yet resolved" and "not a workshop role at all".
 *
 * This set is the second fact, made explicit. It is the same class of bug as
 * `grantsFor(null)` collapsing "no grants" and "could not ask".
 *
 * ⚠️ `platform_administrator` IS DELIBERATELY ABSENT. It is unmapped too, so it
 * also lands on the default tree — but platform admins have a live history of
 * being unable to use this application without a membership, and sweeping them
 * in here alongside the customer would turn a leak fix into a lockout. Their
 * treatment is a separate, deliberate decision. Do NOT add them "for
 * consistency" without deciding what an admin should actually see.
 *
 * ⚠️ AND THIS IS NOT THE CONTROL. CLAUDE.md §8: hidden ≠ secure. It removes the
 * navigation; `requireNavRoute` REFUSES the routes; the API's tenant guard and
 * Postgres RLS deny independently. All three are required — a customer must not
 * merely fail to see the menu, they must be refused the page.
 */
const NON_WORKSHOP_ROLES: ReadonlySet<string> = new Set([
  'customer',
  'supplier_owner',
  'fleet_administrator',
  // 085 — the two org admins are as foreign to the workshop as the operational
  // roles they administer. Omitting them would have had the OPPOSITE effect of
  // the bug this set was written for: instead of refusing a role its own
  // workspace, it would have handed an insurer's administrator the workshop's
  // default staff tree, which is precisely what happened to
  // `platform_administrator` and was reported by the owner on 2026-08-09.
  'insurance_owner',
  'insurance_assessor',
  'towing_owner',
  'towing_operator',
]);

/**
 * WHERE EACH OF THOSE ROLES ACTUALLY LIVES.
 *
 * 🔴 THE DEFECT THIS FIXES, AND IT REFUSED FOUR APPS' OWN USERS. The set above
 * answers "is this role foreign to THE WORKSHOP", which is the right question in
 * workshop-web and the wrong one everywhere else — yet `requireNavRoute` and
 * `renderModulePage` both asked it while holding the `workspaceId` that would
 * have made it right. Every one of them is passed a workspace and ignored it.
 *
 * The consequence, by reading: a signed-in `customer` on CUSTOMER-web, a
 * `supplier_owner` on SUPPLIER-web, a `towing_operator` on TOWING-web and a
 * `fleet_administrator` on FLEET-web were each refused with `notFound()` on
 * their own workspace's screens — the four apps those roles exist for.
 *
 * ⚠️ IT SURVIVED BECAUSE NOBODY HAS EVER SIGNED IN ON LIVE. The live suite's
 * signed-in job has been SKIPPED for want of `LIVE_OWNER_EMAIL` since it was
 * written (gap A1), and the four roles above could not be created in production
 * at all until 2026-08-08/09 — `customer`, `supplier_owner` and
 * `fleet_administrator` each had no writer. The anonymous half of every gate
 * passes, because an anonymous visitor has no role and `undefined` is not
 * foreign to anything.
 *
 * ⚠️ ANY ROLE NOT NAMED HERE IS WORKSHOP STAFF, which keeps the original fix
 * exactly as it was: `undefined` (staff mid-resolution) and
 * `platform_administrator` (deliberately unmapped, see above) both land on
 * `workshop`, so neither becomes foreign anywhere it was not before.
 */
const HOME_WORKSPACE: Readonly<Record<string, string>> = {
  customer: 'customer',
  supplier_owner: 'supplier',
  fleet_administrator: 'fleet',
  // 085 — an org admin lands in the workspace it administers. A role in
  // `NON_WORKSHOP_ROLES` but absent from THIS map is foreign to the workshop
  // and at home nowhere, which is the strictly worst of the two lists to be
  // half-listed in: `homeWorkspaceFor()` is also what the role and organisation
  // switchers now use to decide where to send someone, so a missing entry
  // strands the viewer exactly as the 2026-08-16 switcher defect did.
  insurance_owner: 'insurance',
  insurance_assessor: 'insurance',
  towing_owner: 'towing',
  towing_operator: 'towing',
  /**
   * 🔴 THE OWNER'S REPORT, 2026-08-09: "if i log in as the owner and sign out
   * and login as admin i still see owner page features."
   *
   * NOT a session bleed. Sign-out is sound — `performSignOut` clears the
   * `aw.activeRole` / `aw.activeOrganization` switcher cookies, which was fixed
   * on 08-07 after the owner reported the customer version of this. The cause is
   * one line further on: `platform_administrator` is absent from `ROLE_TO_NAV`,
   * so `navRoleFor()` returns `undefined`, and `workspaceForRole(base,
   * undefined)` hands back the workshop's DEFAULT STAFF TREE — all 45 ungated
   * items. An administrator signing into the apex was shown the owner's menu
   * because nothing had said where an administrator belongs.
   *
   * ⚠️ THIS WAS A DELIBERATELY DEFERRED DECISION AND THE CIRCUMSTANCES CHANGED.
   * `NON_WORKSHOP_ROLES` says of this role: "platform admins have a live history
   * of being unable to use this application without a membership, and sweeping
   * them in here alongside the customer would turn a leak fix into a LOCKOUT.
   * Do NOT add them for consistency without deciding what an admin should
   * actually see." That was correct when there was nowhere else for them to go.
   * `admin-web` was deployed on 2026-08-09 with five working screens —
   * organizations, registrations, products, security, operations-dashboard — so
   * an administrator now HAS a workspace, and naming it is no longer a lockout.
   *
   * The consequence, stated: on the apex a platform administrator no longer sees
   * the workshop staff menu. `workshop-web`'s layout already renders the
   * foreign-workspace state for exactly this case. Their screens are on
   * admin-web. Reverting is deleting this one line.
   */
  platform_administrator: 'admin',
};

/**
 * Whether this role belongs to a DIFFERENT workspace than the one being
 * rendered — the question both route guards meant to ask.
 *
 * `false` for an ABSENT role, exactly as `isForeignToWorkshop` is and for the
 * same reason: absent means "not yet resolved", which is the staff-mid-render
 * case the default tree exists for, and also the signed-out visitor.
 *
 * 🔴 STILL NOT THE CONTROL. CLAUDE.md §8: hidden ≠ secure. This removes a
 * screen from someone who should not see it; the API's `TenantGuard`, the
 * services' role checks and Postgres RLS deny independently, and every page
 * must remain safe if this call were deleted.
 */
/**
 * WHICH PACK A ROLE BELONGS IN — `main`'s dispatch (ADR-021).
 *
 * `HOME_WORKSPACE` has always encoded this; until the consolidation nothing
 * needed to ASK it, because each pack was its own deployed application and a
 * person arrived at the right hostname by holding the right link. One artifact
 * has one front door, so `/` now has to decide where a signed-in visitor goes.
 *
 * ⚠️ THE `workshop` DEFAULT IS DELIBERATE AND IS NOT A GUESS. It matches
 * `isForeignToWorkspace` exactly — every workshop staff role (owner, manager,
 * technician, reception, cashier) is absent from the map for that reason, and a
 * role nobody has mapped yet is far better served by the workshop tree, whose
 * gating is the most thoroughly exercised in the product, than by a 404 at the
 * front door.
 */
export function homeWorkspaceFor(activeRole: string | undefined): string {
  if (activeRole === undefined) return 'workshop';
  return HOME_WORKSPACE[activeRole] ?? 'workshop';
}

export function isForeignToWorkspace(
  workspaceId: string,
  activeRole: string | undefined,
): boolean {
  if (activeRole === undefined) return false;
  return (HOME_WORKSPACE[activeRole] ?? 'workshop') !== workspaceId;
}

/**
 * Whether this role belongs to a different workspace than the workshop.
 *
 * `false` for an ABSENT role, deliberately: absent means "not yet resolved",
 * which is the staff-mid-resolution case the default tree exists for, and also
 * what a cold `/me` produces. Treating unknown as foreign would lock out a real
 * member the moment the API was slow.
 */
export function isForeignToWorkshop(activeRole: string | undefined): boolean {
  return activeRole !== undefined && NON_WORKSHOP_ROLES.has(activeRole);
}

/**
 * What the viewer may SEE in the navigation.
 *
 * A straight pass-through of the API's list — the permission strings the API
 * computes (`finance.read`, `organization.admin`, `platform.admin`) are already
 * the navigation's `PermissionKey`s, and re-deriving them here from the role
 * would create a second permission matrix that could disagree with the API's.
 * One matrix, server-side, in `apps/api/src/authz/permission-matrix.ts`.
 */
export function grantsFor(viewer: ViewerDescription | null): readonly PermissionKey[] {
  return viewer ? viewer.permissions : NO_GRANTS;
}

/** The identity strip in the top navigation (`01 (1).txt` §5). */
export interface ViewerLabels {
  organizationLabel: string;
  branchLabel: string;
  /**
   * The signed-in user's name. **Absent means nobody is signed in**, and that
   * is now load-bearing rather than cosmetic: the account control renders Sign
   * out when it is present and Sign in when it is not.
   *
   * It used to be the string `'Sign in'` for a signed-out viewer, which read
   * fine as a chip and was a lie as a value — the account control believed it
   * and offered Sign out to an anonymous visitor. A display label must never
   * double as an authentication fact.
   */
  userLabel?: string;
  /**
   * The role the viewer is ACTING AS, humanised — owner request 2026-08-03:
   * "the login user['s] role must show at the top right".
   *
   * It was not shown anywhere for most viewers. The active role appeared only
   * inside the `RoleSwitcher`'s `<select>`, which renders `null` below two
   * options (`RoleSwitcher.tsx`) — so every single-role account, which is most
   * of them, had no way to see what it was acting as.
   *
   * Absent for a signed-out viewer, for the same reason `userLabel` is: there
   * is no role to state, and naming a plausible one would be a false statement
   * in the strip a user reads to check whose session they are in.
   */
  roleLabel?: string;
}

/**
 * The organisation, branch and user names to show in the top bar.
 *
 * The names come from the viewer's MEMBERSHIP rows, matched to the active
 * organisation and branch, because `/me` returns ids for the active context and
 * names only in the membership list — the switchers (T-0016) need the names
 * anyway, so nothing extra is fetched for this.
 *
 * The signed-out labels say "Not signed in" rather than falling back to the old
 * "Demo Motors Ltd". A shell that names a plausible organisation to an
 * unauthenticated viewer is stating something false in the one place a user
 * checks to see whose data they are looking at — and on a shared workshop
 * terminal, "whose account is this" is the question the strip exists to answer.
 */
export function viewerLabels(viewer: ViewerDescription | null): ViewerLabels {
  if (!viewer) {
    return {
      organizationLabel: 'Not signed in',
      branchLabel: '—',
      // Undefined, not a prompt. The prompt is the Sign in button beside it;
      // two controls both reading "Sign in", one of them inert text, is the
      // ambiguity §70 forbids.
      userLabel: undefined,
      roleLabel: undefined,
    };
  }

  // Prefer the membership that matches BOTH the active organisation and the
  // active branch; fall back to the organisation alone, because a membership
  // may legitimately have no branch.
  const memberships = viewer.memberships;
  const exact = memberships.find(
    (m) => m.organizationId === viewer.organizationId && m.branchId === viewer.branchId,
  );
  const byOrganization = exact ?? memberships.find((m) => m.organizationId === viewer.organizationId);

  return {
    // An id would be worse than a placeholder here: it looks like a name, so
    // nobody reports it as missing.
    organizationLabel: byOrganization?.organizationName ?? 'Unknown organisation',
    branchLabel: byOrganization?.branchName ?? 'All branches',
    userLabel: viewer.displayName,
    // ⚠️ FROM `activeRole`, NOT from the membership row matched above. The
    // matched row is chosen by organisation and branch, and one user can hold
    // SEVERAL roles in one organisation — `owner@` holds three. `activeRole` is
    // the one the API actually resolved for this request and therefore the one
    // every page's data was fetched as; a chip naming a different one would be
    // the nav/router divergence in the strip that exists to prevent it.
    roleLabel: roleLabel(viewer.activeRole),
  };
}

/**
 * What an unauthenticated viewer holds: nothing.
 *
 * The previous demo implementation returned `['organization.admin']` to anyone
 * at all. Returning an empty list is not merely more correct — it is what makes
 * the permission filter observable, because a viewer holding every gated key
 * makes every gated item visible and the fail-closed tests skip. That exact
 * failure is why `at least one workspace must exercise permission gating`
 * exists.
 */
export const NO_GRANTS: readonly PermissionKey[] = Object.freeze([]);

/**
 * The DISTINCT organizations a viewer belongs to, for the §5 switcher.
 *
 * `/me` returns one membership row per organization AND BRANCH AND ROLE, so a
 * user who is a service adviser at two branches of one workshop has two rows
 * naming the same organization. Feeding those straight to a `<select>` renders
 * the same option twice, which reads as a bug and — worse — makes the switcher
 * look like it has choices it does not.
 *
 * Pure, so it can be asserted without a Next runtime. Order is preserved from
 * the API, which already sorts by organization name.
 */
export function organizationsFromMemberships(
  memberships: readonly { organizationId: string; organizationName: string }[],
): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const m of memberships) {
    if (seen.has(m.organizationId)) continue;
    seen.add(m.organizationId);
    out.push({ id: m.organizationId, name: m.organizationName });
  }
  return out;
}

/**
 * The DISTINCT roles a viewer may act as IN ONE ORGANIZATION.
 *
 * ⚠️ SCOPED TO THE ACTIVE ORGANIZATION, AND THAT IS THE WHOLE CORRECTNESS
 * ARGUMENT. Every API call sends `x-organization-id` AND `x-role-name`
 * together (`api.ts`), and `resolveTenantContext` requires a membership
 * matching BOTH — it refuses a role the viewer holds only in a DIFFERENT
 * organization, which is a rule with its own test. So a switcher listing roles
 * from across all memberships can offer a pair that cannot exist: pick
 * `workshop_manager` while `Abossey Motors` is active and every subsequent
 * request is refused until you also change organization. The refusal is
 * correct; OFFERING the choice that causes it is not.
 *
 * Codex found this on the rollout diff, rated MEDIUM, and it was inherited from
 * the original inline implementation rather than introduced by the extraction —
 * the global `new Set(...)` shipped in `workshop-web` on 2026-07-31. It only
 * became reachable when a second organization existed.
 *
 * Deduplicated WITHIN that organization: `/me` returns one row per BRANCH as
 * well, so a technician at two branches of one workshop is still one choice.
 *
 * ⚠️ A USABILITY FILTER, NEVER AN AUTHORIZATION ONE. It reads memberships `/me`
 * reported, so it cannot offer a role the viewer does not hold — but the API
 * re-checks against memberships proved from the validated token subject and
 * REFUSES rather than downgrading. Rendering fewer options protects nothing on
 * its own (CLAUDE.md §8, `05.txt` "hidden is not secure").
 *
 * Pure, so it can be asserted without a Next runtime.
 */
/**
 * Does the viewer hold this role IN THE ORGANIZATION THEY ARE ACTUALLY IN?
 *
 * ⚠️ THE PAIR IS THE UNIT, NOT EITHER HALF. Every API call sends
 * `x-organization-id` and `x-role-name`, and each header used to be validated
 * on its own: the organization against any membership, the role against any
 * membership. Both can pass while the COMBINATION exists nowhere — hold
 * `workshop_manager` in org-2 and `technician` in org-1, select org-1, and
 * `(org-1, workshop_manager)` is sent and refused by the API.
 *
 * Codex found this on the second review pass. It is not reachable through the
 * UI any more — the switcher only offers roles held in the active organization,
 * and changing organization clears the stored role — but it is reachable the
 * way stale selections always are: a membership REVOKED while the user is
 * signed in. `/me` recovers by retrying without the selection, so the shell
 * renders and looks healthy while every page's data call is refused. A visibly
 * working application whose content is all errors is worse than a clear
 * failure.
 *
 * Anchored on the RESOLVED organization (`viewer.organizationId`) rather than
 * the cookie: that is the organization the API actually chose for this render,
 * so it is the one the next request will be judged against.
 *
 * Pure, so the rule can be asserted without a Next runtime — which is the
 * reason it lives here rather than inline in `viewer.ts`.
 */
export function holdsRoleInActiveOrganization(
  viewer: Pick<ViewerDescription, 'organizationId' | 'memberships'>,
  roleName: string,
): boolean {
  return viewer.memberships.some(
    (m) => m.roleName === roleName && m.organizationId === viewer.organizationId,
  );
}

export function rolesFromMemberships(
  memberships: readonly { organizationId: string; roleName: string }[],
  organizationId: string,
): Array<{ name: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; label: string }> = [];
  for (const m of memberships) {
    if (m.organizationId !== organizationId) continue;
    if (seen.has(m.roleName)) continue;
    seen.add(m.roleName);
    out.push({ name: m.roleName, label: roleLabel(m.roleName) });
  }
  return out;
}
