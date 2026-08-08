import { defineConfig, devices } from '@playwright/test';

/**
 * THE SIGNED-IN LIVE CHECK — the gap `live-suite.yml` names in its own comments.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS EXISTS: EVERY LIVE CHECK UNTIL NOW WAS ANONYMOUS.
 *
 * `live-suite.yml` asks each route whether it is deployed and whether it
 * refuses a stranger, and 401 is its proof of both. That is a genuinely useful
 * question and it is not the important one. Its own comment says so:
 *
 *   "if migration 064 had not been applied the route would still 401 an
 *    anonymous caller, because the guard runs BEFORE any query. So a 401 there
 *    says nothing whatever about the schema.
 *    ▶ A real schema assertion needs a token. That is the gap to close next."
 *
 * This config closes it. A 401 proves a route exists; only a signed-in read
 * proves the schema landed, the RLS policies admit the right person, and the
 * screen renders something true.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠️ A REAL BROWSER LOGIN, NOT A PASSWORD GRANT ─────────────────────────
 *
 * The obvious shortcut is Keycloak's direct access grant: POST a username and
 * password, get a token, curl the API. It was rejected. NO client in
 * `realm-autoworkshop.json` has `directAccessGrantsEnabled` — all nine are
 * `false` — and turning it on for a PRODUCTION realm to make a test easier is
 * weakening the live authentication surface for the convenience of the person
 * checking it. That is not a trade to make quietly, and it is the owner's call
 * rather than mine.
 *
 * The authorization-code flow through a real browser needs no realm change at
 * all, and it exercises the thing users actually do — which is the whole point
 * of a live check. `playwright.identity.config.ts` already proved this works
 * against a real Keycloak; this is that machinery pointed at production.
 *
 * ── ⚠️ STARTS NOTHING ─────────────────────────────────────────────────────
 *
 * No `webServer`, like the identity config and for the same reason: the target
 * is a deployed site. Building seven Next apps to visit a URL would be absurd,
 * and a stale local `.next` has faked a live defect in this repository before.
 *
 * ── ⚠️ TIMEOUTS ARE COLD-START SIZED ──────────────────────────────────────
 *
 * These are free-tier services. Keycloak has been measured at ~127s from cold
 * and a 90s timeout produced a confident "the app is down" report on 2026-08-07
 * when nothing was wrong. The per-test timeout here is 4 minutes, deliberately
 * generous: a slow pass is information, a false failure is noise that teaches
 * people to ignore red.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /live-signed-in\.spec\.ts/,
  // Serial and single-worker: every test shares one Keycloak SSO session, and
  // a parallel sign-out would look like a flaky login page.
  workers: 1,
  fullyParallel: false,
  // 🔴 NO RETRIES. A retry against production hides intermittency, and
  // intermittency on a live site IS the finding.
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['json', { outputFile: 'live-results.json' }]] : 'list',
  timeout: 240_000,
  expect: { timeout: 60_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env['APEX_URL'] ?? 'https://autoworkshop.aiappinvent.com',
    trace: 'retain-on-failure',
    // Production is HTTPS with a real certificate; anything else is a finding.
    ignoreHTTPSErrors: false,
  },
});
