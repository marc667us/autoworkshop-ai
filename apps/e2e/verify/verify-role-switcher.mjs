/**
 * The role switcher, THROUGH THE SCREEN — rollout to all seven apps, 2026-08-01.
 *
 * ⚠️ WHY THIS EXISTS AT ALL, AND IT IS NOT A FORMALITY. On 2026-07-31 typecheck,
 * lint, `next build` and 578 unit tests were ALL green while every page in the
 * app returned "a server-side exception occurred" — `roleLabel` was exported
 * from a `'use client'` module and called from a server layout, and React
 * enforces that boundary at RUNTIME ONLY. This change touches exactly that
 * seam again: a new SERVER component (`ViewerSwitchers`) that renders two
 * CLIENT components and hands them server actions, mounted in all seven apps.
 * The only thing that can catch a repeat is requesting a page.
 *
 * So the FIRST assertion below is simply "the page rendered without a server
 * exception", and it is the most valuable one here.
 *
 * ── WHAT ELSE IT MEASURES ──────────────────────────────────────────────────
 *
 *  1. The control RENDERS, with one option per role the viewer holds.
 *  2. The DEFAULT is the strongest role held (`ROLE_PRECEDENCE`) — the fix for
 *     a sort that keyed on organisation alone and let the owner resolve as the
 *     weaker of their own roles.
 *  3. Choosing a role CHANGES WHAT THE APP IS. A switcher that stores a cookie
 *     and leaves the navigation alone would pass every check that only looks at
 *     the control itself, so this compares the NAV before and after and fails
 *     if it is identical.
 *  4. The scoping rule Codex found: a role held only in ANOTHER organisation is
 *     never offered, because every request sends organisation AND role together
 *     and the API refuses a pair with no membership behind it.
 *  5. A viewer holding ONE role sees no switcher — a control that cannot change
 *     anything is worse than no control.
 *
 * Runs against workshop-web AND supplier-web, because the whole point of the
 * change is that six apps that never had this control now do. Proving it on
 * workshop-web alone would prove the thing that already worked.
 *
 *   node verify/verify-role-switcher.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const SUPPLIER = 'http://localhost:3002';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

const browser = await chromium.launch();
const errors = [];

async function signIn(base, user, landing = '/home/dashboard') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));

  await page.goto(`${base}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();

  // ⚠️ `waitFor`, NOT `if (await count())`. This is the repo's own documented
  // trap and it cost the first run of this script: `count()` does NOT auto-wait,
  // so on the provider page it returned 0 before the page had loaded, the
  // Keycloak button was never clicked, and the run continued as an ANONYMOUS
  // visitor. Every switcher assertion then failed — reporting a product defect
  // that did not exist. A harness that measures nothing must not look like a
  // finding.
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });

  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  // `noWaitAfter` on both: the hand-off redirect chain times out Playwright's
  // default post-click wait. `waitForURL` is the real signal.
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  return { ctx, page };
}

/**
 * The harness guard: prove the session is REAL before asserting anything.
 *
 * A signed-out viewer resolves to `null`, `ViewerSwitchers` correctly renders
 * nothing, and every check below fails — as a product defect. This turns that
 * into what it is: a broken measurement.
 */
async function assertSignedIn(page, who) {
  const html = await page.content();
  check(
    `${who}: the session is real — the shell offers Sign out, not Sign in`,
    html.includes('Sign out') && !html.includes('Not signed in'),
    'NOT SIGNED IN — every switcher assertion below would fail for the wrong reason',
  );
}

/**
 * The side navigation as text — the CONTROL for "switching changed something".
 *
 * Read from the nav landmark rather than the whole body: the body also contains
 * the switcher's own option list, so a body-level comparison would differ
 * merely because the `<select>` value changed and would report success for a
 * switcher that changed nothing else.
 *
 * ⚠️ THE **LONGEST** NAV, NOT `.first()`. Measured: the shell renders THREE nav
 * landmarks — a 46-character top bar, the 219-character role tree, and a
 * 23-character breadcrumb. `.first()` returned the top bar, which is identical
 * for every role by design, so the comparison below would have reported "the
 * switcher is inert" for a working switcher, and can never report the reverse.
 * A control that cannot distinguish the thing it is controlling is not a
 * control.
 */
async function navText(page) {
  const navs = page.locator('nav');
  const n = await navs.count();
  let longest = '';
  for (let i = 0; i < n; i += 1) {
    const t = ((await navs.nth(i).textContent()) ?? '').replace(/\s+/g, ' ').trim();
    if (t.length > longest.length) longest = t;
  }
  return longest;
}

/** Did the page render, or is this the error boundary / a 500? */
async function rendered(page) {
  const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  return !body.includes('server-side exception') && !body.includes('internal server error');
}

try {
  // ═══ 1. workshop-web — the owner, who now holds three roles ══════════════
  console.log('\n1. workshop-web :3001 — owner@ (platform_administrator + workshop_owner + technician)');
  const owner = await signIn(WORKSHOP, 'owner@autoworkshop.local');
  await owner.page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });

  await assertSignedIn(owner.page, 'owner@');
  check('the page renders — no server-side exception', await rendered(owner.page));

  const sw = owner.page.locator('#aw-role-switcher');
  check('the role switcher is present', (await sw.count()) === 1, `count=${await sw.count()}`);

  const options = await sw.locator('option').allTextContents();
  check(
    'it offers one option per role held (3)',
    options.length === 3,
    `got ${options.length}: ${JSON.stringify(options)}`,
  );

  const selected = await sw.inputValue();
  check(
    'the DEFAULT is the strongest role held, not database row order',
    selected === 'platform_administrator',
    `selected=${selected} (expected platform_administrator)`,
  );

  // ── the control: capture the nav BEFORE switching ──────────────────────
  const navBefore = await navText(owner.page);
  check('the navigation is non-empty before switching', navBefore.length > 0, `len=${navBefore.length}`);

  await sw.selectOption('technician');
  await owner.page.waitForLoadState('networkidle');
  await owner.page.waitForTimeout(1500);

  check('the page still renders after switching', await rendered(owner.page));

  const nowSelected = await owner.page.locator('#aw-role-switcher').inputValue();
  check(
    'the selection STUCK — it survived the reload it triggers',
    nowSelected === 'technician',
    `selected=${nowSelected}`,
  );

  const navAfter = await navText(owner.page);
  // ⚠️ THE ASSERTION THAT MAKES THE REST MEAN ANYTHING. Storing a cookie is
  // easy; changing what the application IS is the feature. If these match, the
  // switcher is inert and every check above passed vacuously.
  check(
    'switching role CHANGED THE NAVIGATION — the switcher is not inert',
    navAfter !== navBefore,
    `nav identical (${navAfter.length} chars) — administrator and technician saw the same tree`,
  );

  // Switch back, so the run leaves no stored preference behind for the owner.
  await owner.page.locator('#aw-role-switcher').selectOption('platform_administrator');
  await owner.page.waitForLoadState('networkidle');

  // ═══ 2. supplier-web — an app that NEVER had this control ════════════════
  //
  // The rollout's actual claim. workshop-web already worked on 2026-07-31.
  console.log('\n2. supplier-web :3002 — the same account, in an app that never had a switcher');
  const supplier = await signIn(SUPPLIER, 'owner@autoworkshop.local', '/orders-and-delivery/new-orders');
  await supplier.page.goto(`${SUPPLIER}/orders-and-delivery/new-orders`, { waitUntil: 'load' });

  await assertSignedIn(supplier.page, 'owner@ on supplier-web');
  check('the page renders — no server-side exception', await rendered(supplier.page));
  const sw2 = supplier.page.locator('#aw-role-switcher');
  check('the role switcher is present in supplier-web', (await sw2.count()) === 1, `count=${await sw2.count()}`);

  // ═══ 3. reception@ — TWO organisations, ONE role in each ═════════════════
  //
  // The scoping rule, measured. `reception_staff` is held in Alpha Motors AND
  // Alpha Parts Supply. The ORGANISATION switcher must appear (two choices);
  // the ROLE switcher must NOT (one role in whichever organisation is active).
  //
  // Before the fix the role list deduplicated across ALL memberships, so this
  // identity is also the one that would have been offered a cross-organisation
  // role had it held a second one.
  console.log('\n3. workshop-web :3001 — reception@ (one role, TWO organisations)');
  const reception = await signIn(WORKSHOP, 'reception@autoworkshop.local');
  await reception.page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });

  await assertSignedIn(reception.page, 'reception@');
  check('the page renders — no server-side exception', await rendered(reception.page));
  check(
    'the ORGANISATION switcher renders — two organisations is a real choice',
    (await reception.page.locator('#aw-org-switcher').count()) === 1,
  );
  check(
    'the ROLE switcher renders NOTHING — one role in the active organisation',
    (await reception.page.locator('#aw-role-switcher').count()) === 0,
    'a select that cannot change anything invites interaction with an inert control',
  );

  // ═══ 4. console/runtime errors anywhere in the run ═══════════════════════
  console.log('\n4. runtime errors');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 8).join('\n        '));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
