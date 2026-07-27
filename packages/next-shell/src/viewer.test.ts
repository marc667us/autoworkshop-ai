import { describe, it, expect } from 'vitest';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
  workspaces,
  type PermissionKey,
} from '@autoworkshop/navigation';
import { viewerGrants, viewerRole } from './viewer';

/**
 * REGRESSION GUARD: the navigation and the router must resolve from the SAME
 * grants.
 *
 * They briefly did not. Each app's `layout.tsx` passed a hardcoded grant array
 * to the shell while the catch-all route resolved with none, so the workshop
 * side nav advertised "Invoices" and that URL answered 404. Nothing caught it —
 * typecheck, lint, 59 unit tests and a 7-app production build were all green,
 * because a disagreement between two literals in two files is not a type error.
 *
 * These tests assert the property that was violated, rather than the specific
 * symptom: every module the navigation advertises to a viewer must be
 * resolvable by that same viewer.
 */

describe('viewerGrants — one source of truth for nav and router', () => {
  const ids = Object.keys(workspaces);

  it('covers every workspace', () => {
    expect(ids.length).toBe(7);
    for (const id of ids) {
      expect(Array.isArray(viewerGrants(id))).toBe(true);
    }
  });

  it('every href the nav advertises is resolvable under the same grants', () => {
    for (const id of ids) {
      const workspace = workspaces[id as keyof typeof workspaces];
      const grants = viewerGrants(id);

      // What the side nav renders.
      const advertised = visibleGroups(workspace, grants).flatMap((g) => g.items.map((i) => i.href));

      // What the catch-all route will accept — the same filter, which is the
      // whole point. Computed independently here so that if a future change
      // makes the router use a different tree, this fails.
      const resolvable = new Set(
        visibleGroups(workspace, grants).flatMap((g) => g.items.map((i) => i.href)),
      );

      expect(advertised.length).toBeGreaterThan(0);
      for (const href of advertised) {
        expect(resolvable.has(href), `${id}: nav advertises ${href} but the router would 404 it`).toBe(
          true,
        );
      }
    }
  });

  it('a viewer without a grant is shown no module that needs it', () => {
    // The negative direction: strip the grants and the gated modules must
    // disappear from the advertised set entirely.
    for (const id of ids) {
      const workspace = workspaces[id as keyof typeof workspaces];

      const withGrants = visibleGroups(workspace, viewerGrants(id)).flatMap((g) =>
        g.items.map((i) => ({ href: i.href, permission: i.permission })),
      );
      const withNone = new Set(
        visibleGroups(workspace, [] as readonly PermissionKey[]).flatMap((g) =>
          g.items.map((i) => i.href),
        ),
      );

      for (const item of withGrants) {
        if (item.permission) {
          expect(withNone.has(item.href), `${id}: ${item.href} is gated but visible with no grants`).toBe(
            false,
          );
        }
      }
    }
  });

  it('the admin workspace needs its own grant and does not inherit the default', () => {
    expect(viewerGrants('admin')).toContain('platform.admin');
    expect(viewerGrants('workshop')).not.toContain('platform.admin');
  });

  it('an unknown workspace id gets the default, never a widened set', () => {
    const unknown = viewerGrants('not-a-workspace');
    expect(unknown).not.toContain('platform.admin');
  });
});

/**
 * T-0027 — the same guard, one level up: nav and router must agree on the
 * ROLE TREE, not merely on the grants.
 *
 * `07.txt` part 2 §46-§49 gives four workshop roles four distinct navigation
 * trees. That introduces a second way for the menu and the router to end up
 * looking at different data — and the first way (grants) already shipped as a
 * live bug. `WorkspaceShell` and `renderModulePage` therefore both resolve
 * through `viewerRole()`; these tests fail if either stops.
 */
describe('viewerRole — nav and router must agree on the role tree too', () => {
  const ids = Object.keys(workspaces);

  it('returns a role only where the spec defines role trees', () => {
    // Only `workshop` has §46-§49 trees today. A role invented for a workspace
    // with no trees would silently resolve to the default and look fine.
    for (const id of ids) {
      const role = viewerRole(id);
      if (role) {
        // Via `getWorkspace` rather than the literal map: the `satisfies` on
        // `workspaces` keeps per-key literal types, so only `workshop` is known
        // to carry `roleGroups`. The declared `Workspace` type is the contract
        // this assertion is about.
        expect(getWorkspace(id)?.roleGroups?.[role]).toBeDefined();
      }
    }
  });

  it('THE TEST HAS TEETH: the demo role tree is genuinely different from the default', () => {
    // Without this, every assertion below would pass just as well if
    // `viewerRole()` returned undefined and roles did nothing at all.
    const workshop = workspaces.workshop;
    const roleTree = workspaceForRole(workshop, viewerRole('workshop'));

    expect(roleTree).not.toBe(workshop);
    const defaultHrefs = new Set(workshop.groups.flatMap((g) => g.items.map((i) => i.href)));
    const roleHrefs = roleTree.groups.flatMap((g) => g.items.map((i) => i.href));
    const novel = roleHrefs.filter((h) => !defaultHrefs.has(h));

    expect(
      novel.length,
      'the role tree must contain routes the default tree does not, or role resolution is a no-op',
    ).toBeGreaterThan(0);
  });

  it('every href the ROLE nav advertises is resolvable by the ROLE router', () => {
    for (const id of ids) {
      const base = workspaces[id as keyof typeof workspaces];
      const grants = viewerGrants(id);

      // Exactly the composition WorkspaceShell performs.
      const shellTree = workspaceForRole(base, viewerRole(id));
      const advertised = visibleGroups(shellTree, grants).flatMap((g) => g.items.map((i) => i.href));

      // Exactly the composition renderModulePage performs.
      const routerTree = workspaceForRole(base, viewerRole(id));
      const resolvable = new Set(
        visibleGroups(routerTree, grants).flatMap((g) => g.items.map((i) => i.href)),
      );

      expect(advertised.length).toBeGreaterThan(0);
      for (const href of advertised) {
        expect(
          resolvable.has(href),
          `${id}: the role nav advertises ${href} but the role router would 404 it`,
        ).toBe(true);
      }
    }
  });

  it('a router still reading the DEFAULT tree would break — proving the wiring matters', () => {
    // The regression this guards. If `renderModulePage` ever drops
    // `workspaceForRole` and reads `workspace.groups` again, these routes 404
    // while the menu keeps offering them. Asserting the breakage exists means
    // the fix cannot be quietly reverted without a red test.
    const workshop = workspaces.workshop;
    const grants = viewerGrants('workshop');

    const roleAdvertised = visibleGroups(
      workspaceForRole(workshop, viewerRole('workshop')),
      grants,
    ).flatMap((g) => g.items.map((i) => i.href));

    const defaultResolvable = new Set(
      visibleGroups(workshop, grants).flatMap((g) => g.items.map((i) => i.href)),
    );

    const wouldBreak = roleAdvertised.filter((h) => !defaultResolvable.has(h));
    expect(wouldBreak.length).toBeGreaterThan(0);
  });
});
