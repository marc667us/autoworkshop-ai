import type { Meta, StoryObj } from '@storybook/react';
import { SideNav } from '@autoworkshop/ui';
import { getWorkspace } from '@autoworkshop/navigation';

/**
 * Collapsible grouped side navigation (`01 (1).txt` §16, §17).
 *
 * Groups carry an icon, a title, an expand/collapse control, an optional
 * counter and an optional warning badge, and are permission-aware.
 *
 * **Permission-aware visibility is an affordance, never a control.** Hiding a
 * group stops it cluttering the nav; it does not stop anyone typing the URL.
 * The route and the API deny independently — see CLAUDE.md §8. The router was
 * once resolving against the unfiltered tree while the nav resolved against
 * the filtered one, so a gated module rendered by URL and the nav advertised
 * links that 404'd. Both now resolve from the same viewer — since T-0005 that
 * is the Keycloak session behind `currentViewer()`, not a demo array.
 */
const meta = {
  title: 'Shell/SideNav',
  component: SideNav,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof SideNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `getWorkspace` returns `undefined` for workspaces not yet transcribed, and
 * callers are required to handle that rather than assume. A story that silently
 * rendered an empty nav would look like a styling bug; failing loudly names the
 * real cause.
 */
function requireWorkspace(id: string) {
  const w = getWorkspace(id);
  if (!w) throw new Error(`story fixture missing: workspace '${id}' is not defined`);
  return w;
}

const workshop = requireWorkspace('workshop');

const renderLink = ({
  href,
  children,
  active,
  title,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  title?: string;
}) => (
  <a
    href={href}
    title={title}
    style={{
      display: 'block',
      padding: '0.375rem 0.5rem',
      borderRadius: 6,
      color: 'inherit',
      textDecoration: 'none',
      fontWeight: active ? 600 : 400,
    }}
  >
    {children}
  </a>
);

const base = {
  groups: workshop.groups,
  pathname: '/job-cards',
  collapsed: false,
  expanded: workshop.groups.slice(0, 2).map((g) => g.id),
  onToggleGroup: () => {},
  renderLink,
};

export const Default: Story = { args: base };

/** Collapsed to the icon rail — labels move into `title` so they stay reachable. */
export const Collapsed: Story = { args: { ...base, collapsed: true } };

/** All groups expanded — the deepest the nav ever gets. */
export const AllExpanded: Story = {
  args: { ...base, expanded: workshop.groups.map((g) => g.id) },
};

export const AllCollapsedGroups: Story = { args: { ...base, expanded: [] } };

/**
 * Counters and warnings (§16, §21-§24). A counter is workload; a warning is
 * something going wrong. They are visually distinct because they mean
 * different things and prompt different action.
 */
export const WithCountersAndWarnings: Story = {
  args: {
    ...base,
    expanded: workshop.groups.map((g) => g.id),
    counters: { jobCards: 12, appointments: 5, invoices: 3 },
    warnings: { reorder: 2, quarantine: 1 },
  },
};

/** Filtering the nav by search — §16. */
export const Searching: Story = {
  args: { ...base, expanded: workshop.groups.map((g) => g.id), searchQuery: 'invoice' },
};

/** A search matching nothing still has to say so rather than render blank. */
export const SearchNoMatches: Story = {
  args: { ...base, expanded: workshop.groups.map((g) => g.id), searchQuery: 'zzzzz' },
};

/** The customer workspace — a different, much shorter tree (§17). */
export const CustomerWorkspace: Story = {
  args: {
    ...base,
    groups: requireWorkspace('customer').groups,
    pathname: '/vehicles',
    expanded: requireWorkspace('customer').groups.map((g) => g.id),
  },
};

/** Platform admin — the largest tree, 25 entries (§39). */
export const AdminWorkspace: Story = {
  args: {
    ...base,
    groups: requireWorkspace('admin').groups,
    pathname: '/tenants',
    expanded: requireWorkspace('admin').groups.map((g) => g.id),
  },
};

export const Mobile: Story = {
  args: base,
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
