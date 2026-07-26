import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';

/**
 * Page header and the three page states (`05.txt` §2).
 *
 * Every module must ship loading, empty AND error states — they are listed as
 * required per module, not as polish. A screen that renders only its happy path
 * is not finished, because the other three are what a user actually hits on a
 * slow connection, a fresh tenant, or a bad day.
 */
const meta = {
  title: 'Shell/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Job cards', description: 'Work currently open across the workshop.' },
};

export const WithActions: Story = {
  args: {
    title: 'Job cards',
    description: 'Work currently open across the workshop.',
    actions: (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button">Export</button>
        <button type="button">New job card</button>
      </div>
    ),
  },
};

/** A long title must wrap rather than push the actions off the viewport. */
export const LongTitle: Story = {
  args: {
    title: 'Warranty claims awaiting manufacturer response and internal review',
    description: 'Claims submitted more than 14 days ago with no decision recorded.',
    actions: <button type="button">Chase all</button>,
  },
};

export const TitleOnly: Story = { args: { title: 'Settings' } };

/** Loading — a labelled state, not a bare spinner. */
export const Loading: Story = {
  args: { title: 'Job cards' },
  render: () => (
    <div>
      <PageHeader title="Job cards" description="Work currently open across the workshop." />
      <LoadingState />
    </div>
  ),
};

/**
 * Empty — says what would be here and how to create the first one. An empty
 * state that only says "No data" leaves the user with nothing to do.
 */
export const Empty: Story = {
  args: { title: 'Job cards' },
  render: () => (
    <div>
      <PageHeader title="Job cards" />
      <EmptyState
        title="No open job cards"
        description="When a vehicle is booked in, its job card appears here."
        action={<button type="button">Book a vehicle in</button>}
      />
    </div>
  ),
};

/**
 * Error — carries the request id, because that is the only thing that lets
 * support correlate what the user saw with what the server logged.
 */
export const Error: Story = {
  args: { title: 'Job cards' },
  render: () => (
    <div>
      <PageHeader title="Job cards" />
      <ErrorState
        message="Job cards could not be loaded."
        requestId="req_01J8Z5M2Q7K"
        onRetry={() => {}}
      />
    </div>
  ),
};

/** Header with inline status, as the job-card detail page uses it. */
export const WithStatus: Story = {
  args: { title: 'JC-2291' },
  render: () => (
    <PageHeader
      title="JC-2291 — Toyota Hilux GR-4471-22"
      description="Booked in 14 March, awaiting customer approval for additional work."
      actions={<StatusBadge kind="attention" label="Awaiting customer approval" />}
    />
  ),
};

export const Mobile: Story = {
  args: {
    title: 'Job cards',
    description: 'Work currently open across the workshop.',
    actions: <button type="button">New job card</button>,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
