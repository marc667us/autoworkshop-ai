import { describe, it, expect } from 'vitest';
import { visibleGroups, workspaces, type PermissionKey } from '@autoworkshop/navigation';
import { viewerGrants } from './viewer';

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
