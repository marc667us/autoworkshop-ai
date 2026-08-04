/**
 * THE TECHNICIAN'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE TECHNICIAN.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM `verify-job-queues.mjs` ─────────────────
 *
 * That script proves the fourteen QUEUES render. This one asks a different and
 * harder question: can a technician actually get a job from "assigned to me" to
 * "submitted to quality control" without hitting a wall? Those are not the same
 * question, and the repo has already paid for the difference — every suite
 * asserted that the catalogue SECTION rendered and none asked whether anything
 * was in it, so 24 of 24 passed against a completely empty shop.
 *
 * So every check below asserts CONTENT, not merely that a page responded.
 *
 * ── THE THREE LESSONS THIS SCRIPT IS BUILT AROUND ──────────────────────────
 *
 * 1. DRIVE EACH ROUTE AS THE ROLE WHOSE TREE OWNS IT. On 2026-08-02 a queue
 *    check reported 1/14 while all fourteen worked: it drove every route as a
 *    platform administrator and the thirteen "failures" were thirteen CORRECT
 *    `requireNavRoute` refusals. Everything here runs as the technician, and
 *    the run ABORTS if the active role is not `technician` — a measurement
 *    taken as the wrong person is worse than no measurement.
 *
 * 2. THE PLACEHOLDER IS THE FAILURE. 127 menu entries render an honest "not
 *    built yet" page, which returns HTTP 200 and a fully-formed shell. A check
 *    that only asserts the page loaded therefore passes on every unbuilt screen
 *    in the product. Each route below is asserted NOT to be the placeholder.
 *
 * 3. READ THE COUNT, NEVER THE EXIT CODE. Printed at the end, per route.
 *
 *   node verify/verify-technician-workflow.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const USER = process.env['DEV_TECH_EMAIL'] ?? 'technician@autoworkshop.local';
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

/**
 * The technician's §49 tree, in the order a real job travels through it.
 *
 * `needs` is a string or regex that must appear in the rendered page. It is the
 * difference between "this route answered" and "this route is the screen it
 * claims to be" — deliberately something the PLACEHOLDER could never contain.
 */
const WORKFLOW = [
  ['/home/dashboard', /dashboard/i, 'the technician lands somewhere real'],
  ['/home/my-assigned-work', /assigned/i, 'sees the work assigned to them'],

  // ── the queues a job passes through, in lifecycle order ──
  ['/my-jobs/inspection-required', /inspection/i, 'inspection queue'],
  ['/my-jobs/diagnosis-required', /diagnos/i, 'diagnosis queue'],
  ['/my-jobs/repair-approved', /approv/i, 'approved-for-repair queue'],
  ['/my-jobs/awaiting-parts', /parts/i, 'awaiting-parts queue'],
  ['/my-jobs/repair-in-progress', /progress|repair/i, 'work-in-progress queue'],
  ['/my-jobs/testing-required', /test/i, 'testing queue'],
  ['/my-jobs/quality-control-returns', /quality|control/i, 'QC-returns queue'],

  // ── the screens where the work is actually recorded ──
  ['/plan-work/repair-planning', /repair plan|planning/i, 'plans the repair'],
  ['/record-work/inspection-results', /inspection/i, 'records the inspection'],
  ['/record-work/diagnostic-results', /diagnos/i, 'records the diagnosis'],
  ['/record-work/repair-tasks', /task|repair/i, 'records the repair tasks'],
  ['/record-work/time-records', /time/i, 'records time'],
  ['/record-work/parts-used', /part/i, 'records parts used'],
  ['/record-work/repair-evidence', /evidence/i, 'records evidence'],
  ['/record-work/variation-requests', /variation/i, 'raises a variation'],

  // ── and hands it on ──
  ['/testing/repair-test-results', /test/i, 'records the test results'],
  ['/testing/post-repair-scan', /scan/i, 'records the post-repair scan'],
  ['/testing/road-test', /road/i, 'records the road test'],
  ['/testing/submit-to-quality-control', /quality|control/i, 'submits to quality control'],
];

/**
 * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
 * the page loaded, the shell rendered, and the screen does not exist.
 *
 * Taken from the real placeholder copy — if that wording ever changes this
 * script starts passing everything, so the sentinel check below asserts the
 * placeholder is still detectable before any route is judged.
 */
const PLACEHOLDER = /scheduled for a later phase|not built yet/i;

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

console.log(`\nTECHNICIAN WORKFLOW — ${WORKSHOP}, as ${USER}\n`);

// ── sign in ────────────────────────────────────────────────────────────────
await page.goto(`${WORKSHOP}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
// `waitFor`, not `count()` — count does not auto-wait, and a run that carries
// on SIGNED OUT reports product defects that do not exist.
await provider.waitFor({ state: 'visible', timeout: 30000 });
await provider.click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
await page.fill('#username', USER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });

// ── 🔴 IS THIS MEASUREMENT VALID AT ALL? ───────────────────────────────────
// Two ways it silently becomes meaningless: not signed in, or signed in as
// somebody whose tree does not own these routes. Both produce a full page of
// plausible FAILures that are really correct refusals.
const shell = await page.content();
const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
check('MEASUREMENT VALID: signed in', signedIn, 'the whole run is meaningless otherwise');
if (!signedIn) {
  console.log('\nABORTING — every FAIL below would be a refusal, not a defect.\n');
  await browser.close();
  process.exit(1);
}

// The identity may hold several memberships; §49's tree is the one under test.
const switcher = page.locator('#aw-role-switcher');
if ((await switcher.count()) > 0) {
  const current = await switcher.inputValue().catch(() => '');
  if (current !== 'technician') {
    await switcher.selectOption('technician').catch(() => {});
    await page.waitForTimeout(3000);
    await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
  }
  const active = await page.locator('#aw-role-switcher').inputValue().catch(() => '');
  check('MEASUREMENT VALID: acting as technician', active === 'technician', `active role: ${active}`);
  if (active !== 'technician') {
    console.log('\nABORTING — driving §49 routes as another role measures the wrong tree.\n');
    await browser.close();
    process.exit(1);
  }
} else {
  console.log('  note  no role switcher: this identity holds one membership');
}

// ── 🔴 SENTINEL: can this script still RECOGNISE an unbuilt screen? ────────
// Every judgement below depends on `PLACEHOLDER` matching the catch-all. If the
// copy changed, that regex silently matches nothing and this script reports the
// entire product as built. Prove the detector works before trusting it — a
// route from the technician's own tree that is genuinely not built yet.
await page.goto(`${WORKSHOP}/learning/training-courses`, { waitUntil: 'load' });
const sentinel = await page.content();
check(
  'SENTINEL: the placeholder is still detectable',
  PLACEHOLDER.test(sentinel),
  'PLACEHOLDER no longer matches the catch-all — every route below would pass regardless',
);
if (!PLACEHOLDER.test(sentinel)) {
  console.log('\nABORTING — the detector is broken, so nothing below would mean anything.\n');
  await browser.close();
  process.exit(1);
}

// ── the workflow itself ────────────────────────────────────────────────────
console.log('\n  the chain, in the order a job travels it:\n');

let built = 0;
for (const [route, needs, what] of WORKFLOW) {
  const response = await page.goto(`${WORKSHOP}${route}`, { waitUntil: 'load' }).catch(() => null);
  const status = response?.status() ?? 0;
  const html = await page.content().catch(() => '');
  // Strip the shell before matching: the side navigation contains every route's
  // LABEL, so "inspection" appears on a page that renders nothing of the sort.
  // Without this the content assertion passes on the placeholder itself.
  const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];

  const ok200 = status === 200;
  const notPlaceholder = !PLACEHOLDER.test(main);
  const hasContent = needs.test(main);

  if (ok200 && notPlaceholder && hasContent) built += 1;

  check(
    `${what.padEnd(34)} ${route}`,
    ok200 && notPlaceholder && hasContent,
    !ok200
      ? `HTTP ${status}`
      : !notPlaceholder
        ? 'renders the "not built yet" placeholder'
        : `page rendered but does not mention ${needs}`,
  );
}

check('no console errors across the whole chain', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();

console.log(
  `\n${built}/${WORKFLOW.length} technician workflow screens are real and reachable AS A TECHNICIAN`,
);
console.log(`${checks - failures}/${checks} checks passed\n`);
// READ THE COUNT, NEVER THE EXIT CODE — but the exit code still has to be right.
process.exit(failures === 0 ? 0 : 1);
