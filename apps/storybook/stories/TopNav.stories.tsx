import type { Meta, StoryObj } from '@storybook/react';
import { TopNav, ThemeProvider, ThemeToggle } from '@autoworkshop/ui';

/**
 * Top navigation bar (`01 (1).txt` §3-§15).
 *
 * Two rules this component learned the hard way on 2026-07-26:
 *
 * 1. **Nothing focusable is inert.** Create / Tasks / Messages / Notifications /
 *    Help once rendered as live buttons with count badges and no handler, while
 *    the docstring claimed "none of them silently no-op". An action without
 *    `onSelect` now renders `disabled` with ", not available yet" in its
 *    accessible name, so a screen-reader user is told the same thing a sighted
 *    user infers from the greying.
 * 2. **Indicators that cannot yet act are plain text, not buttons.** The
 *    workspace / organisation / branch / user indicators stay text until their
 *    switchers exist (T-0016, blocked on membership data). A button that does
 *    nothing is a worse affordance than a label.
 */
const meta = {
  title: 'Shell/TopNav',
  component: TopNav,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof TopNav>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  workspaceLabel: 'Workshop',
  organizationLabel: 'Accra Auto Services',
  branchLabel: 'Spintex Road',
  userLabel: 'Kwame A.',
  sideNavCollapsed: false,
  onToggleSideNav: () => {},
  searchValue: '',
  onSearchChange: () => {},
};

/** Every right-hand action wired — how the bar looks once §9-§14 are built. */
export const Default: Story = {
  args: {
    ...base,
    actions: [
      { id: 'create', label: 'Create', icon: 'create', onSelect: () => {} },
      { id: 'tasks', label: 'Tasks', icon: 'tasks', count: 4, onSelect: () => {} },
      { id: 'messages', label: 'Messages', icon: 'messages', count: 2, onSelect: () => {} },
      { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 7, onSelect: () => {} },
      { id: 'help', label: 'Help', icon: 'help', onSelect: () => {} },
    ],
  },
};

/**
 * The CURRENT state: the panels do not exist, so every action is disabled and
 * says so in its accessible name. This is the honest rendering, and the one
 * shipped today.
 */
export const ActionsNotAvailableYet: Story = {
  args: {
    ...base,
    actions: [
      { id: 'create', label: 'Create', icon: 'create' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks' },
      { id: 'messages', label: 'Messages', icon: 'messages' },
      { id: 'notifications', label: 'Notifications', icon: 'notifications' },
      { id: 'help', label: 'Help', icon: 'help' },
    ],
  },
};

export const WithThemeControl: Story = {
  args: {
    ...base,
    actions: [{ id: 'help', label: 'Help', icon: 'help', onSelect: () => {} }],
    themeControl: (
      <ThemeProvider defaultPreference="light">
        <ThemeToggle />
      </ThemeProvider>
    ),
  },
};

export const Searching: Story = {
  args: { ...base, searchValue: 'GR-4471', actions: [] },
};

export const SideNavCollapsed: Story = {
  args: { ...base, sideNavCollapsed: true, actions: [] },
};

/** No organisation or branch yet — a fresh tenant before setup. */
export const MinimalContext: Story = {
  args: {
    workspaceLabel: 'Customer',
    sideNavCollapsed: false,
    onToggleSideNav: () => {},
    searchValue: '',
    onSearchChange: () => {},
  },
};

/**
 * 360 px. The whole bar must fit: brand, search, actions, theme control and
 * user chip. An earlier version kept ~30 rem of content in a 22.5 rem viewport
 * because only the selector cluster was responsive.
 */
export const Mobile: Story = {
  args: {
    ...base,
    actions: [
      { id: 'create', label: 'Create', icon: 'create', onSelect: () => {} },
      { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 7, onSelect: () => {} },
    ],
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const Tablet: Story = {
  args: { ...base, actions: [{ id: 'create', label: 'Create', icon: 'create', onSelect: () => {} }] },
  parameters: { viewport: { defaultViewport: 'tabletPortrait' } },
};
