/**
 * THE VIN FUNNEL, END TO END — public search, the gate, sign-up, full result.
 *
 * Owner request 2026-08-03: "public can search vehicle information by entering
 * their [VIN] in the public landing page, the results page must have [a] button
 * or link for them to see more of the results, when the user clicks on this
 * link or button they are made to sign up and go back and log in via kc before
 * seeing all the results and from there they can see the app features for
 * registered customers".
 *
 * ── THE ASSERTION THAT MATTERS ─────────────────────────────────────────────
 *
 * That the gated fields are NOT IN THE PUBLIC PAYLOAD. A page that receives the
 * full decode and renders half of it is a lock with the key taped to it — the
 * data is in the HTML, the network tab, and any script that asks. So the check
 * below reads the served markup, not the rendered pixels.
 *
 * 🔴 AND IT IS SCOPED TO THE VIN SECTION, WHICH IS THE WHOLE REASON THIS
 * COMMENT EXISTS. The first version searched the WHOLE PAGE for "Accord" and
 * "Automatic" and reported both as leaks. They were not: "Accord" is an
 * `<option>` in the parts model filter and "Automatic" appears in a part's
 * fitment list — both present with NO VIN SEARCHED AT ALL. A check that reports
 * a leak in a working gate is worse than no check: the next reader either
 * disables it or, far worse, "fixes" a gate that was correct.
 *
 * The control for that is measuring the same page with no VIN at all, and only
 * counting a string that appears with a VIN and not without one.
 *
 *   node verify/verify-vin-funnel.mjs [--user <email>]
 *
 * DEV ONLY.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? undefined : args[i + 1];
};

const BASE = process.env['CUSTOMER_WEB_URL'] ?? 'http://192.168.0.124:3005';
const VIN = flag('--vin') ?? '1HGCM82633A004352';
const USER = flag('--user');
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);

try {
  // ── the control: the same page with NO VIN ────────────────────────────────
  // Everything present here is page furniture, not a VIN answer. Without this
  // baseline the leak check below cannot tell the two apart.
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 180000 });
  const baseline = await page.content();

  // ── 1. the search exists, and is free ─────────────────────────────────────
  check(
    'a signed-out visitor is offered a VIN search',
    /Check any vehicle by VIN/i.test(baseline),
    'the landing page renders no VIN search at all',
  );

  // ── 2. it answers ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/?vin=${VIN}`, { waitUntil: 'load', timeout: 180000 });
  const withVin = await page.content();
  const section = await page
    .locator('section', { has: page.locator('#vin-search') })
    .first()
    .innerText();

  check(
    'searching a real VIN names the manufacturer',
    /Honda/i.test(section),
    `VIN section read: ${JSON.stringify(section.slice(0, 240))}`,
  );
  check('and the model year', /2003/.test(section), section.slice(0, 240));
  check('and where it was built', /United States|North America/i.test(section), section.slice(0, 240));

  // ── 3. 🔴 THE GATE — the withheld fields are not in the PAYLOAD ───────────
  // Counted only when the string appears WITH a VIN and not WITHOUT one, so a
  // parts-catalogue value that happens to share a word cannot masquerade as a
  // leak. This is the check that reported two false leaks before it had a
  // baseline.
  const gated = ['J30A4', 'Coupe', 'Gasoline', '2.998', 'DisplacementL', 'EngineCylinders'];
  const leaked = gated.filter((t) => withVin.includes(t) && !baseline.includes(t));
  check(
    'the gated engine detail is NOT in the public payload',
    leaked.length === 0,
    leaked.length ? `these appeared only once a VIN was searched: ${leaked.join(', ')}` : undefined,
  );

  // ── 4. the call to action, and what it promises ──────────────────────────
  check(
    'the result offers a way to see the rest',
    /Sign up free to see it all/i.test(section),
    section.slice(0, 300),
  );
  check(
    'and NAMES what is behind the gate rather than asking for faith',
    /engine model/i.test(section) && /fuel type/i.test(section),
    'the "more available" list did not render',
  );

  // ── 5. THE ROUND TRIP: the VIN survives sign-up ──────────────────────────
  const href = await page
    .getByRole('link', { name: /sign up free/i })
    .first()
    .getAttribute('href');
  check(
    'the sign-up link carries the VIN through Keycloak and back',
    !!href && decodeURIComponent(href).includes(`/vehicle-lookup?vin=${VIN}`),
    `href was ${JSON.stringify(href)} — without the VIN, a newly-registered person lands on an empty form`,
  );

  // ── 6. an invalid VIN is an ANSWER, not an error page ───────────────────
  await page.goto(`${BASE}/?vin=1HGCM82633A004353`, { waitUntil: 'load', timeout: 180000 });
  const badSection = await page
    .locator('section', { has: page.locator('#vin-search') })
    .first()
    .innerText();
  check(
    'a mistyped VIN explains itself instead of failing',
    /check digit/i.test(badSection),
    badSection.slice(0, 240),
  );

  // ── 7. the signed-in half, when an account is supplied ──────────────────
  if (USER) {
    // ⚠️ SIGN IN FROM THE LANDING PAGE, NOT FROM /vehicle-lookup. The first
    // version started at the destination and clicked the first "Sign in" it
    // could find there; the Keycloak form never loaded and the run timed out
    // waiting for #username — reporting a product failure that was really a
    // navigation mistake in the harness. The landing page is where a real
    // visitor signs in from anyway, which is the point of the funnel.
    await page.goto(`${BASE}/?vin=${VIN}`, { waitUntil: 'load', timeout: 180000 });
    await page.getByRole('link', { name: /sign up free/i }).first().click({ noWaitAfter: true });
    const provider = page.getByRole('button', { name: /Keycloak/i });
    await provider.waitFor({ state: 'visible', timeout: 120000 });
    await provider.click({ noWaitAfter: true });
    await page.waitForURL(/openid-connect\/auth/, { timeout: 180000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login', { noWaitAfter: true });
    await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 180000 });
    await page.goto(`${BASE}/vehicle-lookup?vin=${VIN}`, { waitUntil: 'load', timeout: 180000 });

    const full = await page.locator('main').first().innerText();
    check(
      'signed in, the SAME VIN now shows the engine',
      /J30A4/i.test(full),
      `main read: ${JSON.stringify(full.slice(0, 300))}`,
    );
    check(
      'and the source of each answer is labelled',
      /From the VIN itself/i.test(full) && /vPIC|external detail/i.test(full),
      'a mechanic must know whether an engine code came from the standard or a third party',
    );
  } else {
    console.log('  SKIP  signed-in half (pass --user <email> to exercise it)');
  }
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
