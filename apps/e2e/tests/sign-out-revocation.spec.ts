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

  /**
   * ⚠️ SCOPED TO THE SHELL'S OWN CONTROL, and that is the assertion this test
   * always meant to make.
   *
   * An unscoped `getByRole('link', { name: 'Sign in' })` now matches TWO
   * elements and fails on Playwright's strict mode:
   *
   *   1) the shell's global-actions control, and
   *   2) one inside `#main-content` — the signed-out dashboard's own
   *      "sign in and continue" affordance, added when the funnel was fixed so
   *      a visitor stops being dropped anonymously onto a form.
   *
   * Both are correct and both should exist. The regression this test locks is
   * in the SHELL — its own comment says so: "a display label doubling as an
   * authentication fact put a Sign out button in front of users who had no
   * session at all." That defect lives in `viewerLabels`, not in the page body.
   *
   * So the locator is narrowed to the region the test is about. This makes the
   * assertion MORE precise, not weaker: it still requires a visible Sign in and
   * still requires ZERO Sign out buttons anywhere on the page. The unscoped
   * version passed only because there happened to be exactly one match, which
   * is a coincidence of layout rather than a statement about authentication.
   */
  const shellSignIn = (page: import('@playwright/test').Page) =>
    page.getByLabel('Global actions').getByRole('link', { name: 'Sign in' });

  /**
   * ⚠️ AFTER SIGN-OUT THERE IS NO SHELL TO SCOPE TO, and that is correct
   * behaviour rather than a gap.
   *
   * `performSignOut` ends the Keycloak SSO session and Keycloak returns the
   * browser to `/` — the PUBLIC LANDING PAGE, which is a marketing layout with
   * no `Global actions` region at all. Measured from the failure snapshot: the
   * post-sign-out page offers "Request repair service", "Create a free
   * account", "Browse parts now" and "Sign in", none of them inside a shell.
   *
   * So the post-sign-out assertion uses a page-level locator with `.first()`.
   * It is still a real assertion — a Sign IN link must be present and, below,
   * `/api/auth/session` must name nobody — it simply stops assuming the visitor
   * is returned to an application shell they no longer have a session for.
   */
  const anySignIn = (page: import('@playwright/test').Page) =>
    page.getByRole('link', { name: 'Sign in' }).first();

  test('an anonymous viewer is offered Sign in, never Sign out', async ({ page }) => {
    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);

    await expect(shellSignIn(page)).toBeVisible();
    // The regression this locks: a display label doubling as an authentication
    // fact put a Sign out button in front of users who had no session at all.
    // Deliberately UNSCOPED — a Sign out button is wrong ANYWHERE on this page.
    await expect(page.getByRole('button', { name: /Sign out/ })).toHaveCount(0);
  });

  test('signing out ends the local session AND the Keycloak SSO session', async ({ page }) => {
    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);
    await shellSignIn(page).click();

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

    // 1. The local session is gone. Keycloak's logout returns the browser to
    // the PUBLIC LANDING page, so this asserts a signed-out affordance rather
    // than a shell — see `anySignIn`. The session check on the next line is the
    // load-bearing half; this one proves a human has a way back in.
    await expect(anySignIn(page)).toBeVisible({ timeout: 30_000 });
    // And no Sign OUT anywhere, which is the original regression restated for
    // the page the visitor actually ends up on.
    await expect(page.getByRole('button', { name: /Sign out/ })).toHaveCount(0);
    const after = await (await page.request.get(`${CUSTOMER_WEB}/api/auth/session`)).json();
    expect(after?.user).toBeFalsy();

    // 2. THE PART THAT DISTINGUISHES A REAL SIGN-OUT FROM A CLEARED COOKIE.
    // With the Keycloak session still alive, clicking Sign in again completes
    // without any prompt and lands straight back inside the account. Reaching
    // the login FORM is the proof that the SSO session was ended too.
    await anySignIn(page).click();
    const provider = page.getByRole('button', { name: /Keycloak/i });
    if (await provider.count()) await provider.first().click();
    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible({ timeout: 15_000 });
  });

  /**
   * 🔴 THE OWNER'S BUG, ASSERTED DIRECTLY — reported twice.
   *
   * 2026-08-07: "still customer page showup for every role user login".
   * 2026-08-08, after the first fix shipped: "still same problem its customer
   * app that comes up".
   *
   * MECHANISM. `aw.activeRole` is read by `activeRoleName()` and sent to the
   * API as `x-role-name`. `resolveTenantContext` treats that as a REQUEST and
   * FILTERS to that role before anything else — so a stored `customer` value
   * bypasses role precedence entirely. The 07 fix made the DEFAULT the
   * strongest role held, which does nothing when a role is explicitly
   * requested, and a cookie always requests one. The value outlived the
   * session, the sign-out and the deploy.
   *
   * ⚠️ THIS TEST EXISTS BECAUSE THE FIX IS THE KIND THAT CAN BE INERT. Clearing
   * a cookie from an Auth.js `events.signIn` handler either works or silently
   * does nothing depending on where the handler runs, and "it typechecks" says
   * which of those is true exactly as well as a coin does. So this plants the
   * bad value, signs in for real, and reads the jar back.
   */
  test('a stale aw.activeRole cookie does NOT survive a fresh sign-in', async ({ page, context }) => {
    // Plant exactly the state the owner's browser was in: pinned to customer,
    // path `/`, as `set-role-action.ts` writes it.
    await context.addCookies([
      {
        name: 'aw.activeRole',
        value: 'customer',
        // `domain` + `path`, not `url` — Playwright rejects `url` alongside
        // `path`, and the PATH is the point: `set-role-action.ts` writes this
        // at `/`, and a delete whose path does not match expires nothing.
        domain: new URL(CUSTOMER_WEB).hostname,
        path: '/',
      },
    ]);

    const before = (await context.cookies()).find((c) => c.name === 'aw.activeRole');
    expect(before?.value, 'the fixture did not plant the cookie').toBe('customer');

    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);
    await anySignIn(page).click();
    const providerButton = page.getByRole('button', { name: /Keycloak/i });
    if (await providerButton.count()) await providerButton.first().click();

    await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login');
    // A predicate rather than a hand-escaped RegExp — the app's own base URL is
    // the thing being waited for, and building a pattern out of it is three
    // escaping mistakes waiting to happen.
    await page.waitForURL((url) => url.href.startsWith(CUSTOMER_WEB), { timeout: 30_000 });

    // THE ASSERTION. A fresh login must start from role precedence, not from
    // whatever the last session left behind.
    const after = (await context.cookies()).find((c) => c.name === 'aw.activeRole');
    expect(
      after?.value ?? null,
      'aw.activeRole survived a fresh sign-in — the account is still pinned to the role a previous session chose, which is the defect reported twice',
    ).toBeNull();
  });
});
