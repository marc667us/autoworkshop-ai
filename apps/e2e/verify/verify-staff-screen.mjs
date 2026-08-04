/**
 * ADDING A COLLEAGUE, THROUGH THE BROWSER, AS THE OWNER.
 *
 * ── WHAT THIS PROVES THAT NO UNIT TEST CAN ─────────────────────────────────
 *
 * `MembershipService.grant()` has been complete since Phase 2 and had NO
 * REACHABLE CALLER: it took a `userId`, and the only source of one is
 * `GET /users`, which is driven FROM memberships and so lists people who are
 * already members. Every unit test passed the uuid in directly, which is
 * exactly why none of them noticed. A workshop owner could not hire anybody.
 *
 * So this drives the real screen: type an email, pick a role, submit, and then
 * READ THE PERSON BACK OUT OF THE LIST. Anything less would be satisfied by a
 * form that posts into the void — a shape this repo has shipped.
 *
 * ⚠️ IT ASSERTS THE REFUSAL TOO. An address with no account must produce the
 * sentence that names the way forward ("sign up first"), because a refusal with
 * no reachable next step is the most expensive defect class recorded here.
 *
 *   node verify/verify-staff-screen.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in. Idempotent: it adds a colleague
 * only if they are not already there, and removes nobody.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const OWNER = process.env['DEV_OWNER_EMAIL'] ?? 'owner@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
/** A real seeded account that is NOT expected to be a member already. */
const COLLEAGUE = process.env['DEV_COLLEAGUE_EMAIL'] ?? 'supervisor@autoworkshop.local';

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

const PLACEHOLDER = /scheduled for a later phase/i;
const ROUTE = '/workshop-management/staff';

const browser = await chromium.launch();
const consoleErrors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource.*40[134]/i.test(m.text())) return;
  consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

console.log(`\nSTAFF SCREEN — ${WORKSHOP}${ROUTE}, as ${OWNER}\n`);

await page.goto(`${WORKSHOP}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
await provider.waitFor({ state: 'visible', timeout: 30000 });
await provider.click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
await page.fill('#username', OWNER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });

const shell = await page.content();
check(
  'MEASUREMENT VALID: signed in',
  !/Not signed in/i.test(shell) && /Sign out/i.test(shell),
  'every FAIL below would be a refusal, not a defect',
);
if (/Not signed in/i.test(shell) || !/Sign out/i.test(shell)) {
  await browser.close();
  process.exit(1);
}

// ⚠️ `owner@` defaults to platform_administrator by ROLE_PRECEDENCE and lands
// on the DEFAULT tree; §46's Workshop Management group belongs to the OWNER
// tree. Driving this route as the wrong role produces a CORRECT 404 that reads
// as a missing page — the 1-of-14 mistake, exactly.
const switcher = page.locator('#aw-role-switcher');
if ((await switcher.count()) > 0) {
  await switcher.selectOption('workshop_owner').catch(() => {});
  await page.waitForTimeout(3000);
  await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
  const active = await page.locator('#aw-role-switcher').inputValue().catch(() => '');
  check('MEASUREMENT VALID: acting as workshop_owner', active === 'workshop_owner', `active: ${active}`);
  if (active !== 'workshop_owner') {
    console.log('\nABORTING — §46 routes measured as another role prove nothing.\n');
    await browser.close();
    process.exit(1);
  }
}

// ── the screen exists at all ───────────────────────────────────────────────
const response = await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
const html = await page.content();
const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];
check('the staff screen responds', response?.status() === 200, `HTTP ${response?.status()}`);
check('it is a real screen, not the placeholder', !PLACEHOLDER.test(main));
check('it offers a way to add somebody', /Add a colleague/i.test(main));
check(
  'the add form has a SUBMIT control',
  /<button[^>]*type="submit"/i.test(main),
  'a form with no submit button shipped here once before',
);

// ── 🔴 THE REFUSAL NAMES A WAY FORWARD ─────────────────────────────────────
// Checked BEFORE the happy path, because it needs no state and because a
// refusal that dead-ends is the failure this repo pays for most.
// ⚠️ A NORMAL-LOOKING ADDRESS. `example.invalid` was used first and never
// reached the API at all: `FormShell` re-implements the email check that
// `noValidate` turned off, and it rejected the `.invalid` TLD client-side. The
// run then reported the PRODUCT as having no reachable next step when the
// product was fine and the test address was wrong.
await page.fill('#userEmail', 'nobody-here-xyz@example.com');
await page.selectOption('#roleName', 'technician');
await page.getByRole('button', { name: /Add to this workshop/i }).click({ noWaitAfter: true });
// 🔴 WAIT FOR SOMETHING THAT IS NOT ALREADY ON THE PAGE.
// The first version waited for /sign up/ — which appears in the form's own
// static helper text ("Ask them to sign up, then add them here"). The condition
// was TRUE before the button was even clicked, so this "wait" returned
// instantly and the assertion below read the page before the response arrived.
// A waitFor on an already-true condition is not a wait; 7 of 11 "defects" one
// day in this repo were harness faults of exactly this kind.
await page
  .waitForFunction(
    () => /No account with that email|not accepted|did not respond|Added\./i.test(document.body.innerText),
    { timeout: 30000 },
  )
  .catch(() => {});
const refused = await page.content();
check(
  'an unknown address is refused with a REACHABLE next step',
  /sign up first/i.test(refused),
  'the refusal names no way forward — that is a wall, not a rule',
);

// ── the happy path, and the read-back ──────────────────────────────────────
await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
const before = await page.content();
const alreadyThere = before.includes(COLLEAGUE);

if (alreadyThere) {
  console.log(`  note  ${COLLEAGUE} is already a member — the add path is skipped this run`);
  check('the existing colleague is listed with a role', /aw-status|Technician|Supervisor|Manager/i.test(before));
} else {
  await page.fill('#userEmail', COLLEAGUE);
  await page.selectOption('#roleName', 'technician');
  await page.getByRole('button', { name: /Add to this workshop/i }).click({ noWaitAfter: true });
  await page
    .waitForFunction(() => /Added\.|not accepted|did not respond|sign up/i.test(document.body.innerText), {
      timeout: 30000,
    })
    .catch(() => {});
  const after = await page.content();
  check(
    'adding a colleague is accepted',
    /Added\./i.test(after),
    (/<p[^>]*>([^<]*(not accepted|did not respond|sign up|may not)[^<]*)<\/p>/i.exec(after) ?? [
      ,
      'no confirmation and no error — the submit went nowhere',
    ])[1],
  );

  // 🔴 READ BACK FROM A FRESH LOAD, not from the page that wrote it. A page
  // echoing its own success message proves the browser ran, not that anything
  // was stored.
  await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
  const reread = await page.content();
  check(
    'and they now appear in the staff list',
    reread.includes(COLLEAGUE),
    'the grant reported success and the person is not listed',
  );
}

check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
