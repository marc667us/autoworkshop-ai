/**
 * REMOVE A COLLEAGUE, THEN RE-HIRE THEM — the round trip, in a browser.
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * `verify-staff-screen.mjs` proves the screen exists and that adding works. It
 * cannot prove THIS, because every seeded account is already a member — so its
 * add path is skipped on a normal dev database and the interesting case never
 * runs. This file makes its own gap: it removes somebody first.
 *
 * ── THE DEFECT IT EXISTS FOR ───────────────────────────────────────────────
 *
 * A membership is never deleted. Withdrawal sets `status = 'revoked'` and keeps
 * the row so "was this person ever granted access?" stays answerable — which is
 * right, and which means the revoked row still occupies the unique key
 * `(organization_id, user_id, role_name)`. `grant` used `ON CONFLICT DO
 * NOTHING`, so re-hiring somebody was refused with **"membership already
 * exists"** — a sentence that is the opposite of the truth, shown to an owner
 * looking at a colleague who demonstrably has no access, with nothing anywhere
 * to undo it. A rule whose escape hatch is unreachable is a wall.
 *
 * A unit test cannot catch this honestly: the fake decides what ON CONFLICT
 * returns, so it tests the belief rather than the constraint. Only a real
 * unique index does.
 *
 *   node verify/verify-staff-rehire.mjs
 *
 * DEV ONLY. Idempotent: it ends with the colleague ACTIVE again, which is where
 * it found them.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const OWNER = process.env['DEV_OWNER_EMAIL'] ?? 'owner@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
/**
 * ⚠️ ITS OWN ENV VAR. This script needs somebody who IS currently a member;
 * `verify-staff-screen.mjs` wants one who is NOT. Sharing `DEV_COLLEAGUE_EMAIL`
 * meant one of the two was always measuring the wrong precondition.
 */
const COLLEAGUE = process.env['DEV_REHIRE_COLLEAGUE'] ?? 'supervisor@autoworkshop.local';
/** Must match the role they hold, or the unique key is not the one under test. */
const ROLE = process.env['DEV_REHIRE_ROLE'] ?? 'workshop_supervisor';

const ROUTE = '/workshop-management/staff';
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
// The remove button confirms; accept it automatically.
page.on('dialog', (d) => d.accept());

console.log(`\nREMOVE THEN RE-HIRE — ${COLLEAGUE}, as ${OWNER}\n`);

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

const switcher = page.locator('#aw-role-switcher');
if ((await switcher.count()) > 0) {
  await switcher.selectOption('workshop_owner').catch(() => {});
  await page.waitForTimeout(3000);
}

await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
const before = await page.content();
check(
  'MEASUREMENT VALID: the colleague is listed to begin with',
  before.includes(COLLEAGUE),
  `${COLLEAGUE} is not a member, so there is nothing to remove and re-hire`,
);
if (!before.includes(COLLEAGUE)) {
  console.log('\nABORTING — the round trip needs somebody who is currently a member.\n');
  await browser.close();
  process.exit(1);
}

// ── 1. remove ──────────────────────────────────────────────────────────────
// The row for this colleague, and its own Remove button — never the first one
// on the page, which belongs to whoever happens to sort first.
const row = page.locator('li').filter({ hasText: COLLEAGUE }).first();
await row.getByRole('button', { name: /^Remove$/ }).click({ noWaitAfter: true });
await page
  .waitForFunction(() => /Removed\.|not accepted|did not respond|may not/i.test(document.body.innerText), {
    timeout: 30000,
  })
  .catch(() => {});

await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
const removed = await page.content();
check(
  'removing them takes them off the list',
  !removed.includes(COLLEAGUE),
  'they are still listed after a remove that reported success',
);

// ── 2. 🔴 re-hire — the path that used to dead-end ─────────────────────────
await page.fill('#userEmail', COLLEAGUE);
await page.selectOption('#roleName', ROLE);
await page.getByRole('button', { name: /Add to this workshop/i }).click({ noWaitAfter: true });
await page
  .waitForFunction(
    () => /Added\.|already exists|No account with that email|did not respond/i.test(document.body.innerText),
    { timeout: 30000 },
  )
  .catch(() => {});
const rehired = await page.content();
check(
  '🔴 re-hiring a removed colleague is ACCEPTED, not refused as "already exists"',
  /Added\./i.test(rehired),
  /already exists/i.test(rehired)
    ? 'refused with "membership already exists" — the revoked row still holds the unique key'
    : 'no confirmation and no recognisable error',
);

// Read back from a fresh load: the page echoing its own success proves nothing.
await page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
const finalState = await page.content();
check(
  'and they are back on the list afterwards',
  finalState.includes(COLLEAGUE),
  'the re-hire reported success and they are not listed',
);

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
