import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook is the authoritative frontend component catalogue
 * (`autoworkshop 01 (1).txt` §71, ADR-008).
 *
 * Chromatic is deliberately absent — it is paid at team scale and ADR-007/012
 * forbid paid dependencies. Visual regression runs on Playwright screenshots
 * instead (ADR-009), which is free and runs in our own CI.
 */
const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y', // axe-core — accessibility is a release gate
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  typescript: { reactDocgen: 'react-docgen-typescript' },
  // No anonymous telemetry leaves this project.
  core: { disableTelemetry: true },
};

export default config;
