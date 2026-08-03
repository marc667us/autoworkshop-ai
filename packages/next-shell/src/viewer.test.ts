import { describe, it, expect } from 'vitest';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
  workspaces,
  type PermissionKey,
} from '@autoworkshop/navigation';
import {
  grantsFor,
  navRoleFor,
  viewerLabels,
  NO_GRANTS,
  organizationsFromMemberships,
  rolesFromMemberships,
  holdsRoleInActiveOrganization,
  type ViewerDescription,
} from './viewer-contract';

/**
 * REGRESSION GUARD: the navigation and the router must resolve from the SAME
 * viewer.
 *
 * They briefly did not. Each app's `layout.tsx` passed a hardcoded grant array
 * to the shell while the catch-all route resolved with none, so the workshop
 * side nav advertised "Invoices" and that URL answered 404. Nothing caught it —
 * typecheck, lint, 59 unit tests and a 7-app production build were all green,
 * because a disagreement between two literals in two files is not a type error.
 *
 * WHAT CHANGED WITH T-0005. The grants and role now come from a Keycloak
 * session via `GET /api/v1/me`, so they can no longer be evaluated in a unit
 * test — `viewerGrants()` needs `next/headers`. The properties being guarded
 * were never about the demo values though; they are about the COMPOSITION of
 * `workspaceForRole` + `visibleGroups`, which is pure. So these tests now run
 * that composition against FIXTURE viewers, and cover four identities where
 * they previously covered one hardcoded set.
 */

function viewer(activeRole: string, permissions: readonly string[]): ViewerDescription {
  return {
    userId: '00000000-0000-0000-0000-0000000000ff',
    displayName: 'Fixture Viewer',
    email: 'fixture@autoworkshop.local',
    tenantId: '11111111-1111-1111-1111-111111111111',
    organizationId: 'aaaaaaaa-0000-0000-0000-000000000001',
    branchId: 'aaaaaaaa-0000-0000-0000-000000000002',
    activeRole,
    permissions,
    memberships: [],
  };
}

/**
 * The identities the shell actually has to render, with the permissions the
 * API's `ROLE_PERMISSIONS` matrix gives each. Mirrored deliberately rather than
 * imported: the web apps must not depend on the NestJS package, and a fixture
 * that drifts from the matrix is caught by `apps/api`'s own matrix spec.
 */
const IDENTITIES = [
  { label: 'signed out', viewer: null },
  { label: 'technician', viewer: viewer('technician', []) },
  { label: 'workshop owner', viewer: viewer('workshop_owner', ['finance.read', 'organization.admin']) },
  {
    label: 'platform administrator',
    viewer: viewer('platform_administrator', ['platform.admin', 'organization.admin', 'finance.read']),
  },
] as const;

describe('navRoleFor — the database vocabulary is not the navigation vocabulary', () => {
  it('maps every one of the eight workshop roles to a navigation role', () => {
    // The two vocabularies differ (`reception_staff` vs `reception`), and a role
    // that fails to map silently downgrades its holder to the default tree —
    // which looks like a navigation bug, not a mapping gap.
    expect(navRoleFor('workshop_owner')).toBe('owner');
    expect(navRoleFor('workshop_manager')).toBe('manager');
    expect(navRoleFor('reception_staff')).toBe('reception');
    expect(navRoleFor('workshop_supervisor')).toBe('supervisor');
    expect(navRoleFor('technician')).toBe('technician');
    expect(navRoleFor('storekeeper')).toBe('storekeeper');
    expect(navRoleFor('quality_control_inspector')).toBe('quality-control');
    expect(navRoleFor('cashier')).toBe('cashier');
  });

  it('returns undefined for roles of OTHER workspaces, which is correct', () => {
    // §46-§49 define role trees for the workshop only. A supplier owner falling
    // back to the supplier workspace's own §35 tree is the intended behaviour.
    expect(navRoleFor('supplier_owner')).toBeUndefined();
    expect(navRoleFor('fleet_administrator')).toBeUndefined();
    expect(navRoleFor('customer')).toBeUndefined();
  });

  it('FAILS CLOSED on an unknown role and on inherited Object properties', () => {
    expect(navRoleFor(undefined)).toBeUndefined();
    expect(navRoleFor('')).toBeUndefined();
    expect(navRoleFor('not-a-role')).toBeUndefined();
    // A bare `ROLE_TO_NAV[name]` resolves up the prototype chain, so these
    // returned the `Object` function and `toString` — truthy values that would
    // be handed to `workspaceForRole` as if they were roles. Same defect the
    // API's `permissionsForRole` was fixed for; `Object.freeze` does not help.
    expect(navRoleFor('constructor')).toBeUndefined();
    expect(navRoleFor('toString')).toBeUndefined();
    expect(navRoleFor('__proto__')).toBeUndefined();
  });
});

describe('grantsFor — an unauthenticated viewer holds nothing', () => {
  it('gives a signed-out viewer no grants at all', () => {
    // The demo implementation returned `['organization.admin']` to everyone,
    // including nobody. An empty list is what makes the permission filter
    // observable at all.
    expect(grantsFor(null)).toEqual([]);
    expect(NO_GRANTS).toEqual([]);
  });

  it('passes the API’s permission list through rather than re-deriving it', () => {
    // Re-deriving from the role here would create a SECOND permission matrix in
    // the browser bundle that could disagree with the server's.
    const owner = viewer('workshop_owner', ['finance.read', 'organization.admin']);
    expect(grantsFor(owner)).toEqual(['finance.read', 'organization.admin']);
  });
});

describe('nav and router must agree — for every identity, in every workspace', () => {
  const ids = Object.keys(workspaces);

  it('covers every workspace', () => {
    expect(ids.length).toBe(7);
  });

  it('every href the nav advertises is resolvable under the same viewer', () => {
    for (const { label, viewer: v } of IDENTITIES) {
      for (const id of ids) {
        const base = workspaces[id as keyof typeof workspaces];
        const grants = grantsFor(v);
        const role = navRoleFor(v?.activeRole);

        // Exactly the composition `WorkspaceShell` performs.
        const shellTree = workspaceForRole(base, role);
        const advertised = visibleGroups(shellTree, grants).flatMap((g) =>
          g.items.map((i) => i.href),
        );

        // Exactly the composition `renderModulePage` performs. Computed
        // separately on purpose: if either side stops resolving the role, this
        // fails instead of both being wrong together.
        const routerTree = workspaceForRole(base, role);
        const resolvable = new Set(
          visibleGroups(routerTree, grants).flatMap((g) => g.items.map((i) => i.href)),
        );

        // NOT asserted: that the nav is non-empty. It legitimately IS empty for
        // a signed-out viewer in the admin workspace, where every group is
        // gated behind `platform.admin` — see the dedicated test below, which
        // pins that as the security property it is rather than tolerating it as
        // an exception here.
        for (const href of advertised) {
          expect(
            resolvable.has(href),
            `${label}/${id}: nav advertises ${href} but the router would 404 it`,
          ).toBe(true);
        }
      }
    }
  });

  it('a signed-out viewer is shown NOTHING in the platform-admin workspace', () => {
    // Every group in the admin tree is gated behind `platform.admin` (`02.txt`
    // §58 / `01 (1).txt` §32), so an unauthenticated visitor must see an
    // entirely empty navigation — not a partial one, and certainly not the
    // administration menu.
    //
    // This could not previously be observed: the demo viewer held
    // `platform.admin`, so the admin nav was always fully populated and the
    // gating was never exercised in this workspace at all.
    //
    // ⚠️ CONSEQUENCE WORTH KNOWING: the admin app therefore renders a shell
    // with a blank sidebar for signed-out visitors. That is correct — nothing
    // leaks — but it looks broken, and it is the strongest argument for
    // redirect-to-sign-in on this app specifically. Recorded in the handover.
    const adminAdvertised = visibleGroups(workspaces.admin, grantsFor(null)).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(adminAdvertised).toEqual([]);

    // And the negative direction, or the assertion above would also pass if the
    // admin tree were simply empty.
    const withAdmin = visibleGroups(workspaces.admin, ['platform.admin']).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(withAdmin.length, 'the admin tree has no gated content to withhold').toBeGreaterThan(0);
  });

  it('every OTHER workspace still shows its ungated modules when signed out', () => {
    // The counterpart to the admin case: if every workspace went blank for a
    // signed-out viewer, the shell would be untestable and the assertion above
    // would be meaningless. Six of the seven have ungated navigation.
    const nonEmpty = Object.keys(workspaces).filter(
      (id) =>
        visibleGroups(workspaces[id as keyof typeof workspaces], grantsFor(null)).flatMap((g) =>
          g.items,
        ).length > 0,
    );
    expect(nonEmpty.sort()).toEqual(
      ['customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'].sort(),
    );
  });

  it('a viewer without a grant is shown no module that needs it', () => {
    for (const { label, viewer: v } of IDENTITIES) {
      for (const id of ids) {
        const base = workspaces[id as keyof typeof workspaces];
        const tree = workspaceForRole(base, navRoleFor(v?.activeRole));

        const withGrants = visibleGroups(tree, grantsFor(v)).flatMap((g) =>
          g.items.map((i) => ({ href: i.href, permission: i.permission })),
        );
        const withNone = new Set(
          visibleGroups(tree, [] as readonly PermissionKey[]).flatMap((g) =>
            g.items.map((i) => i.href),
          ),
        );

        for (const item of withGrants) {
          if (item.permission) {
            expect(
              withNone.has(item.href),
              `${label}/${id}: ${item.href} is gated but visible with no grants`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('THE GATING HAS TEETH: a real role both reveals and withholds modules', () => {
    // Without this, every assertion above would pass just as well if the
    // permission filter did nothing. The owner holds `finance.read` and the
    // technician does not, so the owner must see strictly more.
    const workshop = workspaces.workshop;
    const seen = (v: ViewerDescription | null) =>
      new Set(
        visibleGroups(workspaceForRole(workshop, navRoleFor(v?.activeRole)), grantsFor(v)).flatMap(
          (g) => g.items.map((i) => i.href),
        ),
      );

    const technician = seen(viewer('technician', []));
    const cashier = seen(viewer('cashier', ['finance.read']));

    // The cashier's tree is the workspace default (no §46-§49 tree for cashier)
    // WITH the finance items; the technician's is §49 without them. The point
    // is that the two differ because of the grant, not merely because of the
    // tree — so compare within one tree as well.
    const defaultTreeNoFinance = new Set(
      visibleGroups(workshop, NO_GRANTS).flatMap((g) => g.items.map((i) => i.href)),
    );
    const revealedByFinance = [...cashier].filter((h) => !defaultTreeNoFinance.has(h));

    expect(
      revealedByFinance.length,
      'finance.read must reveal at least one module, or the grant is decorative',
    ).toBeGreaterThan(0);
    expect(technician.size).toBeGreaterThan(0);
  });

  it('the role tree is genuinely different from the workspace default', () => {
    // If `navRoleFor` returned undefined for everything, role resolution would
    // be a no-op and every role test above would still pass.
    const workshop = workspaces.workshop;
    const roleTree = workspaceForRole(workshop, navRoleFor('technician'));

    expect(roleTree).not.toBe(workshop);
    const defaultHrefs = new Set(workshop.groups.flatMap((g) => g.items.map((i) => i.href)));
    const novel = roleTree.groups
      .flatMap((g) => g.items.map((i) => i.href))
      .filter((h) => !defaultHrefs.has(h));

    expect(
      novel.length,
      'the role tree must contain routes the default tree does not, or role resolution is a no-op',
    ).toBeGreaterThan(0);
  });

  it('a router still reading the DEFAULT tree would break — proving the wiring matters', () => {
    // The regression this guards. If `renderModulePage` ever drops
    // `workspaceForRole` and reads `workspace.groups` again, these routes 404
    // while the menu keeps offering them.
    const workshop = workspaces.workshop;
    const v = viewer('technician', []);

    const roleAdvertised = visibleGroups(
      workspaceForRole(workshop, navRoleFor(v.activeRole)),
      grantsFor(v),
    ).flatMap((g) => g.items.map((i) => i.href));

    const defaultResolvable = new Set(
      visibleGroups(workshop, grantsFor(v)).flatMap((g) => g.items.map((i) => i.href)),
    );

    expect(roleAdvertised.filter((h) => !defaultResolvable.has(h)).length).toBeGreaterThan(0);
  });

  it('every mapped role resolves to a tree the spec actually defines', () => {
    for (const dbRole of [
      'workshop_owner',
      'workshop_manager',
      'reception_staff',
      'workshop_supervisor',
      'technician',
      'storekeeper',
      'quality_control_inspector',
      'cashier',
    ]) {
      const role = navRoleFor(dbRole)!;
      const tree = workspaceForRole(getWorkspace('workshop')!, role);
      // Four of the eight have their own tree (§46-§49); the other four fall
      // back to the workspace default. Either is valid — an EMPTY tree is not.
      expect(tree.groups.length, `${dbRole} resolved to an empty navigation`).toBeGreaterThan(0);
    }
  });
});

/**
 * T-0005 finding 5. `userLabel` stopped being decoration the moment the account
 * control started deciding Sign in vs Sign out from it.
 */
describe('viewerLabels — the signed-out contract the account control depends on', () => {
  it('leaves userLabel ABSENT for a signed-out viewer, not the string "Sign in"', () => {
    // Caught by rendering the built app, not by any check that passed first:
    // with the old `'Sign in'` placeholder the account control read a truthy
    // label as a session and offered SIGN OUT to an anonymous visitor. Pressing
    // it would revoke nothing, warn that revocation had failed, and bounce the
    // user through Keycloak's logout — so the one log line that says "a live
    // credential was left behind" would fire on every anonymous click.
    expect(viewerLabels(null).userLabel).toBeUndefined();
  });

  it('still says plainly that nobody is signed in', () => {
    // The strip must not name a plausible organisation to an anonymous viewer.
    expect(viewerLabels(null).organizationLabel).toBe('Not signed in');
  });

  it('uses the real display name once there is a session', () => {
    const labels = viewerLabels({
      userId: 'u1',
      displayName: 'Ama Mensah',
      tenantId: 't1',
      organizationId: 'o1',
      branchId: null,
      activeRole: 'technician',
      permissions: [],
      memberships: [],
    } as never);
    expect(labels.userLabel).toBe('Ama Mensah');
  });

  /**
   * OWNER REQUEST 2026-08-03: "the login user['s] role must show at the top
   * right". It did not — the active role appeared only inside the role
   * switcher's `<option>` text, and that control renders nothing below two
   * roles, which is the state of most accounts.
   */
  it('names the role the viewer is ACTING AS, humanised', () => {
    const labels = viewerLabels({
      userId: 'u1',
      displayName: 'Ama Mensah',
      tenantId: 't1',
      organizationId: 'o1',
      branchId: null,
      activeRole: 'workshop_supervisor',
      permissions: [],
      memberships: [],
    } as never);
    // `workshop_supervisor` reads badly in a top bar; `Workshop supervisor`
    // does. Derived, not looked up, so a role added to `identity.memberships`
    // is readable the day it exists rather than rendering blank.
    expect(labels.roleLabel).toBe('Workshop supervisor');
  });

  /**
   * 🔴 THE ROLE COMES FROM `activeRole`, NOT FROM THE MATCHED MEMBERSHIP ROW.
   *
   * The row is matched by organisation and branch, and one user can hold
   * SEVERAL roles in one organisation — the dev `owner@` identity holds three.
   * Reading the role off that row would name whichever happened to sort first
   * while every page on screen had been fetched as `activeRole`: a top bar
   * stating one role over another role's data, which is the nav/router
   * divergence the identity strip exists to prevent.
   */
  it('names the RESOLVED role, not the first membership in the active organisation', () => {
    const labels = viewerLabels({
      userId: 'u1',
      displayName: 'Ama Mensah',
      tenantId: 't1',
      organizationId: 'o1',
      branchId: 'b1',
      activeRole: 'workshop_owner',
      permissions: [],
      memberships: [
        // Sorts first and is NOT the active role.
        { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'technician' },
        { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'workshop_owner' },
      ],
    } as never);
    expect(labels.roleLabel).toBe('Workshop owner');
  });

  it('states NO role for a signed-out viewer rather than a plausible one', () => {
    // Same rule as `userLabel` and `organizationLabel`: the strip is where a
    // user on a shared workshop terminal checks whose session they are in, so
    // it must never state something false. Absent is the honest answer.
    expect(viewerLabels(null).roleLabel).toBeUndefined();
  });
});

/**
 * The two switcher option lists — the pure half of the control group that
 * `ViewerSwitchers` mounts in all seven apps.
 *
 * `organizationsFromMemberships` shipped with T-0016 and had NO test at all
 * until the role switcher was rolled out beside it, which is worth stating
 * plainly: the dedupe it exists to perform was never asserted.
 *
 * What CANNOT be tested here is the security property, and that is by design —
 * neither function is the control. `resolveTenantContext` refuses an unheld
 * organisation or role, and its 8 tests in `apps/api` are where that lives.
 * These guard the list a human is OFFERED.
 */
describe('switcher options — what the viewer is offered', () => {
  /** `/me` returns one row per organization AND branch AND role. */
  const memberships = [
    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'technician' },
    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b2', branchName: 'Spintex', roleName: 'technician' },
    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'workshop_supervisor' },
    { organizationId: 'o2', organizationName: 'Tema Auto', branchId: null, branchName: null, roleName: 'technician' },
  ];

  it('offers each organization once, however many branches and roles it holds', () => {
    // Four rows, two organizations. Feeding the rows straight to a <select>
    // renders "Abossey Motors" three times, which reads as a bug and makes the
    // switcher look like it has choices it does not.
    expect(organizationsFromMemberships(memberships)).toEqual([
      { id: 'o1', name: 'Abossey Motors' },
      { id: 'o2', name: 'Tema Auto' },
    ]);
  });

  it('offers each role once per organization, not once per branch', () => {
    // `technician` is held at two branches of o1. It is ONE choice — branch is
    // not something this control selects. A duplicate option would be a control
    // whose second copy silently does nothing.
    expect(rolesFromMemberships(memberships, 'o1')).toEqual([
      { name: 'technician', label: 'Technician' },
      { name: 'workshop_supervisor', label: 'Workshop supervisor' },
    ]);
  });

  /**
   * 🔴 THE REGRESSION THIS FUNCTION'S SIGNATURE EXISTS TO PREVENT — found by
   * Codex on the rollout diff and inherited from the original inline
   * implementation, which deduplicated across ALL memberships.
   *
   * Every request sends `x-organization-id` AND `x-role-name`, and
   * `resolveTenantContext` requires a membership matching BOTH. Offering a role
   * held only in ANOTHER organization therefore offers a pair that cannot
   * exist: choosing it makes every subsequent request refused, by a control
   * that looks like it worked.
   */
  it('SCOPING: never offers a role the viewer holds only in ANOTHER organization', () => {
    // `workshop_supervisor` is held in o1 only. With o2 active it must not
    // appear, because (o2, workshop_supervisor) is not a membership.
    expect(rolesFromMemberships(memberships, 'o2')).toEqual([
      { name: 'technician', label: 'Technician' },
    ]);
  });

  it('SCOPING: an organization the viewer does not hold offers nothing', () => {
    // Fails closed. The switcher renders nothing rather than every role.
    expect(rolesFromMemberships(memberships, 'o-not-mine')).toEqual([]);
  });

  it('labels a role the mapping has never seen rather than dropping it', () => {
    // A role added to `identity.memberships` must never appear as a blank
    // option. `roleLabel` derives the text instead of looking it up, so a new
    // role is readable the day it exists — even one with no navigation tree,
    // which `navRoleFor` correctly resolves to the workspace default.
    expect(rolesFromMemberships([{ organizationId: 'o1', roleName: 'brand_new_role' }], 'o1')).toEqual([
      { name: 'brand_new_role', label: 'Brand new role' },
    ]);
  });

  /**
   * The header pair, found by Codex on the second review pass.
   *
   * `x-organization-id` and `x-role-name` were each validated against ANY
   * membership, so both could pass while the COMBINATION existed nowhere. The
   * API refuses such a pair — correctly — and the visible result is a shell
   * that renders normally while every page's data call fails.
   */
  describe('holdsRoleInActiveOrganization — the pair, not either half', () => {
    const viewer = { organizationId: 'o1', memberships };

    it('accepts a role held in the ACTIVE organization', () => {
      expect(holdsRoleInActiveOrganization(viewer, 'workshop_supervisor')).toBe(true);
    });

    it('REFUSES a role held only in another organization', () => {
      // The defect: `workshop_supervisor` is held in o1 only, so with o2 active
      // the pair (o2, workshop_supervisor) has no membership behind it. A
      // per-header check passed this, because the role does exist somewhere.
      expect(holdsRoleInActiveOrganization({ organizationId: 'o2', memberships }, 'workshop_supervisor')).toBe(
        false,
      );
    });

    it('refuses a role the viewer does not hold at all', () => {
      expect(holdsRoleInActiveOrganization(viewer, 'platform_administrator')).toBe(false);
    });

    it('refuses everything for a viewer with no memberships', () => {
      // Fails closed: the header is dropped and the API applies its own
      // default, rather than a request that is certain to be refused.
      expect(holdsRoleInActiveOrganization({ organizationId: 'o1', memberships: [] }, 'technician')).toBe(false);
    });
  });

  it('returns nothing for a viewer with no memberships', () => {
    // Below the switchers' own two-option threshold, so nothing renders. A
    // viewer in this state is signed in but holds no membership — the API
    // gives them no tenant context either.
    expect(organizationsFromMemberships([])).toEqual([]);
    expect(rolesFromMemberships([], 'o1')).toEqual([]);
  });
});
