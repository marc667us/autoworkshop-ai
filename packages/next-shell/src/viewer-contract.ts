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
