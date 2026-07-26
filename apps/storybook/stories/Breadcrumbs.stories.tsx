import type { Meta, StoryObj } from '@storybook/react';
import { Breadcrumbs } from '@autoworkshop/ui';

/**
 * Breadcrumb trail (`01 (1).txt` §67).
 *
 * `renderLink` is injected rather than importing `next/link`, which is what
 * keeps `packages/ui` free of a framework dependency and usable from
 * Storybook, tests and all seven Next apps without a shim.
 *
 * The final crumb has no `href` — the page you are on is not a link to itself.
 */
const meta = {
  title: 'Shell/Breadcrumbs',
  component: Breadcrumbs,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

const renderLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} style={{ color: 'inherit' }}>
    {children}
  </a>
);

export const Default: Story = {
  args: {
    renderLink,
    crumbs: [
      { label: 'Workshop', href: '/' },
      { label: 'Job cards', href: '/job-cards' },
      { label: 'JC-2291' },
    ],
  },
};

/** Two levels — the shallowest trail that is still worth rendering. */
export const Shallow: Story = {
  args: { renderLink, crumbs: [{ label: 'Workshop', href: '/' }, { label: 'Settings' }] },
};

/** A single crumb: the workspace root. */
export const SingleCrumb: Story = {
  args: { renderLink, crumbs: [{ label: 'Workshop' }] },
};

/** Deep trails wrap onto a second line instead of overflowing the header. */
export const Deep: Story = {
  args: {
    renderLink,
    crumbs: [
      { label: 'Workshop', href: '/' },
      { label: 'Inventory', href: '/inventory' },
      { label: 'Parts', href: '/inventory/parts' },
      { label: 'Brake components', href: '/inventory/parts/brakes' },
      { label: 'Front discs', href: '/inventory/parts/brakes/front-discs' },
      { label: 'TOY-BD-4471' },
    ],
  },
};

export const Mobile: Story = {
  args: {
    renderLink,
    crumbs: [
      { label: 'Workshop', href: '/' },
      { label: 'Job cards', href: '/job-cards' },
      { label: 'JC-2291' },
    ],
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
