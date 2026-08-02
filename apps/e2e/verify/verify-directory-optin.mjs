/**
 * The mechanic directory opt-in, THROUGH THE BROWSER — Slice C.
 *
 * The rule that matters is about WHO, so this drives TWO identities: the
 * workshop owner who may publish, and a technician in the same organisation who
 * may not. A single-identity run would exercise the form and silently skip the
 * only security-relevant assertion — the failure mode this repository has
 * recorded against three previous slices.
 *
 * ⚠️ AND IT READS THE PUBLIC API AT THE END. "Published" is a claim; the
 * buyer's view is the evidence. An UPDATE that matched no policy would leave
 * the screen looking identical and raise nothing.
 *
 *   node verify/verify-directory-optin.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
/**
 * ⚠️ THE ADMINISTRATOR'S ROUTE, NOT THE OWNER'S. `owner@autoworkshop.local`
 * resolves as `platform_administrator` (the strongest role it holds, by
 * ROLE_PRECEDENCE), and `navRoleFor` returns undefined for it — which is the
 * DEFAULT §34 tree, i.e. `/settings/...`. The §46 owner tree's
 * `/workshop-management/workshop-profile` belongs to `workshop_owner`.
 *
 * The first run of this script used the owner path and got a page that rendered
 * nothing. Both routes exist; this one is the one THIS identity can reach.
 */
const ROUTE = '/settings/workshop-profile';
const OWNER_TREE_ROUTE = '/workshop-management/workshop-profile';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const STAMP = `DIR-${Date.now().toString(36).toUpperCase()}`;

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

async function signIn(user, landing) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // ⚠️ A 404 RESOURCE LOG IS EXPECTED HERE AND IS NOT A DEFECT. This script
    // navigates to the route BEFORE signing in (a signed-out viewer holds no
    // grants, so `requireNavRoute` 404s it), and it deliberately drives a
    // technician to a route outside their navigation tree. Both log
    // "Failed to load resource: ... 404". Counting them made the run fail on its
    // own fixtures — a check has to exclude what it asked for, or it measures
    // the harness rather than the product.
    if (/Failed to load resource.*404/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${WORKSHOP}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  // `waitFor`, not `count()` — count does not auto-wait and the race silently
  // continues as an anonymous visitor.
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${WORKSHOP}${landing}`, { waitUntil: 'load' });
  return { ctx, page };
}

const rendered = async (page) => {
  const b = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  return !b.includes('server-side exception') && !b.includes('internal server error');
};

/**
 * ⚠️ THE ENDPOINT RETURNS A BARE ARRAY, and assuming `{items:[…]}` made every
 * public assertion in this file VACUOUS on its first run: `json.items` was
 * undefined, so the list was always empty, so "not public" passed for a listing
 * that was in fact live. Measured against the running API rather than assumed
 * the second time.
 */
const publicMechanics = async (stamp) => {
  const res = await fetch(
    `http://localhost:4000/api/v1/public/mechanics?q=${encodeURIComponent(stamp)}`,
  );
  const json = await res.json();
  const items = Array.isArray(json) ? json : (json?.items ?? json?.mechanics ?? []);
  return { status: res.status, items };
};

/**
 * ⚠️ NORMALISE THE STARTING STATE. There is ONE directory row per organization
 * (`uq_directory_org`), so it survives between runs — and a previous run leaves
 * it PUBLISHED. Starting from that state, "save then publish" finds a Withdraw
 * button and the run dies. Slice 3b lost time to exactly this: a harness
 * measuring residue it left itself.
 */
async function ensureWithdrawn(page) {
  const withdraw = page.getByRole('button', { name: /Withdraw from the directory/i });
  if ((await withdraw.count()) > 0) {
    await withdraw.click();
    await page.waitForTimeout(3500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
  }
}

const nameOf = (m) => String(m.trading_name ?? m.tradingName ?? '');

try {
  // ═══ 1. the owner ════════════════════════════════════════════════════════
  console.log('\n1. owner@ — may publish the workshop');
  const owner = await signIn('owner@autoworkshop.local', ROUTE);
  const ownerHtml = await owner.page.content();
  check(
    'the session is real',
    ownerHtml.includes('Sign out') && !ownerHtml.includes('Not signed in'),
    'NOT SIGNED IN — everything below would fail for the wrong reason',
  );
  check('the page renders — no server-side exception', await rendered(owner.page));
  check(
    'the directory heading is present, so the route resolved',
    (await owner.page.getByRole('heading', { name: /directory/i }).count()) > 0,
    owner.page.url(),
  );

  await ensureWithdrawn(owner.page);

  // CONTROL: fill and save. Every assertion after this depends on it.
  const name = `${STAMP} Garage`;
  await owner.page.locator('#tradingName').fill(name);
  await owner.page.locator('#city').fill('Accra');
  await owner.page.locator('#country').fill('GH');
  await owner.page.locator('#publicPhone').fill('+233000000123');
  // A DUPLICATE is submitted deliberately — the API de-duplicates.
  await owner.page.locator('#services').fill('Diagnostics, Brakes, Diagnostics');
  await owner.page.getByRole('button', { name: 'Save details' }).click();
  await owner.page.waitForTimeout(4000);

  let body = (await owner.page.locator('body').textContent()) ?? '';
  check('saving works', /Saved\./i.test(body), body.slice(0, 200).replace(/\s+/g, ' '));
  check(
    'and saving does NOT publish — the two are separate actions',
    /nothing has changed for the public/i.test(body),
  );

  const beforePublish = await publicMechanics(STAMP);
  check(
    'a saved but unpublished listing is NOT public',
    !beforePublish.items.some((m) => nameOf(m).includes(STAMP)),
    `count=${beforePublish.items.length}`,
  );

  await owner.page.reload({ waitUntil: 'load' });
  await owner.page.waitForTimeout(1500);
  await owner.page.getByRole('button', { name: /Publish to the directory/i }).click();
  await owner.page.waitForTimeout(4000);
  body = (await owner.page.locator('body').textContent()) ?? '';
  check(
    'the owner can publish',
    /now listed publicly/i.test(body),
    body.slice(0, 200).replace(/\s+/g, ' '),
  );

  // ═══ 2. is it REALLY public? ═════════════════════════════════════════════
  console.log('\n2. read from the PUBLIC API — no account');
  const afterPublish = await publicMechanics(STAMP);
  const mine = afterPublish.items.find((m) => nameOf(m).includes(STAMP));
  check(
    'an anonymous visitor can find the workshop',
    Boolean(mine),
    `status=${afterPublish.status} count=${afterPublish.items.length}`,
  );
  const services = mine?.services ?? [];
  check(
    'the duplicate service was de-duplicated',
    services.filter((s) => s === 'Diagnostics').length <= 1,
    JSON.stringify(services),
  );

  // ═══ 3. the technician ═══════════════════════════════════════════════════
  console.log('\n3. technician@ — same organisation, may NOT publish');
  const tech = await signIn('technician@autoworkshop.local', '/home/dashboard');
  const resp = await tech.page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
  const techBody = (await tech.page.locator('body').textContent()) ?? '';
  // §46's Workshop Management group belongs to the OWNER tree; a technician
  // reads §49, so `requireNavRoute` should 404 this route for them. Either
  // outcome is acceptable — what must NOT happen is a working Publish button.
  const notFound = resp?.status() === 404 || /not found/i.test(techBody);
  void OWNER_TREE_ROUTE;
  const publishOffered =
    (await tech.page.getByRole('button', { name: /Publish to the directory/i }).count()) > 0;
  check(
    'a technician is not offered a working publish control',
    notFound || !publishOffered,
    `status=${resp?.status()} publishButtonPresent=${publishOffered}`,
  );
  if (notFound) {
    check('the route 404s for a technician — it is not in their navigation tree', true);
  } else {
    check(
      'and the screen names who can change it',
      /Only the workshop owner/i.test(techBody),
      techBody.slice(0, 200).replace(/\s+/g, ' '),
    );
  }

  // ═══ 4. withdrawal ═══════════════════════════════════════════════════════
  console.log('\n4. opt-in is reversible');
  await owner.page.reload({ waitUntil: 'load' });
  await owner.page.waitForTimeout(1500);
  await owner.page.getByRole('button', { name: /Withdraw from the directory/i }).click();
  await owner.page.waitForTimeout(4000);
  body = (await owner.page.locator('body').textContent()) ?? '';
  check(
    'the owner can withdraw',
    /withdrawn and is no longer public/i.test(body),
    body.slice(0, 200).replace(/\s+/g, ' '),
  );

  const afterWithdraw = await publicMechanics(STAMP);
  check(
    'and it disappears from the PUBLIC directory',
    !afterWithdraw.items.some((m) => nameOf(m).includes(STAMP)),
    `count=${afterWithdraw.items.length}`,
  );

  console.log('\n5. runtime errors');
  check(
    'no page errors or console errors',
    errors.length === 0,
    errors.slice(0, 6).join('\n        '),
  );
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed   (stamp ${STAMP})`);
process.exit(failures === 0 ? 0 : 1);
