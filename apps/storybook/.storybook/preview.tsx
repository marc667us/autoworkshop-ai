import type { Preview } from '@storybook/react';
import { ThemeProvider } from '@autoworkshop/ui';

/**
 * Every component that reads a theme variable needs the provider, and in the
 * real apps it is always there — the shell mounts it once at the root. Wrapping
 * per story instead would mean each new story author has to remember, and the
 * failure mode is not subtle but it IS misleading: the story renders
 * Storybook's "useTheme must be used inside <ThemeProvider>" error page, and an
 * accessibility scan then happily audits that error page instead of the
 * component. Twenty-five stories reported axe violations that belonged to
 * Storybook's own error screen, not to our code.
 */
const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider defaultPreference="light">
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: true }] } },
    // Reference widths from `01 (1).txt` §68 — 12-col desktop / 8 tablet / 4 mobile.
    viewport: {
      viewports: {
        mobile: { name: 'Mobile 360', styles: { width: '360px', height: '640px' } },
        mobileLarge: { name: 'Mobile 480', styles: { width: '480px', height: '800px' } },
        tabletPortrait: { name: 'Tablet portrait 768', styles: { width: '768px', height: '1024px' } },
        tabletLandscape: { name: 'Tablet landscape 1024', styles: { width: '1024px', height: '768px' } },
        laptop: { name: 'Laptop 1280', styles: { width: '1280px', height: '800px' } },
        desktop: { name: 'Desktop 1536', styles: { width: '1536px', height: '960px' } },
      },
    },
  },
};

export default preview;
