/**
 * HALF ONE of the refresh-token revocation proof (T-0005 finding 5).
 *
 * Logs in for real through Keycloak, writes the session cookies to disk, and —
 * with `--sign-out` — presses Sign out. `try-refresh.mjs` then takes those
 * cookies and asks Keycloak to USE the refresh token. Run it both ways; the
 * difference is the entire claim:
 *
 *     (cd apps/e2e     && node verify/capture-session.mjs)             *     (cd packages/auth && node verify/try-refresh.mjs)         -> HTTP 200, token live
 *
 *     (cd apps/e2e     && node verify/capture-session.mjs --sign-out)  *     (cd packages/auth && node verify/try-refresh.mjs)         -> HTTP 400 invalid_grant
 *
 * Measured 2026-07-28: exactly that. Before the wiring landed, BOTH returned
 * 200 — `revokeRefreshToken()` existed and nothing called it.
 *
 * WHY TWO SCRIPTS. Playwright resolves from `apps/e2e` and `next-auth/jwt`
 * resolves from `packages/auth`; under pnpm's isolated stores no single file can
 * import both. The cookie file on disk is the seam.
 *
 * DEV ONLY, and it refuses to run without an explicit secret so it can never be
 * pointed at a deployed environment by accident.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const SEAM = new URL('../../../.verify-session-cookies.json', import.meta.url);


const APP = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const SIGN_OUT = process.argv.includes('--sign-out');

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${APP}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).click();
const p = page.getByRole('button', { name: /Keycloak/i });
if (await p.count()) await p.first().click();
await page.waitForURL(/openid-connect\/auth/, { timeout: 30000 });
await page.fill('#username', 'technician@autoworkshop.local');
await page.fill('#password', process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!');
await page.click('#kc-login');
await page.waitForURL((u) => u.toString().startsWith(APP), { timeout: 30000 });

// Captured BEFORE any sign-out — this is the credential an attacker would have.
writeFileSync(SEAM, JSON.stringify(await ctx.cookies(), null, 2));
console.log('captured session cookies');

if (SIGN_OUT) {
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.waitForTimeout(5000);
  console.log('signed out; final url =', page.url());
}
await browser.close();
