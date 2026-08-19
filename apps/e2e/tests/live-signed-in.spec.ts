import { test, expect, type Page } from '@playwright/test';
import { flattenItems, workspaceForRole, workspaces } from '@autoworkshop/navigation';

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

/**
 * The path the OWNER's own navigation reaches the lead pipeline by — resolved
 * from the tree, never typed as a literal.
 *
 * 🔴 THIS FILE ASSERTED SOMEBODY ELSE'S TREE TWICE, AND ONLY ONE WAS FIXED.
 *
 * The dashboard test below carries the first instance in its comment: it
 * demanded 'Customer Reception' and 'Workshop Floor', which are groups of the
 * DEFAULT STAFF tree and exist in `workshopOwnerGroups` nowhere. The leads test
 * held the identical mistake in a URL — `/customer-reception/leads` — and it was
 * missed because a route reads like an address rather than like a claim about a
 * role. The owner tree has no `customer-reception` group AT ALL; its leads item
 * is `/workshop-operations/leads` (workspaces.ts, the `workshop-operations`
 * group). `requireNavRoute` calls `notFound()` for a route the viewer's tree
 * does not advertise, so the page returned 404 and the run reported "the leads
 * route did not render" against a product that was behaving exactly as designed.
 *
 * ⚠️ THE SAME SCREEN IS MOUNTED AT BOTH PATHS — `app/customer-reception/leads`
 * and `app/workshop-operations/leads` both render `LeadsScreen`. So this is not
 * a missing page; it is the wrong door for this viewer, and asserting the other
 * door would have been a real defect had the owner ever been meant to use it.
 *
 * DERIVED, so the path can no longer be a stale literal: move the item within
 * the owner tree and this follows it; remove it and the throw below is loud
 * where a hardcoded path would have gone on quietly probing a 404.
 *
 * 🔴 AND IT ASSERTS IT REALLY GOT THE ROLE TREE, BECAUSE `workspaceForRole`
 * FAILS OPEN. `groupsForRole` is `roleGroups?.[role] ?? workspace.groups`
 * (`resolve.ts`), so an absent `owner:` key does not error — it silently hands
 * back the DEFAULT STAFF tree. That tree has a `leads` item too, at
 * `/customer-reception/leads`: the exact path this fix removed. Without the
 * identity check below, dropping or renaming the key in `workshopRoleGroups`
 * would resolve the broken path straight back, the item lookup would succeed so
 * nothing would throw, and the failure message would then MISDIAGNOSE it by
 * calling that path "the OWNER's own navigation tree". A check that walks
 * through its own gap is a recorded defect class here; found by the Supervisor
 * on this diff, missed by Codex.
 *
 * ⚠️ RESOLVED INSIDE THE TEST, NOT AT MODULE SCOPE, and that is the second
 * Supervisor finding. A module-scope throw runs during Playwright's COLLECTION,
 * before `beforeAll` — so it takes down all four tests in this file as a
 * file-load error, and they report as neither passed nor failed nor skipped.
 * Three states, never two, is a standing rule here. Resolving lazily makes a
 * broken tree fail THE LEADS TEST, by name, with a message naming the cause.
 *
 * ⚠️ IT DOES NOT MAKE THE WHOLE FILE SURVIVE, AND SAYING SO WOULD BE THE THIRD
 * WRONG CLAIM IN THIS FILE (Codex, final approval). This describe block is
 * `mode: 'serial'`, so a failure SKIPS every test after it — the sign-out
 * assertion below included. That is pre-existing and not introduced here, and
 * the last live run is the proof: **2 passed / 1 failed / 1 skipped**, four
 * tests, where the skip WAS sign-out, skipped because leads failed.
 *
 * So the honest claim is narrower: lazy resolution moves the blast radius from
 * "all four tests vanish, unreported" to "the leads test FAILS by name, the two
 * before it still report, the one after it SKIPS". Three states throughout,
 * which is the rule the module-scope version broke. Reordering so leads runs
 * last was considered and rejected: sign-out is deliberately last because it
 * leaves no live session behind on the runner, and buying a skip-free run by
 * abandoning a signed-in production session is a bad trade.
 *
 * ⚠️ IT SHARES THE TREE HELPER, NOT THE WHOLE RESOLUTION — and the difference is
 * worth stating plainly rather than implying a guarantee that does not exist
 * (Codex, this diff). `requireNavRoute` derives the role from the LIVE viewer,
 * rejects a role foreign to the workspace, and then filters the tree through
 * `visibleGroups` against the viewer's grants. This constant pins the role to
 * `'owner'` and applies no grant filter. Two consequences, both currently
 * harmless and neither silent:
 *
 *   · If the live account's active role stops being `workshop_owner`, this
 *     probes the owner's route as somebody else and fails — but the dashboard
 *     test above fails first and more clearly, on markers unique to the owner
 *     tree, so the diagnosis lands there rather than here.
 *   · If the Leads item ever gains a `permission`, `visibleGroups` could hide it
 *     from a viewer this constant still resolves it for. Today it is ungated in
 *     BOTH trees, deliberately (see the note beside it in `workspaces.ts`), so
 *     the two resolutions agree.
 *
 * Closing that last gap properly means reading the link out of the rendered
 * navigation of the signed-in page — strictly better, and a change to how this
 * test discovers routes rather than to the defect it was fixed for. Not folded
 * into a one-line fix for a red live suite.
 */
function ownerLeadsRoute(): string {
  const base = workspaces.workshop;
  const ownerTree = workspaceForRole(base, 'owner');

  // The fail-open check. `workspaceForRole` returns the workspace UNCHANGED when
  // it falls back, so this identity comparison is exact rather than heuristic.
  if (ownerTree.groups === base.groups) {
    throw new Error(
      "the workshop workspace has no 'owner' role tree — `workspaceForRole` fell " +
        'back to the DEFAULT STAFF tree, whose leads item is /customer-reception/' +
        'leads, the very path an owner 404s on. Restore the `owner:` key in ' +
        '`workshopRoleGroups` (packages/navigation/src/workspaces.ts) rather than ' +
        'letting this test probe the staff path again.',
    );
  }

  const leads = flattenItems(ownerTree.groups).find((i) => i.id === 'leads');
  if (!leads) {
    throw new Error(
      "the workshop OWNER navigation tree has no 'leads' item — either the lead " +
        'pipeline was removed from the owner tree (in which case delete this test ' +
        'rather than pointing it at another role\'s route) or the item id changed.',
    );
  }
  return leads.href;
}

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
  // 🔴 ADR-021: `/workshop/home/dashboard`, NOT `/home/dashboard`. The apex used
  // to BE workshop-web, so its dashboard sat at the root; the seven packs are
  // paths inside one artifact now.
  //
  // This is what failed the signed-in job on the first run after the merge, and
  // the failure told the truth in a misleading way: `/home/dashboard` 404s, a
  // 404 renders no shell, and the helper timed out waiting for the shell's
  // "Sign in". Read literally that says "the shell did not render" — which is
  // correct, and nothing to do with sign-in being broken.
  //
  // The apex root `/` is deliberately NOT usable here: it is the public
  // marketplace and renders no shell at all, by the same 2026-08-03 decision
  // that a signed-out visitor must not be shown the application's navigation.
  await page.goto(`${APEX}/workshop/home/dashboard`, { waitUntil: 'domcontentloaded' });

  // The shell's own control, scoped — the page body may carry its own sign-in
  // affordance and an unscoped locator fails Playwright's strict mode.
  // 🔴 THE EARLY RETURN REQUIRES A VISIBLE `Sign out`, NOT merely an ABSENT
  // `Sign in`. The first version returned whenever the sign-in control was
  // missing, justified as "already signed in from a previous test in this
  // serial file" — which is FALSE: Playwright gives every test a fresh browser
  // context even in serial mode, so a session is never carried over. The branch
  // could therefore only fire when the shell failed to render its control, and
  // the test then continued ANONYMOUSLY and passed — turning a file whose whole
  // purpose is observing what a signed-in owner sees into an assertion about a
  // logged-out page. Supervisor, 2026-08-09.
  if (await page.getByRole('button', { name: /Sign out/ }).count()) return;

  const shellSignIn = page.getByLabel('Global actions').getByRole('link', { name: 'Sign in' });
  // No sign-out AND no sign-in means the shell did not render. That is a
  // finding, not a reason to carry on and assert against whatever is there.
  await shellSignIn.first().waitFor({ state: 'visible', timeout: 60_000 });
  await shellSignIn.first().click();

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
    await page.goto(`${APEX}/workshop/home/dashboard`, { waitUntil: 'domcontentloaded' });

    const body = await page.locator('body').innerText();

    // 🔴 THE OWNER HAS THEIR OWN TREE, AND THIS ASSERTED SOMEBODY ELSE'S.
    //
    // It demanded 'Customer Reception' and 'Workshop Floor'. Both are groups in
    // the DEFAULT STAFF tree (`workshopGroups`); neither exists in
    // `workshopOwnerGroups`, whose eight groups are Home, Workshop Management,
    // Customers and Vehicles, Workshop Operations, Repair Control, Parts and
    // Suppliers, Knowledge and Staff, Reports. Since T-0027 the navigation is
    // resolved per ROLE, so an owner correctly sees the owner tree — and this
    // check reported a product failure against a product that was right.
    //
    // It failed the very first time it ever ran: the signed-in job had been
    // SKIPPED on every previous run for want of credentials, so the wrong
    // expectation sat there unexercised.
    //
    // ⚠️ MARKERS CHOSEN TO BE ABSENT FROM THE CUSTOMER TREE, because "not a
    // customer page" is the actual claim. 'Home' is in both trees and would make
    // this vacuous. Several of them, so renaming one label does not silently
    // turn the check into nothing.
    const ownerMarkers = ['Workshop Management', 'Repair Control', 'Customers and Vehicles'];
    const missing = ownerMarkers.filter((m) => !body.includes(m));
    expect(missing, `the owner's dashboard is missing: ${missing.join(', ')}`).toEqual([]);

    // And positively NOT the customer tree — the failure this test is named for.
    expect(body, 'an owner was served the customer navigation').not.toContain('My Vehicles');
  });

  /**
   * 🔴 A SIGNED-IN READ OF A ROUTE WHOSE TABLE IS NEW — the schema assertion
   * `live-suite.yml` cannot make.
   *
   * The leads screen reads `GET /leads`, which reads `crm.leads` (migration
   * 064). Anonymously it 401s whether or not 064 was ever applied. Signed in, a
   * missing table or a policy that refuses the owner produces a visible failure
   * state instead of the screen.
   *
   * ⚠️ AN EMPTY PIPELINE IS A PASS. A workshop with no leads is the normal
   * state, and asserting rows exist would make this fail for a correct product.
   * What must NOT appear is the shell's API-failure state — that is the shape a
   * missing migration takes on screen.
   *
   * ⚠️ THE ROUTE COMES FROM `ownerLeadsRoute()`, THE OWNER'S OWN TREE — see
   * the note on that constant. A literal path here is a claim about which role's
   * navigation the viewer is on, and this file has already got that wrong twice.
   */
  test('the lead pipeline renders for the owner, empty or not', async ({ page }) => {
    // Resolved HERE, so a broken navigation tree fails this test by name rather
    // than collapsing the whole file at collection time. See `ownerLeadsRoute`.
    const route = ownerLeadsRoute();

    await signIn(page);
    // ADR-021: `route` is the workshop pack's spec route, so it mounts
    // under `/workshop` like every other one in that tree.
    const response = await page.goto(`${APEX}/workshop${route}`, {
      waitUntil: 'domcontentloaded',
    });
    expect(
      response?.status(),
      `the leads route did not render at ${route} — the path the OWNER's own ` +
        `navigation tree advertises`,
    ).toBeLessThan(400);

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
    // 🔴 180s, MATCHING THE SIGN-IN PATH — AND THIS ASSERTION PRODUCED A FALSE
    // RED BEFORE IT DID.
    //
    // Sign-out navigates to Keycloak's `openid-connect/logout`, so it waits on
    // the same cold-startable free-tier service the sign-in helper already
    // budgets 180s for at lines 197 and 203. This one fell back to the default
    // 60s, so the two halves of one journey disagreed about how long Keycloak
    // may take.
    //
    // Measured 2026-08-19, run 32273311688: the suite went RED with
    // "waiting for .../openid-connect/logout navigation to finish" after 60s.
    // Keycloak answered in 0.79s and 0.51s once warm, and the SAME COMMIT
    // passed on re-run (32273878248, 73/0/1). It was a cold start, not a
    // regression — and this repository has already recorded that "a 90s timeout
    // is not proof of an outage; Keycloak measured at ~127s cold".
    //
    // A check that goes red when nothing is broken teaches people to ignore it,
    // which costs more than the check is worth.
    await expect(
      page.getByLabel('Global actions').getByRole('link', { name: 'Sign in' }),
    ).toBeVisible({ timeout: 180_000 });
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A3 — "SIGN IN AS AN `insurance_owner` AND LOOK", TURNED INTO A CHECK.
 *
 * This has been the oldest open item since 2026-08-17. Migration 085 gave
 * insurance and towing an org-admin role, T1a built the screens, slice 17 built
 * the enquiry inbox, and every layer underneath is proven — by `verify/085`,
 * `verify/086`, integration specs and a green live suite. NOBODY HAD LOOKED.
 *
 * 🔴 AND THIS REPOSITORY HAS SHIPPED TWO FEATURES THAT NEVER ONCE WORKED UNDER
 * GREEN GATES. "A green build is not a working feature" is its most expensive
 * recorded lesson. A one-off manual glance would have closed the item without
 * closing the gap: a check nobody can re-run is not a gate, and the next
 * regression would be found the same way — by the owner.
 *
 * ── WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT ─────────────────
 *
 * They assert that a signed-in owner can REACH these screens and that each
 * renders its own content rather than the "not built yet" catch-all. They do
 * NOT assert that the screens contain business data: the `[AUDIT]` insurance
 * and towing organisations were created on 2026-08-16 so the owner could reach
 * those trees at all, and they hold no products, policies or enquiries.
 * Reachable is not populated, and asserting rows would fail for a reason that
 * is not a defect.
 * ══════════════════════════════════════════════════════════════════════════
 */
test.describe('the live site, signed in and acting in another organisation', () => {
  test.beforeAll(() => {
    test.skip(
      !OWNER_EMAIL || !OWNER_PASSWORD,
      'LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set — A3 did NOT run, so ' +
        'whether an insurance owner can reach their own screens is still UNPROVEN.',
    );
  });

  /**
   * The switcher is the mechanism A3 depends on, so it is asserted first and
   * its options are PRINTED. If a later check fails because a role is missing,
   * this line is what says so — rather than leaving a reader to infer it from a
   * locator timeout.
   */
  /**
   * 🔴 THIS CHECK ANSWERED A3 — AND THEN THE ANSWER TURNED OUT TO BE ABOUT THE
   * WRONG CONTROL.
   *
   * Run 32290511884: `getByLabel('Acting as role')` — ELEMENT NOT FOUND.
   * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
   * ("one role is not a choice"), so the control was absent, not broken. The
   * conclusion drawn was that the CI identity holds one role, and
   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
   * CONFIRMED it: one active membership, `workshop_owner`.
   *
   * ▶ BUT THE PRESCRIBED FIX — "give the CI identity memberships in the
   *   `[AUDIT]` organisations" — WOULD HAVE LEFT THIS CHECK SKIPPING ANYWAY,
   *   and that is the thing worth remembering:
   *
   *     viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
   *
   *   `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, on purpose.
   *   Every request carries `x-organization-id` AND `x-role-name` and
   *   `resolveTenantContext` requires ONE membership matching BOTH, so a role
   *   held in a DIFFERENT organisation is never offered here — offering it
   *   would offer a pair the API refuses. The `[AUDIT]` organisations are in
   *   the operator's tenant; the live-suite account is in its own. So the role
   *   switcher can never be the control that reaches them.
   *
   * ▶ THE CONTROL THAT CROSSES ORGANISATIONS IS THE ORGANISATION SWITCHER.
   *   `organizationsFromMemberships` does NOT filter by tenant, and
   *   `setActiveOrganizationAction` CLEARS the stored role on the way out so
   *   the API re-defaults to the strongest role held in the organisation just
   *   entered. That is why this check now drives that control instead.
   *
   * ⚠️ IT STILL SKIPS RATHER THAN FAILS WHEN THE MEMBERSHIPS ARE ABSENT. That
   * is a fixture gap, not a product defect — a red would say something is
   * broken when nothing is, and a silent skip would hide that four screens are
   * unverified. Passed, failed and SKIPPED are three states here.
   */
  test('the organisation switcher offers the partner organisations', async ({ page }) => {
    await signIn(page);

    // Asserted first and separately: the shell DID resolve a viewer. Without
    // this, "no switcher" and "no shell" would look identical, and the second
    // is a real defect.
    await expect(page.getByRole('button', { name: /Sign out/ }).first()).toBeVisible({
      timeout: 60_000,
    });

    // ⚠️ `Active organization` — the LABEL's spelling, which is American while
    // the prose here is not. Matching the prose would silently find nothing.
    const switcher = page.getByLabel('Active organization');
    const hasSwitcher = (await switcher.count()) > 0;

    test.skip(
      !hasSwitcher,
      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
        'organisation switcher is not rendered and the insurance, towing and ' +
        'fleet screens CANNOT be reached by a signed-in viewer here. Not a ' +
        'product defect and not a pass. Fix: run ' +
        'grant-live-suite-partner-memberships.yml -f confirm=APPLY.',
    );

    const orgs = await switcher.locator('option').allTextContents();
    // Printed, not just asserted — the run log is where the next reader learns
    // what this account actually holds, and the live-suite job reads its logs.
    // An annotation would land in the HTML report, which nothing in CI opens.
    // eslint-disable-next-line no-console -- the OUTPUT is this check's deliverable
    console.log(`A3: the account belongs to: ${orgs.join(', ')}`);

    expect(orgs.join(' ').toLowerCase()).toContain('insurance');
  });

  /**
   * Enter a partner workspace by switching ORGANISATION, and say whether it
   * was possible.
   *
   * 🔴 WHY ORGANISATION AND NOT ROLE. `rolesFromMemberships` filters to the
   * ACTIVE organisation, so a role held only in another organisation is never
   * in the role switcher — the earlier `actAs` could not have reached the
   * `[AUDIT]` organisations however many memberships were granted. The
   * organisation switcher is unfiltered by tenant, and
   * `setActiveOrganizationAction` deletes the stored role cookie before
   * redirecting to `/`, so the API re-resolves a role within the organisation
   * just entered. Switching organisation is
   * therefore sufficient on its own, and switching role afterwards would be
   * both unnecessary and — inside a single-role organisation, where the
   * switcher is absent — impossible.
   *
   * ⚠️ AND IT IS *A* ROLE, NOT RELIABLY THE STRONGEST ONE. This comment used to
   * say `ROLE_PRECEDENCE` picks the strongest role in the organisation just
   * entered, and `set-organization-action.ts` says so too. It is not what the
   * code does: with a requested organisation, `resolveTenantContext` takes
   * `active.find(m => m.organizationId === requestedOrganizationId)` — FIRST
   * ROW ORDER. The precedence sort is only reached in the branch where NO
   * organisation was requested. Harmless today because this account holds
   * exactly one role in each `[AUDIT]` organisation, so there is nothing to
   * choose between; the moment a second role is granted there, these tests
   * would act as an arbitrary one of them with no failure signal. Found by the
   * Supervisor.
   *
   * ⚠️ SWITCHING ALSO NAVIGATES, to `/`, which dispatches to the new role's
   * home pack. The caller's own `page.goto` follows, so this only has to wait
   * for the switch to settle rather than assert where it landed.
   *
   * 🔴 COUNT, DO NOT WAIT — kept from the fix on 2026-08-19. The first version
   * of this helper called `waitFor({ state: 'visible' })` on a control whose
   * ABSENCE is the expected case, which THROWS after 60s, so it could never
   * return `false` and the callers' skip branch was unreachable. The suite went
   * red twice for a fixture gap the checks were written to skip on. Absence
   * must be a value this returns, never an exception it raises.
   */
  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
    const switcher = page.getByLabel('Active organization');
    if ((await switcher.count()) === 0) return false;
    const options = await switcher.locator('option').all();
    for (const o of options) {
      const label = (await o.textContent()) ?? '';
      if (match.test(label)) {
        // The option's VALUE is the organisation id — the same id the server
        // action stores in its cookie.
        const organizationId = (await o.getAttribute('value')) ?? '';
        await switcher.selectOption({ label });

        // 🔴 WAIT FOR THE COOKIE, WHICH ONLY THE SERVER CAN WRITE.
        //
        // Two wrong answers preceded this one, and the second is the
        // instructive one.
        //
        // `waitForLoadState('networkidle')` alone was wrong because the page
        // may ALREADY be idle when asked, so it can resolve before the server
        // action has begun navigating (Codex).
        //
        // Asserting `toHaveValue(organizationId)` on the switcher was WORSE —
        // it looked like synchronisation and was a no-op (the Supervisor
        // falsified it). `OrganizationSwitcher` is an UNCONTROLLED `<select>`
        // (`defaultValue` + `key`), and Playwright's `selectOption` sets
        // `select.value` in the DOM immediately, client-side. So the assertion
        // was already true on its first poll and never observed the server at
        // all — and it would have passed just as happily if the server had
        // REFUSED the switch. A check that cannot fail is the exact shape this
        // file has been bitten by twice already.
        //
        // `aw.activeOrganization` is set by `setActiveOrganizationAction` in
        // its response. `selectOption` cannot fabricate it, so reading it back
        // is proof the switch is a FACT rather than a request.
        await expect
          .poll(
            async () => {
              const jar = await page.context().cookies();
              return jar.find((c) => c.name === 'aw.activeOrganization')?.value ?? '';
            },
            { timeout: 120_000 },
          )
          .toBe(organizationId);

        // Then let the redirect to `/` and its dispatch to the new pack settle.
        await page.waitForLoadState('networkidle', { timeout: 120_000 });
        return true;
      }
    }
    return false;
  }

  test('an insurance owner reaches their own users screen', async ({ page }) => {
    await signIn(page);
    const switched = await actInOrganization(page, /^\[AUDIT\].*insurance/i);
    // Same fixture gap as the switcher check above — skipped loudly, never
    // silently, because "unverified" and "verified" must not look alike.
    test.skip(
      !switched,
      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
        '/insurance/settings/users is UNVERIFIED by a signed-in viewer.',
    );

    await page.goto(`${APEX}/insurance/settings/users`, { timeout: 120_000 });

    // 🔴 THE CATCH-ALL IS THE FAILURE MODE. An unbuilt route falls through to
    // `[...slug]/page.tsx`, which renders a "not built yet" panel WITH A 200.
    // Asserting the status code would pass over exactly the thing A3 exists to
    // catch, so this asserts the screen's own heading and the absence of the
    // placeholder.
    await expect(page.getByRole('heading', { name: /Users/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);
  });

  test('an insurance owner reaches My Products, with the enquiry inbox on it', async ({
    page,
  }) => {
    await signIn(page);
    const switched = await actInOrganization(page, /^\[AUDIT\].*insurance/i);
    test.skip(
      !switched,
      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
        'the enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
    );

    await page.goto(`${APEX}/insurance/sales/my-products`, { timeout: 120_000 });

    await expect(page.getByRole('heading', { name: /My Products/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    // Slice 17's read half. Without this section the public enquiry form is a
    // control that discards what a person types into it.
    await expect(page.getByRole('heading', { name: /Enquiries/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);
  });

  /**
   * Slice 20, seen the same way. Conditional on the role existing, and it says
   * so out loud when it is absent — a skip that looks like a pass is the thing
   * this suite exists to prevent.
   */
  test('a fleet administrator reaches the fleet screens built in slice 20', async ({ page }) => {
    await signIn(page);
    const switched = await actInOrganization(page, /^\[AUDIT\].*fleet/i);
    test.skip(
      !switched,
      'this account belongs to no fleet organisation, so slice 20 is UNSEEN by a ' +
        'signed-in viewer. Not a pass — the screens are proven only by build and ' +
        'unit tests.',
    );

    await page.goto(`${APEX}/fleet/fleet-assets/vehicles`, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: /Vehicles/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);

    await page.goto(`${APEX}/fleet/service-management/service-requests`, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: /Service Requests/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);
  });

  /**
   * 🔴 THE THIRD GRANT, EXERCISED. `grant-live-suite-partner-memberships.yml`
   * writes THREE memberships — insurance, fleet AND towing — and until this
   * existed only two of them were ever used. Codex found the gap: a production
   * fixture mutation with nothing asserting against it means towing can regress
   * while A3 stays green and claims all three partner areas are verified.
   *
   * Either the grant is exercised or it should not be made. It is exercised.
   *
   * `/towing/operations/settings` is the route A3 named from the start (task
   * list A3-old), and it is the towing half of what migration 085 unblocked:
   * before 085 a towing company had one member and no way to appoint a second.
   * The People section is what that migration bought, so it is asserted
   * alongside the page's own heading rather than instead of it.
   */
  test('a towing owner reaches their own settings screen, with the People section', async ({
    page,
  }) => {
    await signIn(page);
    const switched = await actInOrganization(page, /^\[AUDIT\].*towing/i);
    test.skip(
      !switched,
      'A3 UNANSWERED: this CI identity belongs to no towing organisation, so ' +
        '/towing/operations/settings is UNVERIFIED by a signed-in viewer.',
    );

    await page.goto(`${APEX}/towing/operations/settings`, { timeout: 120_000 });

    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    // The 085 half. Without it this route is the rates screen it has always
    // been, and the org-admin work it was extended for is unproven.
    await expect(page.getByRole('heading', { name: /People/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/not built yet/i)).toHaveCount(0);
  });
});
