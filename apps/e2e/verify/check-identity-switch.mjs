/**
 * Reproduce and disprove "I logged in as admin but it shows technician".
 *
 * Signs in as one identity, then — IN THE SAME BROWSER CONTEXT, without signing out —
 * goes back to the sign-in page and signs in as another. Without `prompt=login`,
 * Keycloak honours the existing SSO session and returns the FIRST identity silently;
 * the menu is then quietly the wrong one and nothing says so.
 */
import { chromium } from '@playwright/test';
const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = 'Change_me_locally1!';

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await c.newPage();

async function signIn(user) {
  await p.goto(`${BASE}/home/dashboard`, { waitUntil: 'load' });
  const link = p.getByRole('link', { name: 'Sign in' });
  if ((await link.count()) === 0) return 'ALREADY SIGNED IN — no sign-in link offered';
  await link.first().click();
  const pv = p.getByRole('button', { name: /Keycloak/i });
  if (await pv.count()) await pv.first().click({ noWaitAfter: true });
  await p.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await p.fill('#username', user);
  await p.fill('#password', PASSWORD);
  await p.click('#kc-login', { noWaitAfter: true });
  await p.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  return 'signed in';
}

async function whoAmI() {
  const r = await p.goto(`${BASE}/api/auth/session`, { waitUntil: 'load' });
  const body = await p.locator('body').innerText();
  try {
    const j = JSON.parse(body);
    return `${j?.user?.email ?? j?.user?.name ?? '(no user)'}`;
  } catch { return `HTTP ${r?.status()} ${body.slice(0, 80)}`; }
}

console.log('\n1. sign in as the technician');
await signIn('technician@autoworkshop.local');
console.log(`   session says: ${await whoAmI()}`);

console.log('\n2. WITHOUT signing out, sign in again as the admin');
// Auth.js offers sign-in at its own route when a session already exists.
await p.goto(`${BASE}/api/auth/signin`, { waitUntil: 'load' });
const kc = p.getByRole('button', { name: /Keycloak/i });
if (await kc.count()) {
  await kc.first().click({ noWaitAfter: true });
  const landed = await p.waitForURL(/openid-connect\/auth/, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!landed) {
    console.log('   ⚠️ Keycloak returned WITHOUT prompting — the SSO session carried over');
  } else {
    console.log('   Keycloak PROMPTED for credentials (prompt=login is working)');
    await p.fill('#username', 'admin@autoworkshop.local');
    await p.fill('#password', PASSWORD);
    await p.click('#kc-login', { noWaitAfter: true });
    await p.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  }
} else {
  console.log('   (no Keycloak button on the sign-in page)');
}
console.log(`   session says: ${await whoAmI()}`);
await b.close();
