/**
 * THE CUSTOMER'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE CUSTOMER.
 *
 * The vehicle owner's path, end to end:
 *
 *   garage -> add a vehicle -> report a problem -> see the request ->
 *   track it -> answer what needs answering -> collect -> read the history
 *
 * ── WHY EVERY CHECK ASSERTS CONTENT ────────────────────────────────────────
 *
 * The §33 customer tree advertises 35 entries and the catch-all renders an
 * honest "not built yet" page for the ones with no screen — HTTP 200, full
 * shell, plausible-looking. A check that only asserts the page loaded therefore
 * passes on every unbuilt screen in the workspace. This repo has already paid
 * for that exact shape at larger scale: 24 of 24 live checks passed against a
 * catalogue containing nothing, because every one of them confirmed the SECTION
 * rendered and none asked whether anything was in it.
 *
 * So each route below carries a phrase the placeholder could never contain, and
 * a SENTINEL check proves the placeholder is still detectable before any route
 * is judged — otherwise a copy change would silently turn this into a script
 * that reports the whole workspace as built.
 *
 * ⚠️ `requireNavRoute` DOES NOT REFUSE A SIGNED-OUT VISITOR on this tree (see
 * the comment on `/my-vehicles/garage`), so a run that quietly lost its session
 * would still get HTTP 200 from every route and report a working product while
 * measuring the signed-out state. The validity checks below abort on that.
 *
 *   node verify/verify-customer-workflow.mjs
 *
 * DEV ONLY — localhost/LAN, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const USER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

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

/** The journey, in the order a vehicle owner actually travels it. */
const WORKFLOW = [
  ['/home/dashboard', /dashboard|welcome|vehicle/i, 'lands somewhere real'],
  ['/my-vehicles/garage', /garage|vehicle/i, 'sees their garage'],
  ['/my-vehicles/add-vehicle', /vehicle|registration/i, 'adds a vehicle'],
  ['/service-and-repairs/report-a-problem', /problem|report/i, 'reports a problem'],
  ['/service-and-repairs/service-requests', /request/i, 'sees every request they made'],
  ['/service-and-repairs/repair-tracking', /track|repair/i, 'tracks a live repair'],
  ['/service-and-repairs/repair-proposals', /proposal|approval|waiting/i, 'answers what needs them'],
  ['/service-and-repairs/completed-repairs', /complet/i, 'sees finished work'],
  ['/my-vehicles/service-history', /history|record/i, 'reads the service history'],
  ['/parts-and-warranty/parts-orders', /order|part/i, 'sees their parts orders'],
  ['/vehicle-lookup', /vin|lookup|vehicle/i, 'looks a VIN up'],
];

/**
 * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
 * the page loaded, the shell rendered, and the screen does not exist.
 *
 * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
 * its first run and produced a FALSE FAILURE on the technician dashboard —
 * a screen that is entirely real, and whose own explanatory copy says "Page
 * content is not built yet" about OTHER routes. The check reported the first
 * screen a technician ever sees as unbuilt.
 *
 * That is this repo's most-repeated defect wearing the reviewer's hat: a
 * measurement that walks through its own gap. A detector keyed on a phrase that
 * appears in ordinary prose will keep finding it in prose.
 *
 * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
 * and nothing else in the product says it. If that copy changes, the SENTINEL
 * check below fails loudly rather than letting every route pass.
 */
const PLACEHOLDER = /scheduled for a later phase/i;

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

console.log(`\nCUSTOMER WORKFLOW — ${CUSTOMER}, as ${USER}\n`);

await page.goto(`${CUSTOMER}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
await provider.waitFor({ state: 'visible', timeout: 30000 });
await provider.click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
await page.fill('#username', USER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });

// ── 🔴 IS THIS MEASUREMENT VALID? ──────────────────────────────────────────
// A signed-out run reaches all eleven routes and reports them working, because
// this tree does not refuse anonymous visitors. Nothing below means anything
// unless there is a real session.
const shell = await page.content();
const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
if (!signedIn) {
  console.log('\nABORTING — a signed-out run would report a working product.\n');
  await browser.close();
  process.exit(1);
}

// ── 🔴 SENTINEL: can an unbuilt screen still be recognised? ────────────────
await page.goto(`${CUSTOMER}/payments/invoices`, { waitUntil: 'load' });
const sentinel = await page.content();
check(
  'SENTINEL: the placeholder is still detectable',
  PLACEHOLDER.test(sentinel),
  'PLACEHOLDER no longer matches — every route below would pass regardless',
);
if (!PLACEHOLDER.test(sentinel)) {
  console.log('\nABORTING — the detector is broken.\n');
  await browser.close();
  process.exit(1);
}

console.log('\n  the journey, in order:\n');

let built = 0;
for (const [route, needs, what] of WORKFLOW) {
  const response = await page.goto(`${CUSTOMER}${route}`, { waitUntil: 'load' }).catch(() => null);
  const status = response?.status() ?? 0;
  const html = await page.content().catch(() => '');
  // Strip the shell: the side navigation carries every route's LABEL, so the
  // word "proposal" appears on a page rendering nothing of the sort. Without
  // this the content assertion passes on the placeholder itself.
  const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];

  const ok200 = status === 200;
  const notPlaceholder = !PLACEHOLDER.test(main);
  const hasContent = needs.test(main);
  if (ok200 && notPlaceholder && hasContent) built += 1;

  check(
    `${what.padEnd(30)} ${route}`,
    ok200 && notPlaceholder && hasContent,
    !ok200
      ? `HTTP ${status}`
      : !notPlaceholder
        ? 'renders the "not built yet" placeholder'
        : `rendered but does not mention ${needs}`,
  );
}

// ── the one screen whose STATE matters, not just its existence ─────────────
// `repair-proposals` is the decision point. Either it offers an answer, or it
// says nothing is waiting — and BOTH are correct. What would be wrong is the
// old "contact the workshop" text appearing beside a proposal that is in fact
// answerable in-app, which is what `decidable` returning false for every
// customer produced.
await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
const proposals = await page.content();
const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
check(
  'the approval screen is in a coherent state',
  offersAnswer || nothingWaiting,
  'neither an answerable proposal nor an honest empty state — check `decidable`',
);

// 🔴 AN EMPTY PROPOSAL TABLE IS NOT A PASS.
//
// "Nothing is waiting on you" is a CORRECT screen and a USELESS test: the whole
// approve-the-work path below sits inside `if (offersAnswer)`, so with no seeded
// proposal this suite goes green having never touched the feature README
// promises. That is the 24-of-24-against-an-empty-shop failure, and leaving the
// branch permissive would have rebuilt it here deliberately. (Codex, 2026-08-04.)
//
// The opt-out exists for the one legitimate case — running against an
// environment where seeding is not possible — and it has to be asked for.
const ALLOW_EMPTY = process.env['ALLOW_EMPTY_CUSTOMER_PROPOSALS'] === '1';
check(
  'an ANSWERABLE proposal exists, so the approval path is actually exercised',
  offersAnswer || ALLOW_EMPTY,
  'run `bash scripts/seed-customer-proposal-fixture.sh` first — the run CONSUMES it, ' +
    'so it must be re-seeded before each verification. Set ALLOW_EMPTY_CUSTOMER_PROPOSALS=1 ' +
    'only if you genuinely mean to skip the approval test.',
);
if (offersAnswer) {
  check(
    'an answerable proposal offers a SUBMIT control, not just prose',
    /<button[^>]*type="submit"/i.test(proposals),
    'a form with no submit button shipped here once before',
  );
}

// ── 🔴 AND FINALLY: DOES APPROVING ACTUALLY DO ANYTHING? ──────────────────
// Everything above proves screens RENDER. This is the only check that proves
// the feature WORKS — it fills the form in, submits it, and reads the result
// back. Without it the suite would be satisfied by a form that posts into the
// void, which is a shape this repo has shipped: a form with no submit button
// passed typecheck, lint and next build, and was found only in a browser.
//
// ⚠️ THIS CONSUMES THE FIXTURE. An answered proposal is no longer `issued` and
// correctly leaves the screen, so re-run scripts/seed-customer-proposal-fixture.sh
// before the next verification. Two runs in this repo have already reported a
// clean pass while testing the residue of their own previous run.
if (offersAnswer) {
  await page.selectOption('#decision', 'approved').catch(() => {});
  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
  // The server action revalidates four paths; wait for the outcome to render
  // rather than for a fixed delay.
  await page
    .waitForFunction(() => /Approved\.|error|not accepted|did not respond/i.test(document.body.innerText), {
      timeout: 30000,
    })
    .catch(() => {});
  const after = await page.content();
  check(
    'approving actually records the decision',
    /Approved\. The workshop has been told/i.test(after),
    (/<p[^>]*>([^<]*(error|not accepted|did not respond|session has ended)[^<]*)<\/p>/i.exec(after) ?? [
      , 'no confirmation and no error — the submit went nowhere',
    ])[1],
  );

  // Read it back from the OTHER screen, not from the one that wrote it. A page
  // echoing its own success message proves the browser ran, not that anything
  // was stored.
  await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
  const reread = await page.content();
  check(
    'and the proposal is gone from the waiting list afterwards',
    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),
    'the answered proposal is still being offered for an answer',
  );
}

check('no console errors across the whole journey', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();

console.log(`\n${built}/${WORKFLOW.length} customer journey screens are real and reachable AS A CUSTOMER`);
console.log(`${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
