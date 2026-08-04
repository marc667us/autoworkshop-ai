/**
 * A WORKSHOP EMPLOYEE MUST NOT SEE A CUSTOMER'S VEHICLES ON THE CUSTOMER APP.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * Measured 2026-08-04: signed in as the workshop OWNER, the customer app showed
 * "Your vehicles (3)" — `GW 7745-21` (Adjoa Boateng) and two of Kwame Mensah's.
 * None of them the owner's. The API narrows to a person's OWN vehicles only
 * when `activeRole === 'customer'`; for a `workshop_owner` it correctly returns
 * the organisation's, which is right for the workshop app and a confidentiality
 * breach on a page headed "Your vehicles".
 *
 * ⚠️ TWO ASSERTIONS, AND THE SECOND IS THE ONE THAT MATTERS. Checking only that
 * the refusal renders would pass on a screen that refuses while still emitting
 * the registrations in the RSC payload — hiding, not refusing. This repo has
 * already shipped a layout gate that did exactly that: the output still went
 * out in the payload. So the whole page source is searched for the plates.
 *
 * ⚠️ AND IT ASSERTS THE REAL CUSTOMER IS UNAFFECTED. A gate that also locks out
 * the person the app is FOR is not a fix, and "no staff can see it" is trivially
 * satisfied by breaking it for everybody.
 *
 *   node verify/verify-workspace-isolation.mjs
 */
import { chromium } from '@playwright/test';

const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const STAFF = process.env['DEV_STAFF_EMAIL'] ?? 'manager@autoworkshop.local';
const REAL_CUSTOMER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';

/**
 * Plates belonging to OTHER people. Staff must not see these on this app.
 * Taken from the seed, not invented — `core.vehicles` joined to `core.customers`.
 */
const OTHER_PEOPLES_PLATES = (process.env['OTHER_PLATES'] ?? 'GW 7745-21,GR 4821-22,GT 1190-19')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 240)}`);
  }
}

const browser = await chromium.launch();

async function open(user) {
  // A FRESH context per identity. Sharing one would carry the first session's
  // cookie into the second — and on localhost cookies ignore the port, so the
  // second identity would silently inherit the first and this test would
  // measure the wrong person entirely.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });
  const link = page.getByRole('link', { name: 'Sign in' }).first();
  if (await link.count()) {
    await link.click();
    const prov = page.getByRole('button', { name: /Keycloak/i });
    await prov.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    if (await prov.count()) await prov.click({ noWaitAfter: true });
    await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 }).catch(() => {});
    await page.locator('#username, input[name="username"]').first().fill(user);
    await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
    await page.locator('#kc-login, button[type="submit"]').first().click({ noWaitAfter: true });
    await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 }).catch(() => {});
  }
  await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });
  return { ctx, page };
}

console.log(`\nWORKSPACE ISOLATION — the customer app, ${CUSTOMER}\n`);

// ── 1. STAFF ───────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(STAFF);
  const html = await page.content();

  check(
    `MEASUREMENT VALID: ${STAFF} is signed in`,
    /Sign out/i.test(html),
    'a signed-out run proves nothing — every screen is empty for everyone',
  );

  check(
    'staff are told this is not their workspace',
    /This is the customer app|belongs to a workshop/i.test(html),
    'the refusal did not render',
  );

  // 🔴 THE ONE THAT MATTERS. Searched across the WHOLE document, not just
  // `<main>`: a gate that stops the render but leaves the data in the RSC
  // payload is hiding, and this repo has shipped that exact defect before.
  const leaked = OTHER_PEOPLES_PLATES.filter((p) => html.includes(p));
  check(
    "no other person's registration appears anywhere in the document",
    leaked.length === 0,
    `leaked: ${leaked.join(', ')}`,
  );

  check(
    'they are given a way out rather than a dead end',
    /marketplace|workshop app/i.test(html),
    'the refusal names no reachable alternative',
  );

  await ctx.close();
}

// ── 2. THE REAL CUSTOMER — the gate must not break the app for its own user ──
{
  const { ctx, page } = await open(REAL_CUSTOMER);
  const html = await page.content();

  check(
    `MEASUREMENT VALID: ${REAL_CUSTOMER} is signed in`,
    /Sign out/i.test(html),
  );
  check(
    'the real customer is NOT refused',
    !/This is the customer app|belongs to a workshop/i.test(html),
    'the gate locked out the person the app exists for',
  );
  check(
    'and still sees their own vehicles',
    /GR 4821-22|GT 1190-19|Your vehicles/i.test(html),
    'the customer dashboard rendered nothing',
  );

  await ctx.close();
}

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
