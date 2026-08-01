/**
 * The Slice B screens, THROUGH THE BROWSER.
 *
 * The API probe (`packages/auth/verify/probe-catalogue.mjs`) proves the
 * endpoints, 30/30. It proves nothing about the forms: an `<input>` whose
 * `name` does not match what the server action reads, or an action that never
 * reaches the API, passes typecheck, lint, the unit suite AND the probe while
 * the supplier presses "Add part" and nothing happens.
 *
 * ⚠️ AND A CLEAN BUILD IS NOT EVIDENCE A SCREEN WORKS. On 2026-07-31 every gate
 * was green while every page in the app returned a server-side exception,
 * because the server/client boundary is enforced at RUNTIME ONLY. These screens
 * introduce new client components receiving server actions across exactly that
 * seam, so the first assertion is simply: the page rendered.
 *
 *   node verify/verify-catalogue-screens.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const SUPPLIER_WEB = 'http://localhost:3002';
const ADMIN_WEB = 'http://localhost:3006';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const STAMP = `E2E-${Date.now().toString(36).toUpperCase()}`;

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

async function signIn(base, user, landing) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));

  await page.goto(`${base}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  // `waitFor`, NOT `if (await count())` — count() does not auto-wait, and the
  // race silently continues as an ANONYMOUS visitor, turning every assertion
  // into a false product defect. Cost a run on 2026-08-01.
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${base}${landing}`, { waitUntil: 'load' });
  return { ctx, page };
}

async function rendered(page) {
  const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  return !body.includes('server-side exception') && !body.includes('internal server error');
}

async function assertSignedIn(page, who) {
  const html = await page.content();
  check(
    `${who}: the session is real`,
    html.includes('Sign out') && !html.includes('Not signed in'),
    'NOT SIGNED IN — every assertion below would fail for the wrong reason',
  );
}

try {
  // ═══ 1. the supplier catalogue screen ════════════════════════════════════
  console.log('\n1. supplier-web :3002 /products/product-catalogue');
  const sup = await signIn(SUPPLIER_WEB, 'admin@autoworkshop.local', '/products/product-catalogue');
  await assertSignedIn(sup.page, 'supplier member');
  check('the page renders — no server-side exception', await rendered(sup.page));

  const heading = await sup.page.getByRole('heading', { name: /Product catalogue/i }).count();
  check('the catalogue heading is present', heading > 0);

  // The seeded account is a member of five suppliers, so the panels must exist.
  const addButtons = await sup.page.getByRole('button', { name: 'Add part' }).count();
  check('an Add part form is offered for each supplier', addButtons > 0, `found ${addButtons}`);

  // ⚠️ THE CONTROL THAT MAKES THE REST MEAN SOMETHING: really add a part.
  const partNumber = `${STAMP}-PN`;
  await sup.page.locator('#partNumber').first().fill(partNumber);
  await sup.page.locator('#name').first().fill(`${STAMP} Brake Disc`);
  await sup.page.locator('#price').first().fill('88.50');
  await sup.page.getByRole('button', { name: 'Add part' }).first().click();
  await sup.page.waitForTimeout(4000);

  const bodyAfterAdd = (await sup.page.locator('body').textContent()) ?? '';
  check(
    'the new part APPEARS on the page — the form actually wrote something',
    bodyAfterAdd.includes(partNumber),
    bodyAfterAdd.slice(0, 200).replace(/\s+/g, ' '),
  );
  check(
    'and it is labelled Draft, not Live — a supplier cannot publish',
    bodyAfterAdd.includes('Draft'),
  );
  check(
    'the save confirmation explains what happens next',
    /administrator publishes it/i.test(bodyAfterAdd),
  );

  // ═══ 2. the administrator review queue ═══════════════════════════════════
  console.log('\n2. admin-web :3006 /catalogue-and-content/products');
  const adm = await signIn(ADMIN_WEB, 'owner@autoworkshop.local', '/catalogue-and-content/products');
  await assertSignedIn(adm.page, 'administrator');
  check('the page renders — no server-side exception', await rendered(adm.page));

  const queueBody = (await adm.page.locator('body').textContent()) ?? '';
  check(
    'the queue lists the part the supplier just created',
    queueBody.includes(partNumber),
    queueBody.slice(0, 300).replace(/\s+/g, ' '),
  );

  const publishButtons = adm.page.getByRole('button', { name: 'Publish part' });
  const publishCount = await publishButtons.count();
  check('a Publish part control is offered', publishCount > 0, `found ${publishCount}`);

  // ⚠️ FIND THE ROW FOR *THIS* PART rather than pressing the first button.
  // Slice 3b lost time to a harness that used `.first()` and acted on a row an
  // earlier run had left behind, then reported two product defects that did not
  // exist.
  const row = adm.page.locator('li').filter({ hasText: partNumber }).first();
  await row.waitFor({ state: 'attached', timeout: 15000 });
  await row.getByRole('button', { name: 'Publish part' }).click();
  await adm.page.waitForTimeout(4000);

  // ═══ 3. did publication ACTUALLY happen? ═════════════════════════════════
  //
  // The whole slice turns on this. Before migration 025 the same click would
  // have returned 200 and changed nothing, and no screen could have told the
  // difference. So the answer is read from the PUBLIC endpoint — no account, a
  // different code path, and the buyer's actual view of the world.
  console.log('\n3. publication is real, read from the PUBLIC API');
  const publicRes = await fetch(
    `http://localhost:4000/api/v1/public/parts?q=${encodeURIComponent(STAMP)}`,
  );
  const publicJson = await publicRes.json();
  const items = publicJson?.items ?? publicJson?.parts ?? [];
  check(
    'the part is now visible to an anonymous buyer',
    items.some((p) => (p.part_number ?? p.partNumber) === partNumber),
    `status=${publicRes.status} count=${items.length}`,
  );

  // ═══ 4. the fitment rule is VISIBLE, not just enforced ═══════════════════
  console.log('\n4. the published part explains why its compatibility list is locked');
  await sup.page.reload({ waitUntil: 'load' });
  await sup.page.waitForTimeout(2000);
  const supBody = (await sup.page.locator('body').textContent()) ?? '';
  check(
    'the supplier screen names the withdraw route rather than hiding the form',
    /Ask an administrator to withdraw the part/i.test(supBody),
    'a rule whose escape hatch is invisible is a wall',
  );

  // ═══ 5. runtime errors ═══════════════════════════════════════════════════
  console.log('\n5. runtime errors');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 6).join('\n        '));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed   (stamp ${STAMP})`);
process.exit(failures === 0 ? 0 : 1);
