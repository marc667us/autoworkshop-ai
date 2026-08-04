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

// ── 🔴 IS THE GREEN ABOVE REAL SSO, OR COOKIE SHARING? ────────────────────
//
// On localhost COOKIES IGNORE THE PORT, so `:3001`'s session cookie is sent to
// `:3000` unchanged. Every check above then passes for the WRONG REASON — the
// second app is not doing SSO, it is reading the first app's session. In
// production the apps sit on different hosts where that cannot happen, so this
// suite would otherwise report an experience no real user has ever had.
//
// The session cookie must be workspace-scoped. Until it is, this check FAILS on
// purpose: a green run that depends on a dev-only accident is worse than a red
// one that names it.
const jar = await ctx.cookies();
const sessionCookies = jar.filter((c) => /authjs\.session-token/.test(c.name));
const scoped = sessionCookies.every((c) => /session-token\.(workshop|customer)/.test(c.name));
check(
  '🔴 the session cookie is scoped to ONE workspace',
  sessionCookies.length > 0 && scoped,
  `shared cookie name(s): ${sessionCookies.map((c) => c.name).join(', ')} on domain=` +
    `${sessionCookies[0]?.domain} — cookies ignore the PORT, so every app on localhost reads ` +
    'this one session. The checks above pass for the wrong reason.',
);

console.log(`\n  password prompts : ${passwordPrompts}`);
console.log(`  "Sign in" clicks : ${signInClicks}`);

check(
  '🔴 the password is typed ONCE across both apps',
  passwordPrompts <= 1,
  `typed ${passwordPrompts} times — Keycloak is not carrying the SSO session between apps`,
);
// ── ONE CLICK PER APP IS THE CORRECT STATE, NOT A DEFECT ──────────────────
//
// This used to assert `<= 1` and it was asserting the BUG: a single click
// worked only because both apps shared one cookie on localhost, which is the
// cross-workspace session this suite now refuses. With per-workspace cookies
// each app establishes its own session, so each needs its own start — and
// Keycloak makes it PASSWORD-FREE, which is what single sign-on actually means.
//
// So the assertion is that sign-in is never started MORE than once per app.
// More than that would mean a session failed to persist and the user was sent
// round again, which is a real defect and this still catches it.
//
// ⚠️ REMAINING, AND DELIBERATELY NOT DONE HERE: auto-initiating the redirect so
// the second app needs no click at all. It has to skip the public routes — the
// marketplace, the VIN search and the landing are all reachable signed out —
// and an unconditional redirect there is a loop on the front door. A middleware
// change in this repo has already crashed the edge runtime after passing
// typecheck, lint and build.
const APPS_VISITED = 2;
check(
  'sign-in is started at most once per app',
  signInClicks <= APPS_VISITED,
  `${signInClicks} clicks across ${APPS_VISITED} apps — a session is not persisting`,
);
console.log(
  `  note: ${signInClicks} click(s) for ${APPS_VISITED} apps, ${passwordPrompts} password(s). ` +
    'Password-free re-entry IS the single sign-on. Removing the click needs ' +
    'auto-initiate, which must not fire on the public routes.',
);

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
