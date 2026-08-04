/**
 * IS IT ACTUALLY SINGLE SIGN-ON? — measured, in one browser, across two apps.
 *
 * ── THE COMPLAINT THIS EXISTS TO SETTLE ────────────────────────────────────
 *
 * "at the moment there many sign ins by one user". The seven-app decision
 * (`01 (1).txt` §86) gives each Next app its own Auth.js instance and its own
 * session cookie, so moving between apps means each one must establish its own
 * session. The QUESTION — and nobody had measured it — is what that costs the
 * person:
 *
 *   ONE PASSWORD ENTRY, then silent redirects?  That is SSO working. Keycloak
 *   holds the identity-provider session and returns a code without prompting.
 *
 *   A PASSWORD PROMPT PER APP?                  That is not SSO at all, and the
 *                                               complaint is exact.
 *
 * The difference is invisible from the code and obvious in a browser, which is
 * why this drives one.
 *
 * ⚠️ ONE BROWSER CONTEXT THROUGHOUT. A fresh context per app would discard the
 * Keycloak SSO cookie and manufacture the very failure being investigated —
 * every app would prompt, and the run would "prove" a defect that the harness
 * had caused.
 *
 *   node verify/verify-single-sign-on.mjs
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const USER = process.env['DEV_SSO_EMAIL'] ?? 'owner@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

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
// ONE context for the whole run — see the header.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

let passwordPrompts = 0;
let signInClicks = 0;

/**
 * Establish a session on one app, counting what the human had to do.
 * Returns how many times a password had to be typed for THIS app.
 */
async function enter(base, label) {
  await page.goto(`${base}/home/dashboard`, { waitUntil: 'load' });
  let html = await page.content();

  if (/Sign out/i.test(html) && !/Not signed in/i.test(html)) {
    console.log(`  ${label}: already signed in, no interaction at all`);
    return 0;
  }

  const link = page.getByRole('link', { name: 'Sign in' }).first();
  if ((await link.count()) === 0) {
    console.log(`  ${label}: no sign-in link and no session — unexpected`);
    return 0;
  }
  signInClicks += 1;
  await link.click();

  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  if (await provider.count()) await provider.click({ noWaitAfter: true });

  // Did Keycloak ask for credentials, or return silently on its SSO session?
  // A short wait: if the identity-provider session is live the redirect happens
  // immediately and no password field ever appears.
  const pw = page.locator('#password, input[name="password"]');
  const asked = await pw
    .waitFor({ state: 'visible', timeout: 12000 })
    .then(() => true)
    .catch(() => false);

  if (asked) {
    passwordPrompts += 1;
    await page.locator('#username, input[name="username"]').first().fill(USER);
    await pw.first().fill(PASSWORD);
    await page.locator('#kc-login, button[type="submit"]').first().click({ noWaitAfter: true });
    console.log(`  ${label}: PASSWORD PROMPTED`);
  } else {
    console.log(`  ${label}: no password prompt — Keycloak returned on its SSO session`);
  }

  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 }).catch(() => {});
  await page.goto(`${base}/home/dashboard`, { waitUntil: 'load' });
  html = await page.content();
  check(`${label}: session established`, /Sign out/i.test(html) && !/Not signed in/i.test(html));
  return asked ? 1 : 0;
}

console.log(`\nSINGLE SIGN-ON — one browser, two apps, as ${USER}\n`);

await enter(WORKSHOP, 'workshop-web (:3001)');
await enter(CUSTOMER, 'customer-web (:3000)');

// ── going BACK must not sign you out or re-prompt ─────────────────────────
await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
const back = await page.content();
check(
  'returning to the first app is still signed in',
  /Sign out/i.test(back) && !/Not signed in/i.test(back),
  'the second app displaced the first session — cookies are colliding',
);

console.log(`\n  password prompts : ${passwordPrompts}`);
console.log(`  "Sign in" clicks : ${signInClicks}`);

check(
  '🔴 the password is typed ONCE across both apps',
  passwordPrompts <= 1,
  `typed ${passwordPrompts} times — Keycloak is not carrying the SSO session between apps`,
);
// Clicking "Sign in" once per app is a SEPARATE, lesser problem from typing a
// password once per app. Reported apart so a fix for one is not mistaken for a
// fix for the other.
check(
  'entering the second app needed no extra click',
  signInClicks <= 1,
  `${signInClicks} clicks — each app still makes the user start sign-in itself`,
);

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
