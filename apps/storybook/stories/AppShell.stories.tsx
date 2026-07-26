import type { Meta, StoryObj } from '@storybook/react';
import { AppShell, PageHeader, EmptyState, Drawer, ThemeProvider } from '@autoworkshop/ui';
import { getWorkspace } from '@autoworkshop/navigation';

/**
 * The whole shell assembled (`01 (1).txt` §2).
 *
 * ONE shell serves all seven workspaces. There is no per-app copy — a shell
 * duplicated seven times drifts seven ways, and the workspace is data.
 *
 * `renderLink` is injected so `packages/ui` never imports `next/link`; that is
 * what lets the identical component render here, in tests, and in all seven
 * Next apps.
 */
const meta = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `getWorkspace` returns `undefined` for workspaces not yet transcribed, and
 * callers must handle that rather than assume. Failing loudly names the real
 * cause; an empty shell would look like a styling bug.
 */
function requireWorkspace(id: string) {
  const w = getWorkspace(id);
  if (!w) throw new Error(`story fixture missing: workspace '${id}' is not defined`);
  return w;
}

const renderLink = ({
  href,
  children,
  title,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  title?: string;
}) => (
  <a href={href} title={title} style={{ color: 'inherit', textDecoration: 'none' }}>
    {children}
  </a>
);

const page = (
  <>
    <PageHeader
      title="Job cards"
      description="Work currently open across the workshop."
      actions={<button type="button">New job card</button>}
    />
    <EmptyState
      title="No open job cards"
      description="When a vehicle is booked in, its job card appears here."
      action={<button type="button">Book a vehicle in</button>}
    />
  </>
);

const base = {
  workspace: requireWorkspace('workshop'),
  pathname: '/job-cards',
  organizationLabel: 'Accra Auto Services',
  branchLabel: 'Spintex Road',
  userLabel: 'Kwame A.',
  renderLink,
  children: page,
};

export const Workshop: Story = { args: base };

export const Customer: Story = {
  args: { ...base, workspace: requireWorkspace('customer'), pathname: '/vehicles' },
};

export const Admin: Story = {
  args: { ...base, workspace: requireWorkspace('admin'), pathname: '/tenants' },
};

/**
 * A viewer holding NO grants. Permission-gated groups disappear from the nav —
 * and the router, reading the same grants, 404s those URLs rather than
 * rendering them. Two literals in two files cannot be type-checked into
 * agreement, so there is exactly one source.
 */
export const RestrictedViewer: Story = {
  args: { ...base, grants: [] },
};

/** Counters and warnings surfaced through the shell (§21-§24). */
export const WithCountersAndWarnings: Story = {
  args: {
    ...base,
    counters: { jobCards: 12, appointments: 5 },
    warnings: { reorder: 2 },
  },
};

/**
 * With the non-modal side drawer open. It sits BESIDE the page, inside the
 * shell's flex row — not below it as a full-width block.
 */
export const WithSideDrawer: Story = {
  args: {
    ...base,
    drawer: (
      <Drawer open onClose={() => {}} title="Vehicle details" modal={false}>
        <p>GR-4471-22 — Toyota Hilux 2.4 D-4D</p>
        <p>Last service 14,200 km ago.</p>
      </Drawer>
    ),
  },
};

export const DarkTheme: Story = {
  args: base,
  render: (args) => (
    <ThemeProvider defaultPreference="dark">
      <AppShell {...args} />
    </ThemeProvider>
  ),
};

/** Below 768 px the side nav becomes a modal overlay drawer with a focus trap. */
export const Mobile: Story = {
  args: base,
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const Tablet: Story = {
  args: base,
  parameters: { viewport: { defaultViewport: 'tabletPortrait' } },
};
