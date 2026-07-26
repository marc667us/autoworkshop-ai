import type { Preview } from '@storybook/react';

const preview: Preview = {
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
