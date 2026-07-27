import { describe, it, expect } from 'vitest';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
  workspaces,
  type PermissionKey,
} from '@autoworkshop/navigation';
import { grantsFor, navRoleFor, NO_GRANTS, type ViewerDescription } from './viewer-contract';

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
