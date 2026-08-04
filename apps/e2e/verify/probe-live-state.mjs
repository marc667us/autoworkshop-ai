/**
 * WHAT IS ACTUALLY TRUE ON PRODUCTION RIGHT NOW.
 *
 * Written because "test the live site with sample data" cannot be answered
 * without first establishing what data exists — and the honest answer has been
 * changing. It signs in as the owner, reads the API's own view of the world and
 * prints it. It CREATES NOTHING.
 *
 * The questions, in the order they gate each other:
 *
 *   1. Can anybody sign in at all?
 *   2. Does the owner's account hold a MEMBERSHIP — i.e. does a workshop exist?
 *      Without one every workshop screen correctly shows zero, and a "test"
 *      that reports empty screens is measuring the absence of a migration.
 *   3. What can the authenticated API actually answer?
 *
 *   node verify/probe-live-state.mjs
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['LIVE_WORKSHOP_URL'] ?? 'https://autoworkshop.aiappinvent.com';
const USER = process.env['LIVE_OWNER_EMAIL'] ?? 'marc667us@yahoo.com';
const PASSWORD = process.env['LIVE_OWNER_PASSWORD'] ?? '';

if (!PASSWORD) {
  console.log('Set LIVE_OWNER_PASSWORD. Nothing was attempted.');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

function say(k, v) {
  console.log(`  ${String(k).padEnd(34)} ${v}`);
}

console.log(`\nLIVE STATE — ${WORKSHOP}, as ${USER}\n`);

await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
const signInLink = page.getByRole('link', { name: 'Sign in' }).first();
if ((await signInLink.count()) === 0) {
  say('sign-in link', 'ABSENT — already signed in, or the shell did not render');
} else {
  await signInLink.click();
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  if (await provider.count()) await provider.click({ noWaitAfter: true });

  // ⚠️ The live realm's login form is not assumed to be the dev one. `#username`
  // timed out here once already; try the id, then the name attribute, and SAY
  // which was found rather than failing with a bare timeout.
  await page.waitForURL(/openid-connect\/auth/, { timeout: 120000 }).catch(() => {});
  const byId = page.locator('#username');
  const byName = page.locator('input[name="username"]');
  const field = (await byId.count()) ? byId : byName;
  await field.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  if ((await field.count()) === 0) {
    say('keycloak login form', `NOT FOUND at ${page.url()}`);
    console.log('\n  page text:', (await page.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
    await browser.close();
    process.exit(1);
  }
  await field.fill(USER);
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page.locator('#kc-login, input[type="submit"], button[type="submit"]').first()
    .click({ noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 120000 }).catch(() => {});
}

await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
const html = await page.content();
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

say('signed in', /Sign out/i.test(html) && !/Not signed in/i.test(html) ? 'YES' : 'NO');
say('shows "Not signed in"', /Not signed in/i.test(html) ? 'YES (auth reached the API and failed)' : 'no');
say('onboarding form shown', /create your workshop|Register your workshop|workshop name/i.test(text) ? 'YES — NO WORKSHOP EXISTS' : 'no');
say('dashboard tiles present', /Active job cards/i.test(text) ? 'YES' : 'no');

const m = /Active job cards\s*(\d+)/i.exec(text);
say('active job cards', m ? m[1] : '(not rendered)');

// What the workshop menu offers this identity — proof of which tree resolved.
say('role switcher', html.includes('aw-role-switcher') ? 'present' : 'absent (one membership or none)');
say('page errors', errors.length ? errors.join(' | ').slice(0, 200) : 'none');

console.log('\n  first 600 chars of the dashboard:\n');
console.log('  ' + text.slice(0, 600));

await browser.close();
console.log();
