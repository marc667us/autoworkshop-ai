/**
 * Prove "Switch user" actually changes identity — the fix for
 * "i logged in as admin but it show technician".
 *
 * Signs in as the technician, presses Switch user, then signs in as the admin IN THE
 * SAME BROWSER. Before the fix the second sign-in returned the technician silently,
 * because Keycloak honours its own SSO session and the app never ended it.
 */
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3001', PASSWORD = 'Change_me_locally1!';
let fails = 0;
const check = (l, ok, d) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}`); if (!ok) { fails++; if (d) console.log(`        ${d}`); } };

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

async function keycloakSignIn(user) {
  await p.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await p.fill('#username', user);
  await p.fill('#password', PASSWORD);
  await p.click('#kc-login', { noWaitAfter: true });
  await p.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
}
async function whoAmI() {
  await p.goto(`${BASE}/api/auth/session`, { waitUntil: 'load' });
  try { return JSON.parse(await p.locator('body').innerText())?.user?.email ?? '(none)'; } catch { return '(none)'; }
}

await p.goto(`${BASE}/home/dashboard`);
await p.getByRole('link', { name: 'Sign in' }).first().click();
const kc = p.getByRole('button', { name: /Keycloak/i });
if (await kc.count()) await kc.first().click({ noWaitAfter: true });
await keycloakSignIn('technician@autoworkshop.local');
const first = await whoAmI();
check('signed in as the technician', first.startsWith('technician'), first);

await p.goto(`${BASE}/home/dashboard`, { waitUntil: 'load' });
const sw = p.getByRole('button', { name: /sign in as somebody else/i });
check('the shell offers "Switch user"', (await sw.count()) > 0);
if ((await sw.count()) === 0) { await b.close(); process.exit(1); }

await sw.first().click({ noWaitAfter: true });
// It signs out completely and lands on the sign-in page. Settle there before asserting
// anything — the chain is app -> Keycloak end-session -> back, three redirects deep.
await p.waitForURL(/\/api\/auth\/signin|openid-connect|localhost:3001/, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(1500);

// ⚠️ THE SESSION MUST BE GONE BEFORE THE NEXT SIGN-IN MEANS ANYTHING. This is the
// assertion that distinguishes the fix from the bug: the bug was that the SSO session
// survived, so whatever came next returned the old identity.
const between = await whoAmI();
check('Switch user ended the session completely', between === '(none)', between);

// Start a fresh sign-in from a landing page, the way a person would.
await p.goto(`${BASE}/home/dashboard`, { waitUntil: 'load' });
const link2 = p.getByRole('link', { name: 'Sign in' });
check('and the shell now offers Sign in again', (await link2.count()) > 0);
if ((await link2.count()) > 0) await link2.first().click();
const kc2 = p.getByRole('button', { name: /Keycloak/i });
if (await kc2.count()) await kc2.first().click({ noWaitAfter: true });

// ⚠️ THE ASSERTION THE WHOLE FIX EXISTS FOR: Keycloak must ASK, not return silently.
const prompted = await p.waitForURL(/openid-connect\/auth/, { timeout: 30000 }).then(() => true).catch(() => false);
check('⚠️ Keycloak asks who is signing in — the SSO session did NOT carry over', prompted);
if (prompted) {
  const hasUsername = (await p.locator('#username').count()) > 0;
  check('and it offers a USERNAME field, not a pre-filled re-authentication', hasUsername);
  if (hasUsername) await keycloakSignIn('admin@autoworkshop.local');
}
const second = await whoAmI();
check('⚠️ the session is now the ADMIN, not the technician', second.startsWith('admin'), second);

await p.goto(`${BASE}/repair-services/repairs-in-progress`, { waitUntil: 'load' });
check('and the admin tree renders', (await p.locator('h1').first().textContent() ?? '').includes('Repairs'), await p.locator('h1').first().textContent());

await b.close();
console.log(fails === 0 ? '\nAll checks passed\n' : `\n${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
