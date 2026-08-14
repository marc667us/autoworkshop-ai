import { describe, expect, it } from 'vitest';
import { landingPathFor, withPackBase } from './pack-base';
import { workspaces } from './workspaces';

/**
 * 🔴 THE TEST THAT WOULD HAVE CAUGHT A 404 ON A ROLE'S OWN DASHBOARD.
 *
 * `app/page.tsx` dispatched every signed-in viewer with
 * `redirect(`/${homeWorkspaceFor(activeRole)}/home/dashboard`)`. Six of the
 * seven packs do have a `home` group whose first item is `dashboard`. **Towing
 * does not** — `02.txt` §52 gives it `operations`, so its dashboard is at
 * `/towing/operations/dashboard`.
 *
 * `renderModulePage` ends `if (!group || !item) notFound()`, so a
 * `towing_operator` arriving at the front door would have been 404'd on their
 * own dashboard.
 *
 * ⚠️ IT HAD NEVER RUN. No production path could write a `towing_operator`
 * membership until migration 080, so that redirect had never once executed for
 * this role — while migration 074 shipped all ten towing screens. A defect
 * behind an unreachable state stays green for ever; opening the door is what
 * found it.
 *
 * These assertions compare the dispatch target against the SAME tree the router
 * resolves against, which is the only comparison that means anything. Asserting
 * `landingPathFor('towing') === '/towing/operations/dashboard'` alone would be
 * two copies of one literal agreeing with each other.
 */
const ALL = Object.values(workspaces);

describe('landingPathFor', () => {
  it.each(ALL.map((w) => [w.id] as const))(
    '%s: the landing path is a route that workspace really serves',
    (id) => {
      const landing = landingPathFor(id, ALL);
      expect(landing, `${id} has no landing path at all`).not.toBeNull();

      // 🔴 RESOLVED AGAINST THE TREE, exactly as `renderModulePage` does it:
      // it mounts the incoming slug with `withPackBase` and looks for an item
      // whose href matches. If no item matches, it calls `notFound()`.
      const workspace = workspaces[id as keyof typeof workspaces];
      const hit = workspace.groups.some((g) =>
        g.items.some((i) => withPackBase(id, i.href) === landing),
      );
      expect(
        hit,
        `${id} would dispatch to "${landing}", which is not in its navigation tree — renderModulePage calls notFound() on it`,
      ).toBe(true);
    },
  );

  it('towing does NOT land on /home/dashboard, which is the defect', () => {
    // Named explicitly rather than left implicit in the loop above. A future
    // edit that "tidied" towing's tree to start with a `home` group would make
    // the generic assertion pass again while silently changing the product's
    // approved navigation (`02.txt` §52), and the loop could not tell the
    // difference.
    expect(landingPathFor('towing', ALL)).toBe('/towing/operations/dashboard');
    expect(landingPathFor('towing', ALL)).not.toBe('/towing/home/dashboard');
  });

  it('🔴 admin does NOT land on /home/dashboard either — the SECOND instance', () => {
    // 🔴 THIS ASSERTION WAS WRITTEN THE WRONG WAY ROUND AND THE TEST CAUGHT ME.
    //
    // I listed admin among "the six packs whose tree starts at home", asserted
    // `/admin/home/dashboard`, and it failed with
    // `expected '/admin/home/operations-dashboard'`. The Home group's first and
    // only dashboard is `operations-dashboard`; there is no `dashboard` item in
    // the admin tree at all, and `apps/web/app/admin/home/` contains exactly one
    // directory, `operations-dashboard`.
    //
    // So the front door has been 404ing PLATFORM ADMINISTRATORS since the
    // ADR-021 consolidation on 2026-08-13 — `/admin/home/dashboard` resolves to
    // no item and `renderModulePage` calls `notFound()`. `apps/web/app/admin/
    // page.tsx` had it right all along and redirects to
    // `/admin/home/operations-dashboard`; only the front door disagreed.
    //
    // This is very probably the owner's report of "access is denied to users",
    // which the 2026-08-13 handover recorded as UNVERIFIED with a
    // session-cookie hypothesis. The owner is a platform administrator.
    //
    // Two instances of one defect — towing and admin — in a seven-pack product,
    // both invisible for the same reason: the redirect target was a literal
    // rather than a question asked of the navigation model.
    expect(landingPathFor('admin', ALL)).toBe('/admin/home/operations-dashboard');
    expect(landingPathFor('admin', ALL)).not.toBe('/admin/home/dashboard');
  });

  it('the five packs whose tree starts at home/dashboard still land there', () => {
    // The other direction: this change must not have moved anybody who was
    // already correct. These five were working before and must stay working.
    for (const id of ['customer', 'workshop', 'supplier', 'fleet', 'insurance']) {
      expect(landingPathFor(id, ALL), `${id} moved`).toBe(`/${id}/home/dashboard`);
    }
  });

  it('returns null for a workspace nobody has transcribed', () => {
    // Null rather than a plausible-looking path, so the caller decides. Handing
    // back `/nonsense/home/dashboard` would be a guess that 404s.
    expect(landingPathFor('nonsense', ALL)).toBeNull();
  });
});
