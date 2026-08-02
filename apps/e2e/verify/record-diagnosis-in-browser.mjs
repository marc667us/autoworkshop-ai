/**
 * Record and REVIEW a diagnosis THROUGH THE SCREEN — Phase 5, slice 3b.
 *
 * The API probe (`packages/auth/verify/probe-diagnosis.mjs`) proves the endpoints.
 * It proves nothing about the forms: an `<input>` whose `name` does not match what
 * the server action reads, or an action that never reaches the API, passes
 * typecheck, lint, the unit suite AND the API probe while the technician presses
 * "Record finding" and nothing happens.
 *
 * Slice 2's note, still true: "Codex reviews a diff; it will not see what the page
 * DOES." This is that measurement for slice 3b's write paths — and there are five
 * of them, which is four more than a checklist had.
 *
 * ── IT DRIVES TWO IDENTITIES, WHICH IS THE POINT ───────────────────────────
 *
 * §1292's review is only real if the submitter cannot sign their own diagnosis off.
 * So this signs in as the technician, records and submits, then signs in as the
 * SUPERVISOR in a separate browser context and reviews. A single-identity run would
 * exercise the form and skip the rule.
 *
 *   node verify/record-diagnosis-in-browser.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const QUEUE = '/record-work/diagnostic-results';
/**
 * Where a `workshop_supervisor` actually reaches this screen.
 *
 * ⚠️ THE §34 WORKSPACE DEFAULT, NOT `/repair-control/diagnosis-queue`. Measured, not
 * assumed: `repair-control/*` belongs to the §46 owner and §47 manager trees, and a
 * supervisor requesting either gets a 404 from `requireNavRoute`. §1292 names a
 * SUPERVISOR review, so the role the rule is written for reads the record at the
 * default route — which is precisely why this slice builds all four and gates each
 * one separately. A single screen at one path would have been invisible to the role
 * the review exists for.
 */
const REVIEW_QUEUE = '/repair-services/diagnosis';
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

/** A signed-in page for one identity, in its own context so sessions cannot mix. */
async function signIn(user, queue) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // Surface anything the page logs. A server-action failure often shows up here
  // first, and a silent console is part of the result.
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
 * ⚠️ AN UNSCOPED `[role="status"]`/`[role="alert"]` ALSO MATCHES THE SHELL'S OWN
 * EMPTY LIVE REGION — a trap this repo has now tripped twice, once per role. Scoping
 * to `main` and requiring non-empty text is what makes the answer mean something.
 */
async function announcement(page, pattern) {
  const nodes = page.locator('main [role="status"], main [role="alert"]');
  const n = await nodes.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const text = ((await nodes.nth(i).textContent()) ?? '').trim();
    if (text === '') continue;
    seen.push(text);
    if (pattern === undefined || pattern.test(text)) return text;
  }
  // Everything found, for the failure message. Returning only the first non-empty
  // node made a real announcement look absent: `StatusBadge` renders its own
  // `role="status"`, so the FIRST match on this page is the word "In progress" — a
  // live region that is not an announcement. Two live-region traps down, and both
  // were about matching too loosely.
  return seen.join(' | ');
}

// ═══ 0. setup — clear any review this repo left pending ════════════════════
//
// ⚠️ NOT A WORKAROUND FOR A DEFECT, AND WORTH BEING PRECISE ABOUT. A previous run
// (or the API probe) can leave a diagnosis AWAITING REVIEW, and while one is pending
// no new attempt may be started — that is the fix for Codex's HIGH finding working
// as designed, not a blocked harness. An earlier version of this script reported it
// as "no Start button offered", i.e. flagged correct behaviour as the slice-3a
// unreachable-alternative defect.
//
// So the supervisor clears the queue first, exactly as they would in a workshop. It
// also means the technician phase below always starts from a known state, rather
// than passing or failing depending on what ran last.
console.log('0. setup — a supervisor clears any pending review');
{
  const setup = await signIn('supervisor@autoworkshop.local', REVIEW_QUEUE);
  const pending = setup.page.locator(`a[href*="${REVIEW_QUEUE}/"]`);
  let cleared = 0;
  const total = await pending.count();
  for (let i = 0; i < total; i += 1) {
    await setup.page.goto(`${BASE}${REVIEW_QUEUE}`, { waitUntil: 'load' });
    const approve = setup.page.getByRole('button', { name: 'Approve diagnosis' });
    const next = setup.page.locator(`a[href*="${REVIEW_QUEUE}/"]`).nth(i);
    if ((await next.count()) === 0) break;
    await next.click();
    await setup.page.waitForURL(new RegExp(`${REVIEW_QUEUE}/`), { timeout: 30000 });
    // ⚠️ WAIT BEFORE COUNTING. `count()` does not auto-wait, and asking it straight
    // after `waitForURL` answers about a page that has not rendered — which made an
    // earlier version of this setup report "cleared 0 pending review(s)" and then
    // leave the technician phase blocked by the review it had just failed to see.
    // The trap is already recorded in this repo once per role; this is the third time
    // it has been paid for, hence the wait rather than another note.
    await approve
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
      .catch(() => undefined);
    if ((await approve.count()) > 0) {
      await setup.page.fill('textarea[name="note"]', 'Cleared so the harness starts from a known state.');
      await approve.first().click();
      await setup.page
        .waitForFunction(() => /Approved by/i.test(document.body.innerText), undefined, {
          timeout: 30000,
        })
        .catch(() => undefined);
      cleared += 1;
    }
  }
  console.log(`  ....  cleared ${cleared} pending review(s)`);
  await setup.ctx.close();
}

// ═══ the technician ════════════════════════════════════════════════════════

console.log('\n1. the technician reaches an editable diagnosis');
const tech = await signIn('technician@autoworkshop.local', QUEUE);
let page = tech.page;

/**
 * The link into an EDITABLE record, identified by its verb.
 *
 * ⚠️ THE VERB IS THE ONLY RELIABLE SIGNAL, and getting this wrong cost a full run.
 * The queue renders "Record diagnosis for JC-000003" when the viewer may write to the
 * record and "View diagnosis for ..." when they may not, so matching any
 * `a[href*=...]` matches a settled record too. An earlier version did exactly that:
 * it pressed Start, then `waitFor`ed "a link" — which was ALREADY THERE, pointing at
 * the previous approved attempt — so the wait returned instantly, the script opened
 * the read-only record, and reported the missing form as a defect. A wait for a
 * condition that is already true is not a wait.
 *
 * Keying on the verb also asserts something worth asserting: that the queue tells the
 * technician which records they can still write to.
 */
const editableLink = page.getByRole('link', { name: /^Record diagnosis for JC-\d+/ });
const startButton = page.getByRole('button', { name: /Start (a new )?diagnosis/ });

if ((await editableLink.count()) === 0) {
  // A REGEX, because the queue says "Start diagnosis" for a card with no record and
  // "Start a new diagnosis" once one is settled. An exact matcher would find neither
  // in the case it is needed.
  await startButton
    .first()
    .waitFor({ state: 'attached', timeout: 20000 })
    .catch(() => undefined);
  if ((await startButton.count()) === 0) {
    // Loud, and this is the shape of the slice-3a defect: a rule refusing a change
    // while the product offers no way to make a new attempt.
    check('a new attempt is reachable from the queue', false, 'no Start button offered');
  } else {
    await startButton.first().click();
    // Waits for the EDITABLE link specifically, so this cannot be satisfied by the
    // read-only link that was already on the row.
    await editableLink.first().waitFor({ timeout: 30000 });
    check('starting a diagnosis repaints the row into an editable link', true);
  }
}

check('the queue offers a link into an editable record', (await editableLink.count()) > 0);
const linkText = ((await editableLink.first().textContent()) ?? '').trim();
check(
  'the link names the job rather than saying only "View"',
  /JC-\d+/.test(linkText),
  linkText,
);
await editableLink.first().click();
await page.waitForURL(new RegExp(`${QUEUE}/`), { timeout: 30000 });

/**
 * Wait for the form to be ON SCREEN before COUNTING anything.
 *
 * ⚠️ `locator.count()` does NOT auto-wait — it answers about the DOM this instant,
 * while `click`/`fill` do wait. That mismatch made an earlier harness report
 * "0 controls" and then successfully fill them three steps later.
 */
async function formReady() {
  await page
    .locator('input[name="faultDescription"]')
    .first()
    .waitFor({ state: 'attached', timeout: 30000 })
    .catch(() => undefined);
}
await formReady();

const diagnosisUrl = page.url();
check(
  'the editable form is on screen',
  (await page.locator('input[name="faultDescription"]').count()) > 0,
);

console.log('\n2. recording a finding through the form');

/**
 * The ADD form, scoped by the button only it contains.
 *
 * ⚠️ `input[name="faultDescription"]` IS AMBIGUOUS ONCE FINDINGS EXIST. Every recorded
 * finding carries its own "Correct the details" form with the SAME field names, so an
 * unscoped selector resolves to several elements — a Playwright strict-mode violation
 * at best and the wrong form silently at worst. Scoping by the submit button is stable
 * because the verb is exactly what distinguishes the two forms.
 */
const addForm = page
  .locator('form')
  .filter({ has: page.getByRole('button', { name: 'Record finding' }) });

// ⚠️ THE ASSERTION THE API PROBE CANNOT MAKE. Every one of these names must match
// what `addFindingAction` reads out of the FormData. A mismatch is invisible to
// typecheck, lint, the unit suite and the API probe.
for (const name of [
  'faultDescription',
  'affectedSystem',
  'faultCode',
  'observedSymptom',
  'testPerformed',
  'expectedResult',
  'actualResult',
  'interpretation',
  'findingStatus',
  'additionalInspectionRequired',
]) {
  check(
    `the form carries a control named "${name}"`,
    (await addForm.locator(`[name="${name}"]`).count()) > 0,
  );
}

/**
 * A per-run tag, stamped into every record this script creates.
 *
 * ⚠️ WITHOUT IT THE SCRIPT MEASURES ITS OWN RESIDUE. A diagnosis accumulates findings
 * and re-runs leave theirs behind, so `filter({ hasText: 'Browser-recorded coil fault' })`
 * matched several rows and `.first()` picked the OLDEST — a finding whose code an
 * earlier run had already cleared. That reported "the edit form is not pre-filled" and
 * "the code was not removed" as product defects when both were the harness reading a
 * different row. The tag makes every locator below name THIS run's records.
 */
const RUN = String(Date.now()).slice(-6);
const FAULT = `Browser-recorded coil fault ${RUN}`;
const THROWAWAY = `Entered in error via the browser ${RUN}`;
const CODE = `P03${String(Date.now()).slice(-2)}`;
await addForm.locator('input[name="faultDescription"]').fill(FAULT);
await addForm.locator('select[name="affectedSystem"]').selectOption('electrical');
await addForm.locator('input[name="faultCode"]').fill(CODE);
await addForm.locator('input[name="observedSymptom"]').fill('Rough idle');
await addForm.locator('input[name="testPerformed"]').fill('Coil primary resistance');
await addForm.locator('input[name="expectedResult"]').fill('0.4-0.6 ohm');
await addForm.locator('input[name="actualResult"]').fill('Open circuit');
await addForm.locator('textarea[name="interpretation"]').fill('Coil has failed open');
await addForm.locator('select[name="findingStatus"]').selectOption('confirmed');
await addForm.locator('input[name="additionalInspectionRequired"]').check();
await page.getByRole('button', { name: 'Record finding' }).click();

await page.waitForFunction(
  (code) => document.body.innerText.includes(code),
  CODE,
  { timeout: 30000 },
);
check('the finding appears on the page after saving', true);
check(
  'the announcement confirms it, with a count',
  /Finding recorded/.test(await announcement(page, /Finding recorded/)),
  await announcement(page),
);
// The §1294 signature, rendered — not merely stored.
const body = await page.locator('main').innerText();
check('a confirmed finding is badged Confirmed', /Confirmed/.test(body));
check(
  'and §3046 further-inspection is surfaced',
  /further inspection/i.test(body),
);

console.log('\n3. correcting a finding — clearing a field');
/**
 * The card for the finding THIS RUN created, not `details.first()`.
 *
 * A diagnosis accumulates findings, and earlier runs leave their own behind — so the
 * first disclosure on the page belongs to whichever finding happens to sort first.
 * Asserting "the edit form is pre-filled with the stored code" against that one read
 * as a product defect when it was the harness pointing at a different row.
 */
const card = page.locator('li').filter({ hasText: FAULT }).first();
const details = card.locator('details').first();
check('the record offers "Correct the details"', (await details.count()) > 0);
await details.locator('summary').click();
const codeField = details.locator('input[name="faultCode"]');
await codeField.waitFor({ timeout: 15000 });
check('the edit form is pre-filled with the stored code', (await codeField.inputValue()) === CODE, await codeField.inputValue());
// ⚠️ EMPTYING IT MUST ACTUALLY CLEAR IT. Before the Codex MEDIUM fix the action sent
// `undefined`, the service COALESCEd it, and the wrong code stayed on the record
// while the screen said "Finding corrected".
await codeField.fill('');
await details.getByRole('button', { name: 'Save corrections' }).click();
await page.waitForFunction(
  (code) => !document.body.innerText.includes(code),
  CODE,
  { timeout: 30000 },
).then(
  () => check('emptying the fault code REMOVES it from the record', true),
  () =>
    check(
      'emptying the fault code REMOVES it from the record',
      false,
      `${CODE} is still on the page after saving`,
    ),
);

console.log('\n4. the standing can be changed, and removal works');
// The FINDING's standing control, not the add form's — both are named
// `findingStatus`, and `.first()` alone was relying on render order.
const statusSelect = card
  .locator('form')
  .filter({ has: page.getByRole('button', { name: 'Update standing' }) })
  .first()
  .locator('select[name="findingStatus"]');
check('each finding offers a standing control', (await statusSelect.count()) > 0);
await statusSelect.selectOption('suspected');
await card.getByRole('button', { name: 'Update standing' }).first().click();
await page.waitForFunction(
  () => document.body.innerText.includes('Finding updated'),
  undefined,
  { timeout: 30000 },
).then(
  () => check('changing the standing is confirmed on screen', true),
  async () => check('changing the standing is confirmed on screen', false, await announcement(page)),
);

// The escape hatch, exercised: add a throwaway finding and remove it.
await addForm.locator('input[name="faultDescription"]').fill(THROWAWAY);
await addForm.locator('select[name="affectedSystem"]').selectOption('other');
await page.getByRole('button', { name: 'Record finding' }).click();
await page.waitForFunction(
  (text) => document.body.innerText.includes(text),
  THROWAWAY,
  { timeout: 30000 },
);
/**
 * ⚠️ THE ACCESSIBLE NAME IS NOT THE VISIBLE TEXT. The button reads "Remove" on screen
 * but carries `aria-label="Remove the finding “...”, entered in error"` so a screen
 * reader can tell a column of them apart — which means `getByRole` matching `/^Remove$/`
 * finds NOTHING. The harness asserting the visible text was wrong, not the button; and
 * a matcher keyed to the aria-label also proves the label is actually there.
 *
 * Scoped to the throwaway finding rather than `.last()`, so this cannot delete a
 * finding an earlier run left behind and call it a pass.
 */
const throwawayCard = page.locator('li').filter({ hasText: THROWAWAY }).first();
const removeButtons = throwawayCard.getByRole('button', { name: /^Remove the finding/ });
check('a removable finding offers a Remove button', (await removeButtons.count()) > 0);
await removeButtons.first().click();
await page.waitForFunction(
  (text) => !document.body.innerText.includes(text),
  THROWAWAY,
  { timeout: 30000 },
).then(
  () => check('removing a finding takes it off the record', true),
  () => check('removing a finding takes it off the record', false, 'still present'),
);

console.log('\n5. submitting for review');
await page
  .locator('form')
  .filter({ has: page.getByRole('button', { name: 'Save notes' }) })
  .locator('textarea[name="summary"]')
  .fill('Browser-driven diagnosis run.');
await page.getByRole('button', { name: 'Save notes' }).click();
await page.waitForFunction(
  () => document.body.innerText.includes('Notes saved'),
  undefined,
  { timeout: 30000 },
).then(
  () => check('the notes save', true),
  async () => check('the notes save', false, await announcement(page)),
);

await page.getByRole('button', { name: 'Submit for review' }).click();
await page.waitForFunction(
  () => /Awaiting review|awaiting supervisor review/i.test(document.body.innerText),
  undefined,
  { timeout: 30000 },
).then(
  () => check('the record becomes Awaiting review', true),
  async () => check('the record becomes Awaiting review', false, await announcement(page)),
);
const afterSubmit = await page.locator('main').innerText();
check(
  'the form is GONE — a submitted record is read-only, not a disabled form',
  (await page.locator('input[name="faultDescription"]').count()) === 0,
);
// §563 explained to the person it refuses, rather than a silently missing control.
check(
  'and the page explains why THEY cannot review it',
  /cannot also review it/i.test(afterSubmit),
  afterSubmit.slice(0, 200),
);
check(
  'the technician is offered NO review buttons',
  (await page.getByRole('button', { name: /Approve diagnosis|Reject diagnosis/ }).count()) === 0,
);

// ═══ the supervisor ════════════════════════════════════════════════════════

console.log('\n6. a DIFFERENT supervisor reviews it — §1292 + §563');
const sup = await signIn('supervisor@autoworkshop.local', REVIEW_QUEUE);
page = sup.page;

const queueText = await page.locator('main').innerText();
check(
  'the manager queue surfaces the count awaiting review',
  /awaiting supervisor review/i.test(queueText),
  queueText.slice(0, 200),
);

// Same record, reached at the supervisor's OWN route — the four-tree rule.
const supPath = diagnosisUrl.replace(BASE, '').replace(QUEUE, REVIEW_QUEUE);
await page.goto(`${BASE}${supPath}`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Approve diagnosis' }).waitFor({ timeout: 30000 });
check('the supervisor IS offered the review controls', true);
check(
  'and the reason field is there for a rejection',
  (await page.locator('textarea[name="note"]').count()) > 0,
);

// A rejection with no reason must be refused — announced, not silently dropped.
await page.getByRole('button', { name: 'Reject diagnosis' }).click();
await page.waitForFunction(
  () => /must say why/i.test(document.body.innerText),
  undefined,
  { timeout: 20000 },
).then(
  () => check('rejecting with no reason is refused on screen', true),
  async () => check('rejecting with no reason is refused on screen', false, await announcement(page)),
);

await page.fill('textarea[name="note"]', 'Coil test is conclusive. Proceed to repair planning.');
await page.getByRole('button', { name: 'Approve diagnosis' }).click();
await page.waitForFunction(
  () => /Approved by/i.test(document.body.innerText),
  undefined,
  { timeout: 30000 },
).then(
  () => check('the approval lands and names the reviewer', true),
  async () => check('the approval lands and names the reviewer', false, (await page.locator('main').innerText()).slice(0, 300)),
);
check(
  'the review controls are gone once answered',
  (await page.getByRole('button', { name: 'Approve diagnosis' }).count()) === 0,
);

// ── result ────────────────────────────────────────────────────────────────

check('no console errors on any page visited', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures === 0 ? 0 : 1);
