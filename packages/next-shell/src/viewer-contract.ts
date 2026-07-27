import type { PermissionKey, RoleId } from '@autoworkshop/navigation';

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
  userLabel: string;
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
      userLabel: 'Sign in',
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
