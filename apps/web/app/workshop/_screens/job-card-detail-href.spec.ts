import { withPackBase } from '@autoworkshop/navigation';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
import type { RoleId } from '@autoworkshop/navigation';
import {
  DEFAULT_JOB_CARD_LIST_HREF,
  JOB_CARD_LIST_HREF,
  jobCardDetailHrefFor,
  jobCardListHrefFor,
} from './job-card-detail-href';

/**
 * 🔴 THE PROPERTY: EVERY ROLE'S JOB-CARD LINK LANDS SOMEWHERE THAT ROLE CAN GO.
 *
 * A wrong href here does not throw, does not warn and does not render an error.
 * `requireNavRoute` calls `notFound()`, so the user clicks the job number on a
 * queue they were legitimately reading and gets the app's 404 — which reads as
 * "this product is broken", not as "that is not your route". It is the same
 * class as the `stageOptions`/`allowedStages` defect: a name that is wrong
 * produces a confident, fluent falsehood rather than a failure.
 *
 * So this test does not check the map against a copy of itself. It resolves the
 * SAME three functions `requireNavRoute` resolves, in the same order, against
 * the real navigation model — and then checks that a page actually exists on
 * disk at the detail route, because a route in the menu with no file behind it
 * lands in the "not built yet" catch-all, which is the thing this slice exists
 * to remove.
 */
describe('job card detail href', () => {
  const workshop = getWorkspace('workshop');

  /**
   * Deliberately NO grants. Every role below must reach its job-card list while
   * holding none of the three permission keys, because most of them hold none:
   * `technician` and `reception_staff` have an empty permission list in the
   * API's matrix. Testing with grants would pass for the wrong reason.
   */
  function hrefsFor(role: RoleId | undefined): string[] {
    const resolved = workspaceForRole(workshop!, role);
    return visibleGroups(resolved, []).flatMap((g) => g.items.map((i) => i.href));
  }

  it('found the workshop workspace to resolve against', () => {
    // Guards the fixture itself. Without this, `workshop` being undefined would
    // make every assertion below run against an empty tree — a check that walks
    // through its own gap and reports a pass.
    expect(workshop, 'workshop workspace not found').toBeTruthy();
    expect(hrefsFor(undefined).length).toBeGreaterThan(20);
  });

  const roles = Object.keys(JOB_CARD_LIST_HREF) as RoleId[];

  it('covers every role the navigation model defines', () => {
    // If a ninth role is added to `RoleId`, this fails rather than silently
    // sending that role to the default tree — which might well be wrong for it.
    expect(roles).toHaveLength(8);
    expect(roles).toContain('technician');
    expect(roles).toContain('reception');
  });

  it.each(roles)('%s: its job-card list route is in its own tree', (role) => {
    const href = jobCardListHrefFor(role);
    expect(hrefsFor(role), `${role} cannot reach ${href}`).toContain(href);
  });

  it('a role with no tree of its own falls back to a route the DEFAULT tree carries', () => {
    // `platform_administrator` and any unmapped role resolve to undefined.
    expect(jobCardListHrefFor(undefined)).toBe(withPackBase('workshop', DEFAULT_JOB_CARD_LIST_HREF));
    expect(hrefsFor(undefined)).toContain(withPackBase('workshop', DEFAULT_JOB_CARD_LIST_HREF));
  });

  it('proves the check would CATCH a route that is not in a tree', () => {
    // Injecting the failure rather than trusting that a pass means anything.
    // If this route ever becomes real the assertion must be re-pointed, not
    // deleted — the point is that `hrefsFor` can say no.
    expect(hrefsFor('technician')).not.toContain('/workshop/workshop-floor/job-cards');
    expect(hrefsFor('reception')).not.toContain('/workshop/workshop-operations/job-cards');
  });

  it('every distinct list route has a [id] page on disk behind it', () => {
    const distinct = [...new Set(Object.values(JOB_CARD_LIST_HREF))];
    for (const href of distinct) {
      const page = join(__dirname, '..', '..', ...withPackBase('workshop', href).split('/').filter(Boolean), '[id]', 'page.tsx');
      expect(existsSync(page), `no detail page for ${href} (looked in ${page})`).toBe(true);
    }
  });

  it('every distinct list route has a page of its own too', () => {
    // The detail page gates on the PARENT list route, and the back link points
    // at it. A parent that does not exist would gate correctly and then send
    // the user to the catch-all on the way back.
    const distinct = [...new Set(Object.values(JOB_CARD_LIST_HREF))];
    for (const href of distinct) {
      const page = join(__dirname, '..', '..', ...withPackBase('workshop', href).split('/').filter(Boolean), 'page.tsx');
      expect(existsSync(page), `no list page at ${href}`).toBe(true);
    }
  });

  it('encodes the id into the URL', () => {
    expect(jobCardDetailHrefFor('owner', 'a b/c')).toBe('/workshop/workshop-operations/job-cards/a%20b%2Fc');
  });

  it('does not resolve a prototype key as a role', () => {
    // `map[role] ?? default` returns the Object function for 'constructor'.
    expect(jobCardListHrefFor('constructor' as RoleId)).toBe(withPackBase('workshop', DEFAULT_JOB_CARD_LIST_HREF));
    expect(jobCardListHrefFor('toString' as RoleId)).toBe(withPackBase('workshop', DEFAULT_JOB_CARD_LIST_HREF));
  });
});
