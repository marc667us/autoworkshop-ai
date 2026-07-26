import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, ThemeToggle } from '@autoworkshop/ui';

/**
 * Light / dark / system theme control (`01 (1).txt` §65).
 *
 * `system` is a first-class third option, not an absence of choice: a user who
 * has set their OS to dark at night expects the app to follow without being
 * asked again.
 *
 * The control is a `radiogroup` and now honours what that role promises —
 * ONE tab stop with a roving tabindex, arrow keys to move, Home/End to jump.
 * It previously declared `role="radiogroup"` over three independently tabbable
 * buttons with no arrow-key handling: the role advertised a keyboard contract
 * the code did not implement, which is worse for a screen-reader user than
 * having used plain buttons, because they are told what to expect and it is
 * wrong.
 */
const meta = {
  title: 'Foundations/ThemeToggle',
  component: ThemeToggle,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  render: () => (
    <ThemeProvider defaultPreference="light">
      <ThemeToggle />
    </ThemeProvider>
  ),
};

export const Dark: Story = {
  render: () => (
    <ThemeProvider defaultPreference="dark">
      <ThemeToggle />
    </ThemeProvider>
  ),
};

/** Follows the OS setting — try toggling your system appearance. */
export const System: Story = {
  render: () => (
    <ThemeProvider defaultPreference="system">
      <ThemeToggle />
    </ThemeProvider>
  ),
};

/**
 * The toggle against themed surfaces, so a contrast regression in either theme
 * is visible in one frame rather than needing two screenshots to compare.
 */
export const OnBothSurfaces: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <ThemeProvider defaultPreference="light">
        <div style={{ padding: '1rem', background: '#ffffff', color: '#111827', borderRadius: 8 }}>
          <p style={{ marginTop: 0 }}>Light surface</p>
          <ThemeToggle />
        </div>
      </ThemeProvider>
      <ThemeProvider defaultPreference="dark">
        <div style={{ padding: '1rem', background: '#0b1120', color: '#e5e7eb', borderRadius: 8 }}>
          <p style={{ marginTop: 0 }}>Dark surface</p>
          <ThemeToggle />
        </div>
      </ThemeProvider>
    </div>
  ),
};
