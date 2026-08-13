import { describe, expect, it } from 'vitest';
import { packServingLegacyPath } from './pack-base';

import {
  breadcrumbsFor,
  defaultExpanded,
  groupsForRole,
  isActive,
  isGroupActive,
  searchItems,
  visibleGroups,
  workspaceForRole,
} from './resolve';
import { getWorkspace, workspaces } from './workspaces';
import type { Workspace } from './types';

const workshop = getWorkspace('workshop') as Workspace;

describe('isActive', () => {
  it('matches the exact route', () => {
    expect(isActive('/home/dashboard', '/home/dashboard')).toBe(true);
  });

  it('matches a deeper child route', () => {
    expect(isActive('/workshop-floor/job-cards', '/workshop-floor/job-cards/JC-1042')).toBe(true);
  });

  /**
   * The regression this function exists to prevent. A naive `startsWith` would
   * light up `/parts` for `/parts-and-supply`, so two unrelated groups would
   * appear active at once and §4's "selected module stays highlighted" would be
   * wrong on every parts page.
   */
  it('does NOT match a sibling route sharing a prefix', () => {
    expect(isActive('/parts', '/parts-and-supply/procurement')).toBe(false);
    expect(isActive('/home/task', '/home/tasks')).toBe(false);
  });
});

describe('visibleGroups', () => {
  it('hides a permission-gated group when the grant is absent', () => {
    const groups = visibleGroups(workshop, []);
    expect(groups.find((g) => g.id === 'settings')).toBeUndefined();
  });

  it('shows a permission-gated group when the grant is held', () => {
    const groups = visibleGroups(workshop, ['organization.admin']);
    expect(groups.find((g) => g.id === 'settings')).toBeDefined();
  });

  it('hides individual gated items but keeps the rest of the group', () => {
    const groups = visibleGroups(workshop, []);
    const finance = groups.find((g) => g.id === 'finance-and-warranty');
    expect(finance).toBeDefined();
    const labels = finance!.items.map((i) => i.label);
    // §29 — sensitive financial items are permission-restricted.
    expect(labels).not.toContain('Invoices');
    expect(labels).not.toContain('Payments');
    // ...but the non-sensitive ones survive, so the group is still useful.
    expect(labels).toContain('Warranty Records');
  });

  it('drops a group entirely when filtering empties it', () => {
    // A group whose every item is gated must not render as an empty expander.
    const synthetic: Workspace = {
      id: 'workshop',
      label: 'T',
      audience: 't',
      groups: [
        {
          id: 'g',
          label: 'G',
          icon: 'home',
          items: [{ id: 'a', label: 'A', href: '/g/a', permission: 'nope' }],
        },
      ],
    };
    expect(visibleGroups(synthetic, [])).toHaveLength(0);
  });
});

describe('breadcrumbsFor', () => {
  it('builds workspace > group > item using spec labels, not slugs', () => {
    const crumbs = breadcrumbsFor(workshop, '/workshop-floor/repair-staging');
    expect(crumbs.map((c) => c.label)).toEqual(['Workshop', 'Workshop Floor', 'Repair Staging']);
  });

  it('leaves the group crumb unlinked — a group is an expander, not a page', () => {
    const crumbs = breadcrumbsFor(workshop, '/workshop-floor/repair-staging');
    // Assert the crumb exists before asserting on its href, so a regression
    // that returns a SHORTER trail fails loudly here rather than passing
    // because `undefined?.href` is also undefined.
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1]?.href).toBeUndefined();
  });

  it('returns only the workspace crumb for an unknown route rather than inventing a trail', () => {
    expect(breadcrumbsFor(workshop, '/nope/nothing')).toHaveLength(1);
  });
});

describe('defaultExpanded', () => {
  it('opens only the group containing the current route', () => {
    const open = defaultExpanded(workshop.groups, '/repair-services/diagnosis');
    expect(open).toEqual(['repair-services']);
  });

  it('opens nothing when the route is outside the tree', () => {
    expect(defaultExpanded(workshop.groups, '/nope')).toEqual([]);
  });
});

describe('isGroupActive', () => {
  it('is true when any item matches', () => {
    const g = workshop.groups.find((x) => x.id === 'workshop-floor')!;
    expect(isGroupActive(g, '/workshop-floor/job-cards')).toBe(true);
    expect(isGroupActive(g, '/reports/operations')).toBe(false);
  });
});

describe('searchItems', () => {
  it('matches on the item label, case-insensitively', () => {
    const hits = searchItems(workshop.groups, 'quality');
    expect(hits.map((h) => h.label)).toContain('Quality Control');
  });

  it('matches on the GROUP label so a group name surfaces its items', () => {
    const hits = searchItems(workshop.groups, 'knowledge and staff');
    expect(hits.map((h) => h.label)).toContain('Certifications');
  });

  it('returns nothing for a blank query instead of the whole tree', () => {
    expect(searchItems(workshop.groups, '   ')).toEqual([]);
  });
});

describe('workspace trees match the specification', () => {
  /**
   * §34 lists exactly 11 workshop groups. Asserting the count catches a group
   * being dropped during a refactor — the kind of silent scope cut CLAUDE.md §4
   * forbids.
   */
  it('workshop has the 11 groups of §34', () => {
    expect(workshop.groups).toHaveLength(11);
  });

  it('customer has the 8 groups of §33', () => {
    expect(workspaces.customer.groups).toHaveLength(8);
  });

  it('supplier has the 9 groups of §35', () => {
    expect(workspaces.supplier.groups).toHaveLength(9);
  });

  it('fleet has the 8 groups of §36', () => {
    expect(workspaces.fleet.groups).toHaveLength(8);
  });

  it('insurance has the 8 groups of §37', () => {
    expect(workspaces.insurance.groups).toHaveLength(8);
  });

  /**
   * `02.txt` §52 gives towing a FLAT list of 10 entries rather than the grouped
   * shape of §33-37. That difference is preserved deliberately — one group
   * holding the spec's ten items, rather than inventing groupings.
   */
  it('towing is one group holding the 10 flat entries of 02.txt §52', () => {
    expect(workspaces.towing.groups).toHaveLength(1);
    expect(workspaces.towing.groups[0]?.items).toHaveLength(10);
  });

  /**
   * ⚠️ 26, NOT §58's 25 — AND THE EXTRA ONE IS NAMED HERE RATHER THAN THE
   * NUMBER QUIETLY BUMPED.
   *
   * `Registrations` was added on 2026-08-09 at the owner's request: *"when [a
   * new] workshop or supplier [registers] the admin is alerted to verify and
   * approve and update the registries."* Self-service business registration did
   * not exist when `02.txt` §58 was written — migrations 068/069 created it —
   * so the spec has no entry for the queue it produces.
   *
   * 🔴 THE ASSERTION IS KEPT EXACT, and that is the point of it. Its job is to
   * notice when the admin tree changes, so every future change has to arrive
   * with a reason written down beside it. Loosening it to
   * `toBeGreaterThanOrEqual(25)` would turn a guard into a formality and let
   * the next entry appear with no explanation at all.
   */
  it('platform administration covers §58’s 25 entries plus the registration queue', () => {
    const items = workspaces.admin.groups.flatMap((g) => g.items);
    expect(items).toHaveLength(26);
    // The addition is asserted by NAME too, so a future change that removes
    // Registrations and adds something else still fails on the count being
    // right for the wrong reason.
    expect(items.map((i) => i.id)).toContain('registrations');
  });

  /**
   * §32: the administration surface is "visible only to authorized
   * administrative, security and operational users." Every group must be
   * gated — an ungated admin group would leak the platform's structure.
   */
  it('every platform-administration group is gated on platform.admin', () => {
    for (const g of workspaces.admin.groups) {
      expect(g.permission).toBe('platform.admin');
    }
    expect(visibleGroups(workspaces.admin, [])).toHaveLength(0);
    expect(visibleGroups(workspaces.admin, ['platform.admin']).length).toBeGreaterThan(0);
  });

  it('all seven workspaces are registered', () => {
    expect(Object.keys(workspaces).sort()).toEqual(
      ['admin', 'customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'].sort(),
    );
  });

  it('every item href follows /group/item so routes stay derivable', () => {
    for (const ws of Object.values(workspaces)) {
      for (const g of ws.groups) {
        for (const i of g.items) {
          expect(i.href).toBe(`/${g.id}/${i.id}`);
        }
      }
    }
  });

  it('has no duplicate hrefs within a workspace', () => {
    for (const ws of Object.values(workspaces)) {
      const hrefs = ws.groups.flatMap((g) => g.items.map((i) => i.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});

/* ------------------------------------------------------------------ *
 * T-0027 — workspace x role (`07.txt` part 2 §46-§49)
 * ------------------------------------------------------------------ */

describe('workspace x role navigation', () => {
  const workshop = getWorkspace('workshop')!;

  it('gives each of the four specified roles its own distinct tree', () => {
    const trees = (['owner', 'manager', 'reception', 'technician'] as const).map((r) =>
      groupsForRole(workshop, r),
    );

    // Distinct objects, and distinct CONTENT. Identity alone would pass if two
    // roles were wired to the same array by a copy-paste slip.
    const signatures = trees.map((groups) => groups.map((g) => g.id).join('|'));
    expect(new Set(signatures).size, 'all four role trees must differ').toBe(4);

    // And none of them may be the workspace default, or the role did nothing.
    for (const groups of trees) {
      expect(groups).not.toBe(workshop.groups);
    }
  });

  it('falls back to the workspace default for a role the spec gives no tree', () => {
    // §50 names these four with a control summary but no navigation. Falling
    // back is the honest behaviour; inventing a tree for them would not be.
    for (const role of ['supervisor', 'storekeeper', 'quality-control', 'cashier'] as const) {
      expect(groupsForRole(workshop, role)).toBe(workshop.groups);
    }
  });

  it('falls back to the workspace default when no role is supplied', () => {
    expect(groupsForRole(workshop, undefined)).toBe(workshop.groups);
  });

  it('is idempotent, and a resolved view cannot be re-resolved to another role', () => {
    // Codex found this: the resolved workspace used to keep `roleGroups`, so
    // applying the helper again with a DIFFERENT role fell back to the FIRST
    // role's tree rather than the workspace default — handing back the
    // technician's navigation under a supervisor's name.
    const technician = workspaceForRole(workshop, 'technician');
    expect(technician.roleGroups).toBeUndefined();

    // Re-applying with a role that has no tree must not resurrect a stale one.
    expect(workspaceForRole(technician, 'supervisor').groups).toBe(technician.groups);
    // Re-applying with a different role that DOES have a tree must not switch
    // trees behind a caller's back either — a resolved view is final.
    expect(workspaceForRole(technician, 'owner').groups).toBe(technician.groups);
    // And re-applying the same role changes nothing.
    expect(workspaceForRole(technician, 'technician')).toBe(technician);
  });

  it('leaves workspaces that have no role trees untouched', () => {
    const customer = getWorkspace('customer')!;
    expect(workspaceForRole(customer, 'owner')).toBe(customer);
  });

  it('ROLE SELECTS THE TREE, PERMISSIONS STILL FILTER IT', () => {
    // The whole point of keeping these two concerns separate. An owner is the
    // most privileged workshop role in §50, and still does not see a
    // finance-gated item without the finance grant.
    const owner = workspaceForRole(workshop, 'owner');
    const hrefs = (grants: string[]) =>
      visibleGroups(owner, grants).flatMap((g) => g.items.map((i) => i.href));

    const withFinance = hrefs(['finance.read', 'organization.admin']);
    const withoutFinance = hrefs(['organization.admin']);

    // ADR-021: `visibleGroups` returns MOUNTED hrefs — the path the route is
    // actually served at inside the single artifact — while `workspaces.ts`
    // still transcribes the spec's `/finance/invoices` literally. Asserted in
    // the mounted form deliberately: this test is about what a LINK points at,
    // and a link that pointed at `/finance/invoices` would 404.
    expect(withFinance).toContain('/workshop/finance/invoices');
    expect(withoutFinance).not.toContain('/workshop/finance/invoices');
  });

  it('every role tree resolves breadcrumbs for its own items', () => {
    // Guards the failure where a role tree is reachable but produces bare
    // crumbs because the resolver was still reading the default tree.
    for (const role of ['owner', 'manager', 'reception', 'technician'] as const) {
      const ws = workspaceForRole(workshop, role);
      const first = ws.groups[0]?.items[0];
      expect(first, `${role} has an empty first group`).toBeDefined();
      const crumbs = breadcrumbsFor(ws, first!.href);
      expect(crumbs.at(-1)?.label, `${role}: ${first!.href}`).toBe(first!.label);
    }
  });

  it('no role tree contains a duplicate href', () => {
    // Two items sharing an href makes one of them unreachable and breaks
    // active-state highlighting for both.
    for (const role of ['owner', 'manager', 'reception', 'technician'] as const) {
      const hrefs = groupsForRole(workshop, role).flatMap((g) => g.items.map((i) => i.href));
      expect(new Set(hrefs).size, `${role} has duplicate hrefs`).toBe(hrefs.length);
    }
  });
});

describe('role trees must not lose a permission in transcription', () => {
  const workshop = getWorkspace('workshop')!;

  /**
   * The realistic transcription mistake: `07.txt` prints "Invoices" as plain
   * text with no mention of permissions, so an item copied straight from the
   * spec arrives ungated — and role trees are transcribed by hand, one per
   * role. A single omission silently exposes a finance screen to a role that
   * §50 says must not have it, and nothing else in the suite would notice.
   *
   * `01 (1).txt` §29 is the governing rule: "Sensitive financial menu items
   * shall be restricted by permission."
   */
  const FINANCIAL = /invoice|payment|receipt|revenue|refund|balance|finance/i;

  /**
   * Items the pattern matches on a word but which are NOT financial.
   *
   * This list exists because the guard found exactly one hit on its first run
   * and it was a false positive: §48's "Issue Intake Receipt" is the document
   * proving the workshop took custody of the vehicle, not a payment receipt.
   * Gating it on `finance.read` would have hidden a core reception function
   * from reception staff — a real regression, introduced to satisfy a
   * heuristic.
   *
   * Recorded as a named exception rather than by loosening the pattern, so the
   * guard still fires for a genuine payment receipt and the reasoning stays
   * attached to the decision.
   */
  const NOT_FINANCIAL = new Set(['/vehicle-intake/issue-intake-receipt']);

  it('every financial item in every role tree is permission-gated', () => {
    const offenders: string[] = [];

    for (const [role, groups] of Object.entries(workshop.roleGroups ?? {})) {
      for (const g of groups) {
        for (const i of g.items) {
          if (NOT_FINANCIAL.has(i.href)) continue;
          const financial = FINANCIAL.test(i.id) || FINANCIAL.test(i.label);
          const gated = Boolean(i.permission ?? g.permission);
          if (financial && !gated) offenders.push(`${role}: ${i.href} (${i.label})`);
        }
      }
    }

    expect(offenders, 'financial items reachable with no permission').toEqual([]);
  });

  it('every exception in NOT_FINANCIAL still exists in a role tree', () => {
    // An exception for an item that no longer exists is a hole waiting for a
    // future item to reuse the href and inherit a waiver nobody reviewed.
    const allHrefs = new Set(
      Object.values(workshop.roleGroups ?? {})
        .flat()
        .flatMap((g) => g.items.map((i) => i.href)),
    );
    for (const href of NOT_FINANCIAL) {
      expect(allHrefs.has(href), `stale exception: ${href}`).toBe(true);
    }
  });

  it('the guard itself is not vacuous — financial items exist to be checked', () => {
    // Without this, deleting every finance item would make the test above pass.
    const financialCount = Object.values(workshop.roleGroups ?? {})
      .flat()
      .flatMap((g) => g.items)
      .filter((i) => FINANCIAL.test(i.id) || FINANCIAL.test(i.label)).length;

    expect(financialCount).toBeGreaterThan(0);
  });
});

describe('pre-ADR-021 links still lead somewhere', () => {
  // 🔴 THE LIVE SUITE PASSED 70/0/1 WHILE EVERY OLD URL 404'd ON PRODUCTION.
  // It only ever requests paths the NEW topology advertises, so the entire
  // class was invisible to it and the owner found it by using the product.
  // These assert the RESOLUTION, which is the part that can silently rot.
  const all = Object.values(workspaces);

  it('a route only one pack serves resolves to that pack', () => {
    // Supplier's catalogue is supplier-only, so it can be sent straight there.
    expect(packServingLegacyPath('/products/product-catalogue', all)).toBe('supplier');
  });

  it('a route MANY packs serve resolves to nothing, so the caller dispatches', () => {
    // `/home/dashboard` exists in six trees. Guessing between them would drop
    // somebody into a workspace they may hold no membership for; null sends
    // them to `/`, which resolves the viewer first.
    expect(packServingLegacyPath('/home/dashboard', all)).toBeNull();
  });

  it('an unknown route resolves to nothing rather than throwing', () => {
    expect(packServingLegacyPath('/no/such/route', all)).toBeNull();
  });
});
