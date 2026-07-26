import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from '@autoworkshop/ui';

/**
 * Automotive status colours (`01 (1).txt` §66).
 *
 * The `label` prop is REQUIRED by the type, not optional. §66: "Colour shall
 * never be the only method used to communicate status." Making the label
 * mandatory means a colour-only badge cannot compile.
 */
const meta = {
  title: 'Foundations/StatusBadge',
  component: StatusBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = { args: { kind: 'draft', label: 'Draft' } };
export const Active: Story = { args: { kind: 'active', label: 'Repair in progress' } };
export const Complete: Story = { args: { kind: 'complete', label: 'Verified' } };
export const Attention: Story = { args: { kind: 'attention', label: 'Awaiting customer approval' } };
export const Blocked: Story = { args: { kind: 'blocked', label: 'Unsafe to drive' } };

/** The five automotive statuses side by side, as a technician would see them. */
export const AllStatuses: Story = {
  args: { kind: 'draft', label: 'Draft' },
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <StatusBadge kind="draft" label="Draft" />
      <StatusBadge kind="active" label="Repair in progress" />
      <StatusBadge kind="complete" label="Verified" />
      <StatusBadge kind="attention" label="Awaiting approval" />
      <StatusBadge kind="blocked" label="Unsafe to drive" />
    </div>
  ),
};
