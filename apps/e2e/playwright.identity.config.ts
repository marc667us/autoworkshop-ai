import { defineConfig, devices } from '@playwright/test';

/**
 * The identity journey — a SEPARATE config, and deliberately server-less.
 *
 * The main `playwright.config.ts` starts Storybook plus all seven Next apps
 * before any test runs. That is right for the shell suite, which asserts across
 * every workspace, and wrong for this one: it drives ONE app against a real
 * Keycloak, and paying for eight servers to exercise one of them turns a
 * two-minute check into a full rebuild of the monorepo.
 *
 * It is not merely slow. Attempting it surfaced the trap directly: six of the
 * seven apps had `.next` builds older than the `trustHost` fix, so every
 * `/api/auth/*` call against them failed with `UntrustedHost` — an error that
 * reads exactly like a live configuration defect and was a stale artifact on
 * disk. (Confirmed by serving the SAME fresh build with and without `AUTH_URL`:
 * both answer 200, so `trustHost` genuinely works.)
 *
 * SO THIS CONFIG STARTS NOTHING AND ASSUMES A SERVER IS ALREADY UP, with an
 * environment the shared config deliberately does not provide — real
 * `AUTH_SECRET`, `API_BASE_URL` and `KEYCLOAK_*`, because every other project
 * signs in to nothing. Run it as:
 *
 *   bash scripts/seed-dev-identity.sh
 *   (cd apps/api && node dist/main.js)
 *   (cd apps/customer-web && rm -rf .next && next build \
 *      && AUTH_SECRET=… API_BASE_URL=http://localhost:4000 next start -p 3000)
 *   (cd apps/e2e && npx playwright test --config playwright.identity.config.ts)
 *
 * `rm -rf .next` in that sequence is not optional — it is the same freshness
 * discipline the main config enforces with its `build-guard` project, which
 * cannot run here because there is no server for it to inspect.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /sign-out-revocation\.spec\.ts/,
  // Serial: both tests share one Keycloak SSO session, and signing out in one
  // while the other is mid-login is a race that reports as a flaky login page.
  workers: 1,
  fullyParallel: false,
  reporter: 'line',
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
});
