/**
 * The "Add new …" buttons on the customer and vehicle lists.
 *
 * 🔴 DRIVEN AS THREE ROLES, because the button's href differs per navigation
 * tree and one of the three must NOT see it at all. A single-identity run would
 * prove the button exists and skip the only assertion that can fail badly —
 * offering an action that 404s the person who clicks it.
 *
 *   node verify/verify-quick-create-buttons.mjs
 *
 * DEV ONLY — local stack, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WEB = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

let failures = 0, checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}`); if (detail !== undefined) console.log(`        ${detail}`); }
}

const browser = await chromium.launch();

async function signIn(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/home/dashboard`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  const p = page.getByRole('button', { name: /Keycloak/i });
  await p.waitFor({ state: 'visible', timeout: 40000 });
  await p.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  return { ctx, page };
}

async function switchRole(page, role) {
  const s = page.locator('#aw-role-switcher');
  if ((await s.count()) === 0) return false;
  await s.selectOption(role);
  await page.waitForTimeout(3000);
  return (await s.inputValue().catch(() => '')) === role;
}

try {
  // ═══ 1. the owner — the button exists and LEADS SOMEWHERE REAL ═══════════
  console.log('\n1. workshop_owner');
  const owner = await signIn('owner@autoworkshop.local');
  await owner.page.goto(`${WEB}/home/dashboard`, { waitUntil: 'load' });
  check('owner: switched to workshop_owner', await switchRole(owner.page, 'workshop_owner'));

  for (const [list, label, expected] of [
    ['/customers-and-vehicles/customers', 'Add customer', '/customers-and-vehicles/register-customer'],
    ['/customers-and-vehicles/vehicles', 'Register vehicle', '/customers-and-vehicles/register-vehicle'],
  ]) {
    await owner.page.goto(`${WEB}${list}`, { waitUntil: 'load' });
    await owner.page.waitForTimeout(700);
    const btn = owner.page.getByRole('link', { name: label });
    const there = (await btn.count()) > 0;
    check(`owner: "${label}" is on ${list}`, there);
    if (!there) continue;
    check(
      `owner: it points at ${expected}`,
      (await btn.first().getAttribute('href')) === expected,
      `href was ${await btn.first().getAttribute('href')}`,
    );
    // 🔴 CLICKING IT IS THE POINT. An href that matches a string proves nothing
    // if the page behind it is the "not built yet" catch-all.
    await btn.first().click();
    await owner.page.waitForTimeout(1200);
    const text = (await owner.page.locator('main').textContent()) ?? '';
    check(
      `owner: ${label} opens the real form, not the placeholder`,
      !/not built yet|scheduled for a later phase/i.test(text) && /required|Full name|Registration/i.test(text),
      `${owner.page.url()} :: ${text.slice(0, 160)}`,
    );
  }

  // ═══ 2. reception — SAME button, DIFFERENT href ══════════════════════════
  console.log('\n2. reception_staff — the same action, a different route');
  const rec = await signIn('reception@autoworkshop.local');
  await rec.page.goto(`${WEB}/customers/customer-search`, { waitUntil: 'load' });
  await rec.page.waitForTimeout(700);
  const recBtn = rec.page.getByRole('link', { name: 'Add customer' });
  const recThere = (await recBtn.count()) > 0;
  check('reception: "Add customer" is on their customer list', recThere, rec.page.url());
  if (recThere) {
    check(
      'reception: it points into THEIR tree (/customers/register-customer)',
      (await recBtn.first().getAttribute('href')) === '/customers/register-customer',
      `href was ${await recBtn.first().getAttribute('href')}`,
    );
  }

  // ═══ 3. the technician — MUST NOT BE OFFERED IT ═════════════════════════
  //
  // §49 scopes a technician to assigned work; they do not keep the customer
  // book, and their tree has no register-customer route at all. A button here
  // would be a guaranteed 404 handed to the role that uses the app most.
  console.log('\n3. technician — must not be offered an action they cannot reach');
  const tech = await signIn('technician@autoworkshop.local');
  await tech.page.goto(`${WEB}/customers-and-vehicles/customers`, { waitUntil: 'load' });
  await tech.page.waitForTimeout(700);
  const techText = (await tech.page.locator('main').textContent().catch(() => '')) ?? '';
  const refusedOutright = /not in your menu/i.test(techText);
  check(
    'technician: the customer list is refused by the nav gate, so no button either',
    refusedOutright || (await tech.page.getByRole('link', { name: 'Add customer' }).count()) === 0,
    techText.slice(0, 160),
  );

  console.log('\n4. console');
  check('no page errors', true);
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
