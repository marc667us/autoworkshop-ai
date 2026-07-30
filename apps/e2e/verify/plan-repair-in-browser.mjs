/**
 * Build and REVIEW a repair plan THROUGH THE SCREEN — Phase 5, slice 4.
 *
 * The API probe (`packages/auth/verify/probe-repair-plan.mjs`) proves the endpoints.
 * It proves nothing about the forms: an `<input>` whose `name` does not match what the
 * server action reads, or an action that never reaches the API, passes typecheck, lint,
 * the unit suite AND the API probe while the technician presses "Add task" and nothing
 * happens.
 *
 * Slice 2's note, still true: "Codex reviews a diff; it will not see what the page
 * DOES." This is that measurement for slice 4's write paths — and there are eight of
 * them.
 *
 * ── IT DRIVES TWO IDENTITIES, WHICH IS THE POINT ───────────────────────────
 *
 * §30-§31's review is only real if the submitter cannot sign their own plan off. So
 * this signs in as the technician, plans and submits, then signs in as the SUPERVISOR
 * in a separate browser context and reviews. A single-identity run would exercise the
 * forms and skip the rule.
 *
 *   node verify/plan-repair-in-browser.mjs
 *
 * PRECONDITION: a plan must be startable — the card at `solution_preparation` with an
 * approved diagnosis carrying a confirmed fault. `probe-repair-plan.mjs` leaves exactly
 * that state behind, so run it first. If the state is absent this says so and exits 2
 * rather than reporting a product defect.
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
/** §49 — where a technician reaches this screen. */
const TECH_QUEUE = '/plan-work/repair-planning';
/**
 * Where a `workshop_supervisor` actually reaches it.
 *
 * ⚠️ THE §34 WORKSPACE DEFAULT, NOT `/repair-control/repair-plans`. Measured, not
 * assumed: `repair-control/*` belongs to the §46 owner and §47 manager trees, and a
 * supervisor requesting it gets a 404 from `requireNavRoute`. §50 names the REPAIR-PLAN
 * APPROVAL as the supervisor's, so the role the rule is written for reads the record at
 * the default route — which is precisely why this slice builds all three paths and
 * gates each one separately.
 */
const SUP_QUEUE = '/repair-services/repair-plans';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/**
 * Everything this run creates carries this marker.
 *
 * ⚠️ NOT COSMETIC. Tasks accumulate across runs, and slice 3b lost time to a harness
 * that used `filter({hasText})` + `.first()` and picked a row an earlier run had
 * already edited — then reported two product defects that did not exist.
 */
const RUN = `ui-${Date.now().toString().slice(-6)}`;

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

/** A signed-in page for one identity, in its own context so sessions cannot mix. */
async function signIn(user, queue) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));

  // Sign in on a LANDING page, never on the page under test: a 404 target renders no
  // sign-in link, so the harness would silently test an anonymous visitor.
  await page.goto(`${BASE}/home/dashboard`);
  // `.first()` — a signed-out page legitimately offers "Sign in" twice, which is a
  // Playwright strict-mode violation that reads as "the harness is broken".
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  const provider = page.getByRole('button', { name: /Keycloak/i });
  if (await provider.count()) await provider.first().click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  // `noWaitAfter` on both: the hand-off redirect chain times out Playwright's default
  // post-click wait. `waitForURL` is the real signal, and a timeout here is NOT proof
  // of a failed login.
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${BASE}${queue}`, { waitUntil: 'load' });
  return { ctx, page };
}

/**
 * Read the announcement a form made, scoped to `main` and filtered by text.
 *
 * ⚠️ AN UNSCOPED `[role="status"]`/`[role="alert"]` ALSO MATCHES THE SHELL'S OWN EMPTY
 * LIVE REGION, and `StatusBadge` renders a `role="status"` of its own — so "the first
 * non-empty live region" returns the word "In progress" rather than the announcement.
 * Two live-region traps down, both about matching too loosely. Scope to `main`, require
 * non-empty text, and match BY PATTERN.
 */
async function announcement(page, pattern) {
  const nodes = page.locator('main [role="status"], main [role="alert"]');
  await nodes.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  const n = await nodes.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const text = ((await nodes.nth(i).textContent()) ?? '').trim();
    if (text === '') continue;
    seen.push(text);
    if (pattern === undefined || pattern.test(text)) return text;
  }
  return `NONE MATCHED ${pattern} — saw: ${JSON.stringify(seen)}`;
}

// ── 1. the technician opens the queue ───────────────────────────────────────

console.log(`\nRun marker: ${RUN}\n`);
console.log('1. §49 — the technician reaches the planning queue');

const tech = await signIn('technician@autoworkshop.local', TECH_QUEUE);
check(
  'the technician tree renders the repair-planning queue',
  /Repair Planning|Repair Plans/i.test((await tech.page.locator('h1').first().textContent()) ?? ''),
  await tech.page.locator('h1').first().textContent(),
);

// ⚠️ WAIT FOR SOMETHING THAT IS FALSE UNTIL THE ACTION SUCCEEDS. Slice 3b pressed
// Start and then waited for "a link" — one was already on the row, pointing at the
// PREVIOUS attempt, so the harness opened a read-only record and blamed the product.
// The verb is the signal here: an editable plan says "Plan repair plan for …", a
// settled one says "View …".
const planLink = tech.page.getByRole('link', { name: /^Plan repair plan for/ });
// ⚠️ TWO WORDINGS, BOTH REAL. The queue says "Plan repair" when no plan exists and
// "Start a revised plan" when the current one is settled and the card is back at
// solution preparation — the second-attempt path. Matching only the first made the
// harness declare the fixture missing on a screen that was offering exactly the control
// it needed, which is a harness defect reported as a product one.
const startButton = tech.page.getByRole('button', {
  name: /^(Plan repair|Start a revised plan) for job card/,
});

if ((await planLink.count()) === 0) {
  if ((await startButton.count()) === 0) {
    console.error(
      '\nNo plan to open and no "Plan repair" button — the card is not at solution_preparation\n' +
        'with an approved diagnosis. Run packages/auth/verify/probe-repair-plan.mjs first.\n',
    );
    await browser.close();
    process.exit(2);
  }
  await startButton.first().click();
  // The row must CHANGE — from a button to an editable link. Waiting for the link is
  // waiting for something that was false a moment ago.
  await planLink.first().waitFor({ state: 'visible', timeout: 30000 });
  check('pressing "Plan repair" produced an editable plan', true);
} else {
  console.log('  note  adopting an open plan left by an earlier run');
}

await planLink.first().click();
await tech.page.waitForURL(/\/plan-work\/repair-planning\/[0-9a-f-]{36}/, { timeout: 30000 });
check('the plan record opens at its own URL', true, tech.page.url());

// ── 2. §25 — the confirmed faults are loaded and offered ────────────────────

console.log('\n2. §25 — the application loads confirmed faults');

const faultPanel = tech.page.getByRole('heading', {
  name: /Confirmed faults from the approved diagnosis/,
});
await faultPanel.waitFor({ state: 'visible', timeout: 15000 });
check('the confirmed faults are on the screen before any task is written', true);

// ⚠️ `aria-label` MEANS THE ACCESSIBLE NAME IS NOT THE VISIBLE TEXT. The visible text
// is "Add a task for this fault"; the accessible name carries the fault description.
// `getByRole({name: /^Add a task for this fault$/})` would match NOTHING — the trap
// slice 3b hit with `/^Remove$/`.
const addForFault = tech.page.getByRole('button', { name: /^Add a repair task for the fault:/ });
await addForFault.first().waitFor({ state: 'attached', timeout: 15000 });
check(
  'each confirmed fault offers its own "add a task" control',
  (await addForFault.count()) >= 1,
  String(await addForFault.count()),
);
// The accessible name names the FAULT, so a screen reader hearing a column of these
// can tell them apart (§66).
check(
  'and its accessible name names the fault, not just the action',
  /Add a repair task for the fault: .+/.test((await addForFault.first().getAttribute('aria-label')) ?? ''),
  await addForFault.first().getAttribute('aria-label'),
);

await addForFault.first().click();
const faultSelect = tech.page.locator('#task-finding');
const preselected = await faultSelect.inputValue();
check('pressing it pre-selects that fault on the add-task form', preselected !== '', preselected);

// ── 3. §27 — adding a task through the form ─────────────────────────────────

console.log('\n3. §27-§29 — adding a task, and the estimate gate');

const TASK_A = `${RUN} replace the coil`;
await tech.page.fill('#task-title', TASK_A);
await tech.page.fill('#task-skill', 'auto electrician');
// Deliberately left UNESTIMATED, so the submission gate below is exercised rather than
// assumed.
await tech.page.getByRole('button', { name: /^Add task$/ }).click();

// The row appearing is the signal, not a timeout. Scoped to this run's marker so an
// earlier run's task cannot satisfy it.
const taskRow = tech.page.locator('input[name="title"]').filter({ hasNot: tech.page.locator('x') });
await tech.page.waitForFunction(
  (title) =>
    Array.from(document.querySelectorAll('input[name="title"]')).some((i) => i.value === title),
  TASK_A,
  { timeout: 30000 },
);
check('the task the form submitted appears on the plan', true, TASK_A);
check(
  'and the screen announced it',
  /Task added/.test(await announcement(tech.page, /Task added/)),
  await announcement(tech.page, /Task added/),
);

// ── 4. §29.10 — the gate says which rule and what to do ─────────────────────

console.log('\n4. §29.10 — the submission gates are visible before they are hit');

const blocked = tech.page.getByText(/still have no labour estimate/);
await blocked.first().waitFor({ state: 'visible', timeout: 15000 });
check('an unestimated task is named on the screen, not merely refused by the API', true);

const submitButton = tech.page.getByRole('button', { name: /^Submit the repair plan for job card/ });
await submitButton.waitFor({ state: 'attached', timeout: 15000 });
check('and the submit control is disabled while it holds', await submitButton.isDisabled());

// ⚠️ EVERY EMPTY ESTIMATE, NOT JUST THE FIRST ROW. The blocker names a COUNT, so it
// only clears when the last one is filled — and this plan may carry tasks another
// harness left behind. Filling row 1 and asserting the blocker is gone is an assertion
// about a plan with exactly one task, which is not a plan this harness controls.
const hoursInputs = tech.page.locator('input[aria-label^="Estimated labour hours for task"]');
const rowCount = await hoursInputs.count();
for (let i = 0; i < rowCount; i += 1) {
  const box = hoursInputs.nth(i);
  if (((await box.inputValue()) ?? '').trim() === '') {
    await box.fill('1.25');
    // Each row is its own form, so each needs its own save. The position in the label is
    // 1-based and matches the task's `position`, which is what the row renders.
    await tech.page.getByRole('button', { name: new RegExp(`^Save task ${i + 1}$`) }).click();
    await tech.page.waitForTimeout(800);
  }
}
// Wait for the BLOCKER TO GO — false-until-success, the right shape.
await blocked.first().waitFor({ state: 'detached', timeout: 30000 }).catch(async () => {
  await tech.page.waitForTimeout(1500);
});
check(
  'saving an estimate clears the blocker',
  (await tech.page.getByText(/still have no labour estimate/).count()) === 0,
);
check('and the submit control becomes usable', !(await submitButton.isDisabled()));

// ── 5. §29 — a part, through the form ───────────────────────────────────────

console.log('\n5. §29 — parts and equipment through the form');

await tech.page.fill('#res-name', `${RUN} ignition coil`);
await tech.page.selectOption('#res-kind', 'part');
await tech.page.fill('#res-qty', '2');
await tech.page.fill('#res-unit', 'each');
await tech.page.getByRole('button', { name: /^Add resource$/ }).click();
await tech.page.waitForFunction(
  (name) => document.body.innerText.includes(name),
  `${RUN} ignition coil`,
  { timeout: 30000 },
);
check('a part added through the form reaches the record', true);

// ⚠️ MATCHED ON THE ACCESSIBLE NAME, which is NOT the visible "Remove".
const removeResource = tech.page.getByRole('button', {
  name: new RegExp(`^Remove ${RUN} ignition coil from the plan$`),
});
check('its remove control names what it removes', (await removeResource.count()) === 1);

// ── 6. submission ───────────────────────────────────────────────────────────

console.log('\n6. §29.10 — submitting through the screen');

await submitButton.click();
// The whole page changes: the builder disappears and the record becomes read-only.
await tech.page
  .getByRole('heading', { name: /Repair tasks, in sequence/ })
  .waitFor({ state: 'visible', timeout: 30000 });
check('submitting replaces the builder with the read-only record', true);
check(
  'and the plan reads as awaiting review',
  (await tech.page.getByText(/Awaiting review/).count()) >= 1,
);
check(
  'the technician is told WHY they cannot review it themselves',
  (await tech.page.getByText(/cannot also review it/).count()) >= 1,
);

// ── 7. §563 — the supervisor, in a separate context ─────────────────────────

console.log('\n7. §30-§31 — the supervisor reviews at the §34 default route');

const sup = await signIn('supervisor@autoworkshop.local', SUP_QUEUE);
check(
  'a supervisor reaches the repair-plan queue at the §34 default route',
  /Repair Plans/i.test((await sup.page.locator('h1').first().textContent()) ?? ''),
  await sup.page.locator('h1').first().textContent(),
);
check(
  'and the awaiting-review count is stated in words, not only in colour',
  (await sup.page.getByText(/repair plan\(s\) awaiting supervisor review/).count()) >= 1,
);

const reviewLink = sup.page.getByRole('link', { name: /^Review repair plan for/ });
await reviewLink.first().waitFor({ state: 'visible', timeout: 30000 });
check('the queue offers the REVIEW verb, not "view"', true);
await reviewLink.first().click();
await sup.page.waitForURL(/\/repair-services\/repair-plans\/[0-9a-f-]{36}/, { timeout: 30000 });

const reviewHeading = sup.page.getByRole('heading', { name: /Internal technical review/ });
await reviewHeading.waitFor({ state: 'visible', timeout: 15000 });
check('the supervisor is offered the review form', true);

// A rejection with no reason must be refused BY THE SCREEN as well as by the API —
// §31's "return to technician" IS that sentence.
await sup.page.getByRole('button', { name: /^Reject plan$/ }).click();
const refusal = await announcement(sup.page, /must say why/);
check('a rejection with no reason is refused, and says why', /must say why/.test(refusal), refusal);

await sup.page.fill('#plan-review-note', `${RUN} approved — proceed to quotation`);
await sup.page.getByRole('button', { name: /^Approve plan$/ }).click();
await sup.page
  .getByText(/§30: the approved plan passes/)
  .waitFor({ state: 'visible', timeout: 30000 });
check('a supervisor who did not submit it can approve, through the screen', true);
check(
  'and the approval names who gave it',
  /Approved by/.test((await sup.page.locator('main').innerText()) ?? ''),
);

// ── 8. the console stayed quiet ─────────────────────────────────────────────

console.log('\n8. The pages themselves');
check(
  'no console errors on either identity',
  errors.length === 0,
  errors.slice(0, 5).join(' | '),
);

await browser.close();
console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
