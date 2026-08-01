/**
 * The LIVE site, through a real browser — https://autoworkshop.aiappinvent.com
 *
 * ⚠️ READ-ONLY, AND DELIBERATELY SO. This drives production. It never signs in,
 * never submits a form and never writes anything; every check is a navigation
 * or a measurement. Nothing here can change what a visitor sees.
 *
 * WHAT IT IS FOR. The deploy is green and the site answers 200, and neither of
 * those says what a visitor actually gets. This measures that: what renders,
 * what the sign-in button really does, whether the shell is usable on a phone,
 * and whether the browser console is clean.
 */
import { chromium } from '@playwright/test';

const SITE = process.env['LIVE_URL'] ?? 'https://autoworkshop.aiappinvent.com';

let failures = 0;
let checks = 0;
const notes = [];
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}
function note(label, value) {
  notes.push(`${label}: ${value}`);
  console.log(`  INFO  ${label} — ${value}`);
}

const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // ═══ 1. does it serve at all ═════════════════════════════════════════════
  console.log(`\n1. ${SITE}`);
  const res = await page.goto(SITE, { waitUntil: 'load', timeout: 90000 });
  check('the site responds', (res?.status() ?? 0) < 400, `status=${res?.status()}`);
  note('landing URL', page.url());

  const body = (await page.locator('body').textContent()) ?? '';
  check(
    'the page renders — no server-side exception',
    !/server-side exception|internal server error/i.test(body),
    body.slice(0, 200).replace(/\s+/g, ' '),
  );
  note('page title', await page.title());

  // ═══ 2. what a visitor is actually shown ═════════════════════════════════
  console.log('\n2. what a signed-out visitor gets');
  const navCount = await page.locator('nav').count();
  check('the application shell renders', navCount > 0, `nav landmarks=${navCount}`);

  const signIn = page.getByRole('link', { name: 'Sign in' });
  const signInCount = await signIn.count();
  check('a Sign in control is offered', signInCount > 0, `count=${signInCount}`);

  // The navigation a signed-out viewer sees. Empty is CORRECT for gated trees;
  // recorded either way because it is what the owner will notice first.
  let longestNav = '';
  for (let i = 0; i < navCount; i += 1) {
    const t = ((await page.locator('nav').nth(i).textContent()) ?? '').replace(/\s+/g, ' ').trim();
    if (t.length > longestNav.length) longestNav = t;
  }
  note('largest nav block', longestNav.length ? `${longestNav.length} chars` : 'EMPTY');

  // ═══ 3. the sign-in path — the thing the owner wants to use ══════════════
  console.log('\n3. sign-in');
  if (signInCount > 0) {
    await signIn.first().click();
    await page.waitForTimeout(5000);
    note('after clicking Sign in', page.url());
    const providerBody = (await page.locator('body').textContent()) ?? '';
    const offersKeycloak = /Keycloak/i.test(providerBody);
    note('provider page offers Keycloak', String(offersKeycloak));

    if (offersKeycloak) {
      // ⚠️ THE BUTTON IS PRESSED BUT NO CREDENTIALS ARE ENTERED. Pressing it
      // only asks the app to redirect to its identity provider — that is a
      // read, and it is the single most useful measurement here: it shows
      // whether an identity provider exists at all.
      await page.getByRole('button', { name: /Keycloak/i }).first().click({ noWaitAfter: true });
      await page.waitForTimeout(9000);
      const url = page.url();
      note('where Sign in leads', url);
      const after = (await page.locator('body').textContent()) ?? '';
      const reachedIdp = /openid-connect|realms\//i.test(url);
      const errored = /error|unable|configuration/i.test(after) && !reachedIdp;
      check(
        'sign-in reaches an identity provider',
        reachedIdp,
        errored
          ? `it did not — the page reports an error instead: ${after.slice(0, 160).replace(/\s+/g, ' ')}`
          : `landed on ${url}`,
      );
    } else {
      check('sign-in reaches an identity provider', false, 'no Keycloak option was offered');
    }
  }

  // ═══ 4. a route that should not exist ════════════════════════════════════
  console.log('\n4. error handling');
  const missing = await page.goto(`${SITE}/definitely-not-a-page`, { waitUntil: 'load', timeout: 60000 });
  check('an unknown route 404s rather than 500ing', missing?.status() === 404, `status=${missing?.status()}`);

  // ═══ 5. phone and tablet ═════════════════════════════════════════════════
  //
  // T-0044 is a KNOWN, RECORDED defect: the document scrolls sideways at a
  // 768px viewport on every page, while 1280 and 390 are clean. Measured here
  // against production rather than assumed still-present.
  console.log('\n5. responsive (T-0044 is a known defect at 768px)');
  for (const [label, width] of [['phone', 390], ['tablet', 768], ['desktop', 1280]]) {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width, height: 900 });
    await p2.goto(SITE, { waitUntil: 'load', timeout: 90000 });
    await p2.waitForTimeout(1200);
    const overflow = await p2.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    note(`${label} (${width}px) horizontal overflow`, `${overflow}px`);
    if (width !== 768) {
      check(`${label} does not scroll sideways`, overflow <= 1, `${overflow}px of overflow`);
    }
    await p2.close();
  }

  // ═══ 6. console ══════════════════════════════════════════════════════════
  console.log('\n6. browser console');
  const realErrors = errors.filter((e) => !/Failed to load resource.*40[34]/i.test(e));
  check('no uncaught errors in the browser', realErrors.length === 0, realErrors.slice(0, 5).join('\n        '));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (notes.length) {
  console.log('\nMeasured:');
  for (const n of notes) console.log(`  · ${n}`);
}
process.exit(failures === 0 ? 0 : 1);
