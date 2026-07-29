/**
 * Record an inspection THROUGH THE SCREEN — Phase 5, slice 3a.
 *
 * The API probe (`packages/auth/verify/probe-inspection.mjs`) proves the
 * endpoints. It proves nothing about the form: a `<select>` whose `name` does not
 * match what the server action reads, or an action that never reaches the API,
 * passes typecheck, lint, the unit suite AND the API probe while the technician
 * presses Save and nothing happens.
 *
 * Slice 2's own note: "Codex reviews a diff; it will not see what the page DOES.
 * Both front-end defects passed every gate and were found by measuring the
 * rendered page." This is that measurement for the write path.
 *
 *   node verify/record-inspection-in-browser.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const QUEUE = '/record-work/inspection-results';
const USER = 'technician@autoworkshop.local';
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Surface anything the page logs. A server-action failure often shows up here
// first, and a silent console is part of the result.
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

// Sign in on a LANDING page, never on the page under test.
await page.goto(`${BASE}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
if (await provider.count()) await provider.first().click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
await page.fill('#username', USER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });

console.log('1. reach an editable sheet by following the real link');
await page.goto(`${BASE}${QUEUE}`, { waitUntil: 'load' });
const link = page.locator(`a[href*="${QUEUE}/"]`).first();
check('the queue offers a link into a sheet', (await link.count()) > 0);
const label = (await link.textContent()) ?? '';
check(
  'the link names the job rather than saying only "View"',
  /JC-\d+/.test(label),
  label.trim(),
);
await link.click();
await page.waitForURL(new RegExp(`${QUEUE}/`), { timeout: 30000 });

/**
 * Wait for the sheet to actually be on screen before COUNTING anything.
 *
 * ⚠️ `locator.count()` does NOT auto-wait — it answers about the DOM as it is
 * this instant. `selectOption` and `click` do auto-wait, which is why an earlier
 * version of this script reported "0 result controls" and then successfully
 * filled them in three steps later: the counts were measured before the page had
 * rendered, and the interactions waited. A harness that reports a defect that is
 * not there is as bad as one that misses one.
 */
async function sheetReady() {
  await page
    .locator('select[name^="result:"]')
    .first()
    .waitFor({ state: 'attached', timeout: 30000 })
    .catch(() => undefined);
}

await sheetReady();
const editable = (await page.getByRole('button', { name: 'Save progress' }).count()) > 0;
if (!editable) {
  console.log('  ....  that sheet is submitted (read-only). Starting a new attempt.');
  await page.goto(`${BASE}${QUEUE}`, { waitUntil: 'load' });
  // A REGEX, because the queue offers "Start inspection" for a card with no sheet
  // and "Start a new inspection" once an attempt has been submitted — the
  // second-attempt path Codex found missing. An exact-string matcher would find
  // neither in the case this branch exists to handle.
  const start = page.getByRole('button', { name: /Start (a new )?inspection/ }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(2500);
  }
  await page.goto(`${BASE}${QUEUE}`, { waitUntil: 'load' });
  await page.locator(`a[href*="${QUEUE}/"]`).first().click();
  await page.waitForURL(new RegExp(`${QUEUE}/`), { timeout: 30000 });
  await sheetReady();
}
check('an editable sheet is open', (await page.getByRole('button', { name: 'Save progress' }).count()) > 0);

const sheetUrl = page.url();

console.log('\n2. the checklist is on screen, with a control per checkpoint');
const selects = page.locator('select[name^="result:"]');
check('19 result controls', (await selects.count()) === 19, String(await selects.count()));
const brakes = page.locator('select[name="result:brakes"]');
check('the brakes checkpoint is addressable by its code', (await brakes.count()) === 1);
check(
  'every option §2968 names is offered',
  (await brakes.locator('option').allTextContents()).join('|') ===
    'Not answered|Pass|Fail|Requires testing|Not applicable',
  (await brakes.locator('option').allTextContents()).join('|'),
);

console.log('\n3. RECORD through the form and confirm the server accepted it');
await brakes.selectOption('fail');
await page.fill('input[name="note:brakes"]', 'Recorded through the screen, not the API.');
await page.locator('select[name="result:tyres"]').selectOption('requires_testing');
await page.fill('textarea[name="summary"]', 'Browser-driven save.');
await page.getByRole('button', { name: 'Save progress' }).click();

// The action revalidates and the component refreshes; wait for the status line
// rather than a fixed sleep.
const status = page.locator('[role="status"]', { hasText: /Saved/ });
await status.first().waitFor({ timeout: 30000 }).catch(() => undefined);
const statusText = (await status.first().textContent().catch(() => null)) ?? '';
check('the screen confirms a save', /Saved/.test(statusText), statusText || '(no status message)');
check(
  'and reports the answered count from the SERVER, not a local guess',
  /2 of 19 checkpoints answered/.test(statusText),
  statusText,
);

console.log('\n4. the values SURVIVE a reload — proof the server stored them');
await page.goto(sheetUrl, { waitUntil: 'load' });
await sheetReady();
check(
  'brakes is still Fail after a fresh page load',
  (await page.locator('select[name="result:brakes"]').inputValue()) === 'fail',
  await page.locator('select[name="result:brakes"]').inputValue(),
);
check(
  'the note survived',
  /through the screen/.test(await page.locator('input[name="note:brakes"]').inputValue()),
);
check(
  'the technician summary survived',
  /Browser-driven/.test(await page.locator('textarea[name="summary"]').inputValue()),
);
check(
  'the unanswered count came down to 17',
  /17 checkpoint\(s\) still unanswered/.test((await page.locator('main').innerText()) ?? ''),
);

console.log('\n5. submitting an INCOMPLETE sheet is refused ON SCREEN, with the reason');
const submit = page.getByRole('button', { name: 'Submit inspection' });
await submit.waitFor({ state: 'visible', timeout: 30000 });
await submit.click();
// ⚠️ SCOPED TO `main` AND FILTERED BY TEXT. An unscoped `[role="alert"]` also
// matches the SHELL'S OWN empty live region, so `.first()` returns an element
// whose text is '' and the check fails while the real refusal is on screen a few
// nodes away. That is the trap already recorded for `[role="status"]`, and this
// script tripped the `alert` half of it before this line was written.
const alert = page.locator('main [role="alert"]', { hasText: /unanswered|not accepted|session/ });
// `waitFor` the element, then read it — the action is a round trip to the API and
// back, so the alert does not exist at the moment the click returns.
await alert.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
const alertText = (await alert.first().textContent().catch(() => null)) ?? '';
check(
  'the refusal is announced in an alert region',
  /unanswered/.test(alertText),
  alertText || '(no alert)',
);
check(
  'and it NAMES the checkpoints rather than saying "incomplete"',
  /Engine condition/.test(alertText),
  alertText.slice(0, 160),
);

console.log('\n6. nothing logged an error');
check('console is clean', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(
  `\n${failures === 0 ? 'BROWSER OK' : `BROWSER FAILED — ${failures} of ${checks}`}` +
    ` — ${checks - failures}/${checks} passed`,
);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
