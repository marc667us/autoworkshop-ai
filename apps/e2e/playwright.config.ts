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
    /**
     * Runs before everything else and fails the whole run if any server is
     * serving a build that no longer exists on disk.
     *
     * This exists because of T-0030. A phantom "defect" — side nav inline at
     * 360px, `main` squeezed to 103px, 161px of horizontal overflow — was
     * reported, recorded and carried across a session boundary as live. It was
     * none of those things. Seven `next start` servers had been launched at
     * 12:35, the apps were rebuilt at 14:38 underneath them, and
     * `reuseExistingServer` handed those stale servers straight to the suite.
     * A running Next server resolves its chunk manifest once at boot, so it
     * kept emitting HTML referencing chunk hashes the rebuild had deleted.
     * Every one 404'd, React never hydrated, `useIsMobile()` never got past its
     * SSR default of `false` — and the side nav rendered inline for a reason
     * that had nothing whatsoever to do with the shell.
     *
     * The trap is that it fails *silently and plausibly*: the server still
     * returns 200, the SSR markup is correct, and the pure-CSS half of the
     * responsive design keeps working, so the page looks merely broken rather
     * than unhydrated. It is indistinguishable from a real responsive bug
     * unless you check whether the JavaScript actually loaded.
     *
     * A guard belongs here rather than in a doc note: the previous instruction
     * ("stop the servers before rebuilding") was already written down in
     * SESSION_HANDOVER.md and was still followed incorrectly.
     */
    {
      name: 'build-guard',
      testMatch: /build-freshness\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'storybook-a11y',
      testMatch: /(a11y-storybook|component-behaviour)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${STORYBOOK_PORT}` },
      dependencies: ['build-guard'],
    },
    {
      name: 'shell-journey',
      testMatch: /(shell-journey|a11y-workspaces)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['build-guard'],
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
      // `cwd` MATTERS, and getting it wrong is not cosmetic. This previously read
      // `npx next start ../${w.name}-web` with the default cwd of `apps/e2e`, so
      // npx resolved `next` from THIS package — which pinned 14.2.21 — and used
      // it to serve apps built with 15.1.3. Next 14 cannot read a Next 15 build:
      // it dies on a missing `font-manifest.json`, a file Next 15 no longer
      // emits. The mismatch stayed invisible for as long as the suite happened
      // to reuse servers someone had started by hand from inside each app.
      //
      // Running from the app's own directory guarantees an app is always served
      // by the same Next it was built with.
      command: `npx next start -p ${w.port}`,
      cwd: `../${w.name}-web`,
      url: `http://127.0.0.1:${w.port}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: {
        // AUTH_SECRET IS MANDATORY TO SERVE A PAGE AT ALL, not merely to sign
        // in. Since T-0005 every app runs `auth` as middleware on every matched
        // request, and the Auth.js config resolves the secret when it is built —
        // so without this the suite would get a 500 from every route and report
        // a shell that is completely broken, when the only thing missing is an
        // environment variable.
        //
        // A FIXED, PUBLIC VALUE ON PURPOSE. This suite never signs in
        // (`SUITE_VIEWER` is null), so this secret encrypts nothing: no session
        // cookie is ever issued. Generating a random one per run would be
        // security theatre over an empty box, and would make a failure depend on
        // which run you were looking at. Deployments supply a real secret from
        // their own environment; this value must never be one of them.
        AUTH_SECRET: 'e2e-suite-secret-never-used-for-a-real-session',
      },
    })),
  ],
});
