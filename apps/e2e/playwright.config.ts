import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright + axe-core gate (T-0015, `01 (1).txt` §71, ADR-009).
 *
 * Chromatic is deliberately absent — paid at team scale, and ADR-007/012 forbid
 * paid dependencies. Playwright and axe-core are both free and run in our own CI.
 *
 * WHY THIS SUITE EXISTS, SPECIFICALLY
 * -----------------------------------
 * On 2026-07-26 the Phase 3 shell shipped with seven defects. Every one of them
 * passed `typecheck`, `lint`, the full unit suite AND a nine-target production
 * build while broken. They were found by reading the code adversarially and by
 * curl-ing the running app. So the assertions in `shell-journey.spec.ts` are not
 * generic smoke tests — each one pins a property that a green unit suite
 * demonstrably could not see.
 *
 * Two projects:
 *   storybook-a11y  — axe-core over every story, every component state
 *   shell-journey   — real browser against the built Next apps
 *
 * The seven web servers are started from the ALREADY-BUILT output. `next start`
 * without `-p` ignores the port in package.json and every app fights over 3000,
 * so each port is passed explicitly.
 */

const WORKSPACES = [
  { name: 'customer', port: 3000 },
  { name: 'workshop', port: 3001 },
  { name: 'supplier', port: 3002 },
  { name: 'fleet', port: 3003 },
  { name: 'insurance', port: 3004 },
  { name: 'towing', port: 3005 },
  { name: 'admin', port: 3006 },
] as const;

export const workspaces = WORKSPACES;
export const STORYBOOK_PORT = 6100;

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // A shell defect is usually deterministic; a retry that goes green is a
  // flake worth seeing, so retry only on CI and never locally.
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'storybook-a11y',
      testMatch: /(a11y-storybook|component-behaviour)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${STORYBOOK_PORT}` },
    },
    {
      name: 'shell-journey',
      testMatch: /(shell-journey|a11y-workspaces)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Serving the static Storybook build and the seven built Next apps. Playwright
  // reuses anything already listening locally, which keeps the inner loop fast;
  // on CI it always starts them fresh so a stale server cannot mask a break.
  webServer: [
    {
      command: `npx http-server ../storybook/storybook-static -p ${STORYBOOK_PORT} --silent`,
      url: `http://127.0.0.1:${STORYBOOK_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    ...WORKSPACES.map((w) => ({
      command: `npx next start ../${w.name}-web -p ${w.port}`,
      url: `http://127.0.0.1:${w.port}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    })),
  ],
});
