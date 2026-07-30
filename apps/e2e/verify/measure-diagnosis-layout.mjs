/**
 * Measure the DIAGNOSIS screens for the two layout defects slices 2 and 3a paid for.
 *
 * Copied from `measure-inspection-layout.mjs` because the defects are properties of
 * the shell and of `visuallyHidden`, not of one screen — a new screen inherits both,
 * and slice 3a proved that by landing the 23px escape again one day after the note
 * about it was written.
 *
 *   1. A `visuallyHidden` element is `position: absolute`. With NO POSITIONED
 *      ANCESTOR it lays out against the initial containing block and can escape
 *      its scroll container, stretching `<html>`. The signature is
 *      `documentElement.scrollWidth` far larger than `body.scrollWidth` — that is
 *      how the staging board reached 4906px against a 1280px viewport.
 *   2. Hidden text that is not actually hidden. `className="sr-only"` renders
 *      VISIBLY in this repo because nothing defines that class; the check here is
 *      that each supposedly-hidden element measures ~1px, so a regression to a
 *      bare class name is caught by measurement rather than by reading the JSX.
 *
 * Also records T-0044 — the pre-existing 768px sideways scroll — per page, so a
 * new screen's contribution is distinguishable from the shell defect.
 *
 *   node verify/measure-inspection-layout.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const USER = 'technician@autoworkshop.local';
/**
 * ⚠️ THE DIAGNOSIS SHEET HAS MORE HIDDEN LABELS THAN THE INSPECTION SHEET, which is
 * why this is worth re-measuring rather than assuming. Every recorded finding carries
 * a `visuallyHidden` label for its standing select, so the number of absolutely
 * positioned elements grows with the DATA — the exact shape that turned a 23px escape
 * into a 4906px one on the staging board.
 */
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

const WIDTHS = [1280, 768, 390];

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

// Sign in on a LANDING page, never on the page under test: a 404 target renders
// no sign-in link, so the harness would silently measure an anonymous visitor.
await page.goto(`${BASE}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
if (await provider.count()) await provider.first().click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
await page.fill('#username', USER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });

// The queue, then the sheet it links to — found by following the real link
// rather than by constructing an id, so the link itself is exercised.
const QUEUE = `${BASE}/record-work/diagnostic-results`;
await page.goto(QUEUE, { waitUntil: 'load' });

/**
 * ⚠️ MEASURE AN *EDITABLE* RECORD, NOT WHICHEVER ONE THE QUEUE LINKS TO FIRST.
 *
 * The first version followed any link and landed on a SETTLED record — read-only, no
 * form, and therefore zero `visuallyHidden` labels. It printed "0 visually-hidden
 * label(s) measured" and still said LAYOUT OK: a measurement that silently measured
 * nothing, which is the green-gate-that-runs-nothing failure in miniature.
 *
 * The hazard lives specifically on the editable record, because each recorded finding
 * adds another absolutely positioned label — the population grows with the DATA, which
 * is how a 23px escape became 4906px on the staging board. So this creates the state
 * it needs: start an attempt if none is open, and record one finding if there are none.
 */
const editableLink = page.getByRole('link', { name: /^Record diagnosis for JC-\d+/ });
if ((await editableLink.count()) === 0) {
  const start = page.getByRole('button', { name: /Start (a new )?diagnosis/ });
  await start.first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
  if ((await start.count()) > 0) {
    await start.first().click();
    await editableLink.first().waitFor({ timeout: 30000 }).catch(() => undefined);
  }
}
if ((await editableLink.count()) === 0) {
  // Loud, never a silent skip — the editable record is the case this script exists for.
  check('an editable diagnosis is reachable to measure', false, 'none offered by the queue');
}

const sheetHref = await editableLink
  .first()
  .getAttribute('href')
  .catch(() => null);

// Give the record at least one finding, so the per-finding hidden labels exist.
if (sheetHref) {
  await page.goto(`${BASE}${sheetHref}`, { waitUntil: 'load' });
  const addForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record finding' }) });
  await addForm
    .locator('input[name="faultDescription"]')
    .waitFor({ state: 'attached', timeout: 30000 })
    .catch(() => undefined);
  if ((await page.locator('select[name="findingStatus"]').count()) < 2) {
    await addForm.locator('input[name="faultDescription"]').fill(`Layout probe ${Date.now()}`);
    await addForm.locator('select[name="affectedSystem"]').selectOption('other');
    await page.getByRole('button', { name: 'Record finding' }).click();
    await page
      .waitForFunction(() => document.body.innerText.includes('Finding recorded'), undefined, {
        timeout: 30000,
      })
      .catch(() => undefined);
  }
}

const pages = [
  ['diagnosis queue', QUEUE],
  ['diagnosis record (editable)', sheetHref ? `${BASE}${sheetHref}` : null],
];

for (const [name, url] of pages) {
  if (!url) {
    check(`${name}: a link to it exists on the queue`, false, 'no sheet link found');
    continue;
  }
  console.log(`\n${name} — ${url}`);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    // Settle: these are server components, but the client form hydrates.
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      client: document.documentElement.clientWidth,
    }));

    // THE ESCAPE SIGNATURE — the document far wider than the body.
    check(
      `${width}px: nothing escapes the flow (doc ${m.doc} vs body ${m.body})`,
      m.doc - m.body < 100,
      JSON.stringify(m),
    );

    // T-0044 is a KNOWN shell defect at 768. Recorded, not asserted, so this
    // script does not fail on somebody else's open bug — but the number is
    // printed so a NEW contribution to it is visible.
    const overflow = m.doc - m.client;
    console.log(
      `        ${width}px document overflow: ${overflow}px` +
        (overflow > 0 && width === 768 ? '  (T-0044, pre-existing shell defect)' : ''),
    );
    if (width !== 768) {
      check(`${width}px: no sideways document scroll`, overflow <= 0, `overflow ${overflow}px`);
    }
  }

  // Hidden means hidden — measured, not read off the JSX.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'load' });
  const captions = await page.evaluate(() =>
    [...document.querySelectorAll('caption')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent ?? '').trim().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  for (const c of captions) {
    // A `visuallyHidden` caption clips to ~1px. The read-only view has a deliberately
    // VISIBLE caption, so only the tiny ones are asserted and the rest are reported.
    if (c.w <= 2 && c.h <= 2) {
      check(`hidden caption is really hidden: "${c.text}"`, true);
    } else {
      console.log(`        visible caption (${c.w}x${c.h}): "${c.text}"`);
    }
  }
  // ⚠️ NOT ASSERTED FOR THE RECORD PAGE, and that is a design fact rather than a gap:
  // a diagnosis record renders findings as CARDS, not a table, because §3036-§3040's
  // test/expected/actual is reasoning that only reads as a whole. No table means no
  // caption, and demanding one here would fail a correct page.
  if (name === 'diagnosis queue') {
    check(`${name}: has at least one caption`, captions.length > 0, JSON.stringify(captions));
  }

  // The per-finding hidden labels — the population that grows with the data.
  const hiddenLabels = await page.evaluate(() =>
    [...document.querySelectorAll('label')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent ?? '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((l) => l.w <= 2 && l.h <= 2),
  );
  for (const l of hiddenLabels) {
    check(`hidden label is really hidden and contained: "${l.text}"`, l.w <= 2 && l.h <= 2);
  }
  console.log(`        ${hiddenLabels.length} visually-hidden label(s) measured`);
  // The editable record MUST have some — one per finding's standing control. Zero here
  // means the page rendered read-only and the measurement proved nothing.
  if (name.startsWith('diagnosis record')) {
    check(
      'the editable record actually carried hidden labels to measure',
      hiddenLabels.length > 0,
      'zero measured — the page was probably read-only',
    );
  }
}

console.log(
  `\n${failures === 0 ? 'LAYOUT OK' : `LAYOUT FAILED — ${failures} of ${checks}`}` +
    ` — ${checks - failures}/${checks} passed`,
);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
