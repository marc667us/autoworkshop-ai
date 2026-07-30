/**
 * Measure the repair-plan screens for sideways overflow — Phase 5, slice 4.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A MEASUREMENT THAT MEASURES NOTHING STILL SAYS OK.
 * Slice 3b's first version followed any link, landed on a SETTLED (read-only) record,
 * counted zero absolutely-positioned elements and PASSED — while the hazard lives on
 * the EDITABLE page, where the population of such elements grows with the data. So this
 * one CREATES the editable state and FAILS if it found nothing to measure.
 *
 * ── WHAT IT IS LOOKING FOR ─────────────────────────────────────────────────
 *
 * Two defects, both of which have really happened here:
 *
 *   1. `visuallyHidden` is `position: absolute`, so inside an ancestor that is not
 *      positioned it escapes to the nearest one — measured at 23px on the inspection
 *      sheet and 4906px on the staging board. Every container in this slice therefore
 *      carries `position: relative`, and this counts the elements that depend on it.
 *   2. `overflow-x: auto` alone does not contain a wide child inside a flex/grid
 *      ancestor; it also needs `minWidth: 0`.
 *
 * ── T-0044 IS PRE-EXISTING, SO THE CONTROL IS THE POINT ────────────────────
 *
 * The document already scrolls 51px sideways at 768px on EVERY page in this app — a
 * shell defect, not this slice's. A bare "does it overflow" check would therefore fail
 * on a perfect page, and a threshold tuned to 51 would hide a real 52px regression. So
 * each measurement is taken against a CONTROL page and the assertion is that the plan
 * screens are NO WORSE than the shell they sit in.
 *
 *   node verify/measure-repair-plan-layout.mjs
 *
 * PRECONDITION: the same as the browser proof — a plan must be startable or already
 * open. Run `packages/auth/verify/probe-repair-plan.mjs` first.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const QUEUE = '/plan-work/repair-planning';
/** A page from the same shell with no slice-4 content — the baseline for T-0044. */
const CONTROL = '/home/dashboard';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/** The three widths this product is checked at. 768 is where T-0044 shows. */
const VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'tablet 768', width: 768, height: 1024 },
  { label: 'desktop 1280', width: 1280, height: 900 },
];

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

await page.goto(`${BASE}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
if (await provider.count()) await provider.first().click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
await page.fill('#username', 'technician@autoworkshop.local');
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });

// ── reach an EDITABLE plan, creating one if necessary ───────────────────────

await page.goto(`${BASE}${QUEUE}`, { waitUntil: 'load' });

const planLink = page.getByRole('link', { name: /^Plan repair plan for/ });
const startButton = page.getByRole('button', {
  name: /^(Plan repair|Start a revised plan) for job card/,
});

if ((await planLink.count()) === 0) {
  if ((await startButton.count()) === 0) {
    console.error(
      '\nNo editable plan and no way to start one. Run packages/auth/verify/probe-repair-plan.mjs first.\n',
    );
    await browser.close();
    process.exit(2);
  }
  await startButton.first().click();
  // False-until-success: the row must change from a button to an editable link.
  await planLink.first().waitFor({ state: 'visible', timeout: 30000 });
}
await planLink.first().click();
await page.waitForURL(/\/plan-work\/repair-planning\/[0-9a-f-]{36}/, { timeout: 30000 });

// ⚠️ THE PAGE MUST HAVE DATA ON IT. The hazard's population grows with the rows, so a
// plan with no tasks measures an empty page and proves nothing. One task is added if
// there are none.
const RUN = `layout-${Date.now().toString().slice(-6)}`;
if ((await page.locator('input[name="title"]').count()) === 0) {
  await page.fill('#task-title', `${RUN} a task long enough to stress the row layout`);
  await page.fill('#task-skill', 'a reasonably long skill description');
  // ⚠️ ESTIMATED, so this harness does not poison the others. An unestimated task
  // blocks submission, which left the probe's residue-settler unable to close the plan
  // and made the NEXT run report a product defect. A measurement harness must not
  // change what a later harness measures.
  await page.fill('#task-hours', '1.00');
  await page.getByRole('button', { name: /^Add task$/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('input[name="title"]').length > 0,
    undefined,
    { timeout: 30000 },
  );
}

const planUrl = page.url();

/** Everything worth knowing about one page at one width. */
async function measure(url, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: 'load' });
  // A repaint after the resize; without it the first measurement is of the old layout.
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const doc = document.documentElement;
    const positioned = Array.from(document.querySelectorAll('*')).filter(
      (el) => getComputedStyle(el).position === 'absolute',
    );
    // An absolutely positioned element whose right edge is past the viewport is one
    // that ESCAPED its container — the exact `visuallyHidden` defect.
    const escaped = positioned.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > doc.clientWidth + 1 || r.left < -1;
    });
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflow: doc.scrollWidth - doc.clientWidth,
      absolute: positioned.length,
      escaped: escaped.map(
        (el) =>
          `${el.tagName.toLowerCase()}[${el.className || 'no-class'}]"${(el.textContent ?? '').trim().slice(0, 30)}"`,
      ),
    };
  });
}

console.log('\nOverflow, against the shell control (T-0044 is pre-existing)\n');

let measuredAbsolute = 0;

for (const viewport of VIEWPORTS) {
  const control = await measure(`${BASE}${CONTROL}`, viewport);
  const queue = await measure(`${BASE}${QUEUE}`, viewport);
  const sheet = await measure(planUrl, viewport);
  measuredAbsolute += sheet.absolute;

  console.log(
    `  ${viewport.label}: control ${control.overflow}px · queue ${queue.overflow}px · plan ${sheet.overflow}px` +
      ` (${sheet.absolute} absolutely positioned, ${sheet.escaped.length} off-viewport;` +
      ` shell control has ${control.escaped.length})`,
  );

  check(
    `${viewport.label} — the queue is no worse than the shell control`,
    queue.overflow <= control.overflow,
    `queue ${queue.overflow}px vs control ${control.overflow}px`,
  );
  check(
    `${viewport.label} — the plan record is no worse than the shell control`,
    sheet.overflow <= control.overflow,
    `plan ${sheet.overflow}px vs control ${control.overflow}px`,
  );
  // ⚠️ ESCAPES ARE COMPARED TO THE CONTROL, NOT TO ZERO — for the same reason the
  // overflow is. The shell's own skip-link is `position: absolute` and parked off the
  // left edge until focused, which is the CORRECT implementation of a skip link and
  // appears on every page in the app including the control. Asserting zero would fail
  // on a perfect page and would tempt the next person to delete a real accessibility
  // feature to make a test green. What matters is whether THIS SLICE adds an escape the
  // shell does not already have.
  const controlEscapes = new Set(control.escaped);
  const newOnSheet = sheet.escaped.filter((e) => !controlEscapes.has(e));
  const newOnQueue = queue.escaped.filter((e) => !controlEscapes.has(e));

  check(
    `${viewport.label} — the plan record adds no escaping element the shell lacks`,
    newOnSheet.length === 0,
    `new: ${newOnSheet.join(', ')} | shell already has: ${control.escaped.join(', ')}`,
  );
  check(
    `${viewport.label} — nor does the queue`,
    newOnQueue.length === 0,
    `new: ${newOnQueue.join(', ')} | shell already has: ${control.escaped.join(', ')}`,
  );
}

// ⚠️ THE ASSERTION THAT STOPS THIS FILE LYING. If the page carried no absolutely
// positioned elements at all, every check above passed by measuring nothing — which is
// exactly how slice 3b's version reported a clean result from a read-only page.
check(
  'the measurement actually had something to measure',
  measuredAbsolute > 0,
  `${measuredAbsolute} absolutely positioned elements across all viewports`,
);

await browser.close();
console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
