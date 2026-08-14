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
      // ⚠️ EVERY PERMISSION GRANTED, deliberately: this test asks "is the
      // landing a REAL ROUTE", not "who may open it". The permission question
      // has its own describe block below. Passing the full set keeps this
      // assertion about route existence even for the admin pack, whose Home
      // group is gated on `platform.admin`.
      const landing = landingPathFor(id, ALL, ['platform.admin', 'finance.read', 'organization.admin']);
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
    expect(landingPathFor('admin', ALL, ['platform.admin'])).toBe(
      '/admin/home/operations-dashboard',
    );
    expect(landingPathFor('admin', ALL, ['platform.admin'])).not.toBe('/admin/home/dashboard');
  });

  it('the five packs whose tree starts at home/dashboard still land there', () => {
    // The other direction: this change must not have moved anybody who was
    // already correct. These five were working before and must stay working.
    for (const id of ['customer', 'workshop', 'supplier', 'fleet', 'insurance']) {
      expect(landingPathFor(id, ALL), `${id} moved`).toBe(`/${id}/home/dashboard`);
    }
  });

  describe('permission-gated landings — Codex C6', () => {
    /**
     * 🔴 THE ADMIN PACK'S LANDING IS BEHIND `platform.admin`, AND I HAD NOT
     * CHECKED. `adminGroups` opens with
     * `group('home', 'Home', 'home', [...], 'platform.admin')`.
     *
     * `renderModulePage` resolves against `visibleGroups(workspace, grants)` —
     * the FILTERED tree — so dispatching from the UNFILTERED one sends a viewer
     * without that permission to a route their own tree hides, and the router
     * then 404s them.
     *
     * Since migration 078 `platform.admin` comes from a grant RECORD, not from
     * the role name, so the viewer this describes is real: a
     * `platform_administrator` whose grant was withdrawn. Revocation is a case
     * the product must handle well, and a 404 at the front door is not that.
     */
    it('an administrator WITH the grant lands on the operations dashboard', () => {
      expect(landingPathFor('admin', ALL, ['platform.admin'])).toBe(
        '/admin/home/operations-dashboard',
      );
    });

    it('an administrator whose grant was REVOKED gets null, not a route that 404s', () => {
      // Null, so the caller falls through to a page rather than a dead end.
      // Every group in the admin tree is gated, so there is nothing to offer.
      expect(landingPathFor('admin', ALL, [])).toBeNull();
    });

    it('omitting grants is the ungated-only reading, never the widest one', () => {
      // `undefined` means "not known". It must not be treated as "holds
      // everything" — that would reintroduce the 404 by a different route, and
      // it is the fail-OPEN direction on a function that decides where somebody
      // is sent.
      expect(landingPathFor('admin', ALL)).toBeNull();
    });

    it('the ungated packs are unaffected by grants either way', () => {
      // The other six packs open on an ungated group and item, so passing no
      // grants must not move them. If this ever fails, a permission was added
      // to a landing screen and somebody needs to decide where that role goes.
      for (const id of ['customer', 'workshop', 'supplier', 'fleet', 'insurance']) {
        expect(landingPathFor(id, ALL), `${id} needs a grant to land`).toBe(
          `/${id}/home/dashboard`,
        );
      }
      expect(landingPathFor('towing', ALL)).toBe('/towing/operations/dashboard');
    });
  });

  it('returns null for a workspace nobody has transcribed', () => {
    // Null rather than a plausible-looking path, so the caller decides. Handing
    // back `/nonsense/home/dashboard` would be a guess that 404s.
    expect(landingPathFor('nonsense', ALL)).toBeNull();
  });
});
