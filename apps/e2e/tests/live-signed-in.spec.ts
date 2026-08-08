import { test, expect, type Page } from '@playwright/test';

/**
 * WHAT THE OWNER SEES AFTER SIGNING IN TO THE LIVE SITE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THE ONE THING NO OTHER CHECK IN THIS REPOSITORY CAN OBSERVE.
 *
 * `live-suite.yml` is entirely anonymous: it asks each route whether it is
 * deployed and whether it refuses a stranger. A 401 answers both and answers
 * NOTHING about what a signed-in person actually gets — the guard runs before
 * any query, so a route whose table does not exist 401s exactly like one whose
 * table does.
 *
 * On 2026-08-08 the owner reported four times that signing in dropped them on
 * a customer page. Three diagnoses were wrong. Every one was wrong because the
 * evidence available was HTML read anonymously, and the symptom only exists for
 * somebody holding a session. This file is the instrument that was missing.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠️ IT SKIPS WITHOUT CREDENTIALS, LOUDLY, AND NEVER FAILS FOR THEIR LACK ─
 *
 * `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` are repository secrets. When they
 * are absent every test SKIPS and says what was not proven. Three states, never
 * two — and a suite that goes red because a secret is unset is the fastest way
 * to teach people that red means nothing. That exact mistake turned `Release`
 * red on 2026-08-08 for having no database in CI.
 *
 * ── ⚠️ WHAT THIS FILE MUST NEVER DO ───────────────────────────────────────
 *
 * It signs in as a REAL owner on the REAL site, so it is read-only by
 * construction: it navigates and asserts, and it does not create, decide,
 * approve, convert or delete anything. A live check that writes is a live check
 * that eventually corrupts the owner's data at 3am. The one exception is the
 * session itself, which is why it signs out at the end.
 */

const OWNER_EMAIL = process.env['LIVE_OWNER_EMAIL'] ?? '';
const OWNER_PASSWORD = process.env['LIVE_OWNER_PASSWORD'] ?? '';
const APEX = (process.env['APEX_URL'] ?? 'https://autoworkshop.aiappinvent.com').replace(/\/$/, '');

/**
 * Sign in through the real browser flow, exactly as a person does.
 *
 * ⚠️ THE USERNAME IS THE FULL EMAIL. The realm uses email-as-username
 * (`registrationEmailAsUsername`), and this repository has lost time to typing
 * the local part and reading the resulting failure as an outage.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${APEX}/home/dashboard`, { waitUntil: 'domcontentloaded' });

  // The shell's own control, scoped — the page body may carry its own sign-in
  // affordance and an unscoped locator fails Playwright's strict mode.
  const shellSignIn = page.getByLabel('Global actions').getByRole('link', { name: 'Sign in' });
  if (await shellSignIn.count()) {
    await shellSignIn.first().click();
  } else {
    // Already signed in from a previous test in this serial file.
    return;
  }

  const providerButton = page.getByRole('button', { name: /Keycloak/i });
  if (await providerButton.count()) await providerButton.first().click();

  await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/, { timeout: 180_000 });
  await page.fill('#username', OWNER_EMAIL);
  await page.fill('#password', OWNER_PASSWORD);
  await page.click('#kc-login');

  await page.waitForURL(new RegExp(APEX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
    timeout: 180_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('the live site, signed in as the workshop owner', () => {
  test.beforeAll(() => {
    test.skip(
      !OWNER_EMAIL || !OWNER_PASSWORD,
      'LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set — the SIGNED-IN half of ' +
        'the live suite did NOT run. What a real owner sees after signing in, whether ' +
        'the 061/063/064/067 schema landed, and whether the lead pipeline reads on ' +
        'production are all UNPROVEN by this run.',
    );
  });

  /**
   * 🔴 THE BUG THE OWNER REPORTED FOUR TIMES, TURNED INTO AN ASSERTION.
   *
   * Signing in at the apex must leave you AT THE APEX, on the workshop tree.
   * The specific defect: a sign-in link carrying an ABSOLUTE customer-web
   * callback made the apex's own sign-in route hand the session to another
   * host — separate hosts, separate sessions, so the owner arrived at the
   * customer app as a stranger. Fixed in `c586e38` (`signInHrefFor`).
   *
   * Asserted on the URL HOST, not on page text, because "what the address bar
   * says at the moment the wrong page appears" was the single fact that would
   * have settled it in one round instead of four.
   */
  test('signing in at the apex lands on the apex, not on customer-web', async ({ page }) => {
    await signIn(page);

    const landed = new URL(page.url());
    const expected = new URL(APEX);
    expect(
      landed.host,
      `signed in at ${expected.host} and landed on ${landed.host} — a cross-host ` +
        `callback hands the session to an origin that does not have it`,
    ).toBe(expected.host);

    // And a session really exists — otherwise "on the right host" is true of a
    // signed-out visitor too, and the assertion above would pass vacuously.
    await expect(page.getByRole('button', { name: /Sign out/ })).toBeVisible();
  });

  /**
   * The workshop tree, by its own entries.
   *
   * ⚠️ NAVIGATION LABELS, NOT A ROLE STRING. `/me` returning `workshop_owner`
   * proves the API's opinion; it does not prove the person can SEE the workshop.
   * A customer page and an owner page can both be served by an app that knows
   * perfectly well who you are.
   */
  test('the dashboard renders the workshop tree, not a customer page', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APEX}/home/dashboard`, { waitUntil: 'domcontentloaded' });

    const body = await page.locator('body').innerText();
    // Two entries only management sees. Requiring several guards against one
    // label being renamed and the check silently becoming vacuous.
    const workshopMarkers = ['Customer Reception', 'Workshop Floor'];
    const missing = workshopMarkers.filter((m) => !body.includes(m));
    expect(missing, `the owner's dashboard is missing: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * 🔴 A SIGNED-IN READ OF A ROUTE WHOSE TABLE IS NEW — the schema assertion
   * `live-suite.yml` cannot make.
   *
   * `/customer-reception/leads` reads `GET /leads`, which reads `crm.leads`
   * (migration 064). Anonymously it 401s whether or not 064 was ever applied.
   * Signed in, a missing table or a policy that refuses the owner produces a
   * visible failure state instead of the screen.
   *
   * ⚠️ AN EMPTY PIPELINE IS A PASS. A workshop with no leads is the normal
   * state, and asserting rows exist would make this fail for a correct product.
   * What must NOT appear is the shell's API-failure state — that is the shape a
   * missing migration takes on screen.
   */
  test('the lead pipeline renders for the owner, empty or not', async ({ page }) => {
    await signIn(page);
    const response = await page.goto(`${APEX}/customer-reception/leads`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status(), 'the leads route did not render').toBeLessThan(400);

    const body = await page.locator('body').innerText();
    // `ApiFailure` renders one of these; any of them means the page loaded and
    // the DATA did not, which is exactly the migration-shaped failure.
    const failureText = /could not be reached|did not respond|do not have access|sign in again/i;
    expect(
      failureText.test(body),
      `the leads screen rendered an API failure state:\n${body.slice(0, 600)}`,
    ).toBe(false);

    // The screen's own heading, so "no failure text" cannot pass against a
    // blank page.
    expect(body).toMatch(/Lead pipeline/i);
  });

  /**
   * Sign out, so the run leaves no live session behind.
   *
   * ⚠️ THIS IS CLEANUP THAT IS ALSO AN ASSERTION. A sign-out that does not end
   * the session is the T-0005 finding this repository already shipped once, and
   * leaving a signed-in session alive on a CI runner's browser profile is the
   * shared-terminal problem in miniature.
   */
  test('signing out ends the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: /Sign out/ }).click();
    await expect(
      page.getByLabel('Global actions').getByRole('link', { name: 'Sign in' }),
    ).toBeVisible();
  });
});
