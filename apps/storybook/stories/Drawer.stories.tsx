import type { Meta, StoryObj } from '@storybook/react';
import { Drawer } from '@autoworkshop/ui';

/**
 * Side drawer (`01 (1).txt` §69).
 *
 * Two distinct behaviours, and the difference matters:
 *
 * - **modal** — below 768 px, and for anything that must be dealt with. Traps
 *   focus, locks scroll, dims the page behind it.
 * - **non-modal** — the desktop side panel. It sits BESIDE the page inside the
 *   shell's flex row and does not trap focus, so a technician can read the
 *   panel and keep typing in the form. Rendering it outside that flex row drops
 *   it below the page as a full-width block: still visible, so it survives a
 *   screenshot, but no longer the side panel the spec describes.
 */
const meta = {
  title: 'Shell/Drawer',
  component: Drawer,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (
  <div style={{ display: 'grid', gap: '0.75rem' }}>
    <p>Vehicle GR-4471-22 — Toyota Hilux 2.4 D-4D.</p>
    <p>Last service 14,200 km ago. Two open advisories.</p>
    <p>Assigned technician: Kwame A.</p>
  </div>
);

/** Non-modal: the desktop side panel, beside the content. */
export const NonModal: Story = {
  args: { open: true, onClose: () => {}, title: 'Vehicle details', modal: false, children: body },
};

/** Modal: dims and traps. This is the mobile navigation form. */
export const Modal: Story = {
  args: { open: true, onClose: () => {}, title: 'Navigation', modal: true, children: body },
};

/** Anchored left — used for navigation; right is used for detail and assistance. */
export const LeftSide: Story = {
  args: { open: true, onClose: () => {}, title: 'Navigation', side: 'left', modal: true, children: body },
};

export const Wide: Story = {
  args: { open: true, onClose: () => {}, title: 'Parts catalogue', width: '32rem', children: body },
};

/** Header actions sit next to the close control, not buried in the body. */
export const WithHeaderActions: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Vehicle details',
    headerActions: <button type="button">Open full record</button>,
    children: body,
  },
};

/** Below 768 px the drawer is always modal, whatever `modal` is set to. */
export const Mobile: Story = {
  args: { open: true, onClose: () => {}, title: 'Vehicle details', children: body },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
