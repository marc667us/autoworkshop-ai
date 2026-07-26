import { describe, expect, it } from 'vitest';
import {
  breadcrumbsFor,
  defaultExpanded,
  isActive,
  isGroupActive,
  searchItems,
  visibleGroups,
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

  it('platform administration covers all 25 entries of 02.txt §58', () => {
    const items = workspaces.admin.groups.flatMap((g) => g.items);
    expect(items).toHaveLength(25);
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
