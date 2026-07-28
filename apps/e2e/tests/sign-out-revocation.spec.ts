import { test, expect } from '@playwright/test';

/**
 * T-0005 FINDING 5 — does signing out actually REVOKE the refresh token?
 *
 * This is the only test in the suite that answers that, and it is a browser
 * test rather than a unit test on purpose. Everything below the browser was
 * already green while the finding was open: `revokeRefreshToken()` typechecked,
 * `signOutCompletely()` typechecked, and neither was called by anything. Unit
 * tests prove the function builds a correct request; only this proves the
 * request is ever made.
 *
 * WHAT IT ASSERTS, in order:
 *   1. an anonymous viewer is offered Sign IN and never Sign OUT — the defect
 *      found while building this: `viewerLabels(null).userLabel` used to be the
 *      string `'Sign in'`, which the account control read as a session;
 *   2. a real Keycloak login produces a session and a Sign out control;
 *   3. pressing it ends the session — the shell returns to its signed-out state
 *      and `/api/auth/session` no longer names a user;
 *   4. the Keycloak SSO session is gone too, so returning to sign-in shows the
 *      LOGIN FORM rather than completing silently. That last one is the whole
 *      point on a shared workshop terminal: a cookie-only sign-out looks
 *      identical to a real one until the next person clicks Sign in and lands
 *      inside the previous user's account.
 *
 * REQUIRES THE LOCAL STACK: Keycloak, the API, and `scripts/seed-dev-identity.sh`
 * having run. It is skipped rather than failed when they are absent, because a
 * red suite that only means "docker is down" trains people to ignore red.
 */

const KEYCLOAK = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
const REALM = process.env['KEYCLOAK_REALM'] ?? 'autoworkshop';
const CUSTOMER_WEB = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const USER = 'technician@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

test.describe('sign-out revokes the Keycloak session (T-0005 finding 5)', () => {
  test.beforeAll(async ({ request }) => {
    // Skip, not fail, when the stack is not up — see the header note.
    let realmUp = false;
    try {
      const r = await request.get(`${KEYCLOAK}/realms/${REALM}/.well-known/openid-configuration`, {
        timeout: 15_000,
      });
      realmUp = r.ok();
    } catch {
      realmUp = false;
    }
    test.skip(!realmUp, `Keycloak realm "${REALM}" is not reachable at ${KEYCLOAK}`);
  });

  test('an anonymous viewer is offered Sign in, never Sign out', async ({ page }) => {
    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);

    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    // The regression this locks: a display label doubling as an authentication
    // fact put a Sign out button in front of users who had no session at all.
    await expect(page.getByRole('button', { name: /Sign out/ })).toHaveCount(0);
  });

  test('signing out ends the local session AND the Keycloak SSO session', async ({ page }) => {
    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);
    await page.getByRole('link', { name: 'Sign in' }).click();

    // Auth.js's default sign-in page lists the providers; with exactly one it
    // still requires the click, and the button carries the provider's name.
    const providerButton = page.getByRole('button', { name: /Keycloak/i });
    if (await providerButton.count()) await providerButton.first().click();

    // Keycloak's own login form.
    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login');

    // Back in the app, with a session.
    await page.waitForURL(new RegExp(CUSTOMER_WEB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      timeout: 30_000,
    });
    const signOut = page.getByRole('button', { name: /Sign out/ });
    await expect(signOut).toBeVisible({ timeout: 15_000 });

    // The session endpoint must name the user and must NOT carry tokens — the
    // second half is asserted because `/api/auth/session` is served to the
    // browser as JSON, so anything on the session object is public.
    const session = await (await page.request.get(`${CUSTOMER_WEB}/api/auth/session`)).json();
    expect(JSON.stringify(session)).not.toMatch(/accessToken|refreshToken|idToken|eyJ/);

    await signOut.click();

    // 1. The local session is gone: the shell is back to its signed-out state.
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 });
    const after = await (await page.request.get(`${CUSTOMER_WEB}/api/auth/session`)).json();
    expect(after?.user).toBeFalsy();

    // 2. THE PART THAT DISTINGUISHES A REAL SIGN-OUT FROM A CLEARED COOKIE.
    // With the Keycloak session still alive, clicking Sign in again completes
    // without any prompt and lands straight back inside the account. Reaching
    // the login FORM is the proof that the SSO session was ended too.
    await page.getByRole('link', { name: 'Sign in' }).click();
    const provider = page.getByRole('button', { name: /Keycloak/i });
    if (await provider.count()) await provider.first().click();
    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible({ timeout: 15_000 });
  });
});
