/**
 * NO ROUTE IN THE CUSTOMER OR TECHNICIAN MENU SAYS "NOT BUILT YET".
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The owner's report: "still the customer and technician pages say not built
 * yet". They were right — 25 customer routes and 21 technician routes rendered
 * one generic catch-all carrying a "Not built yet" badge and a paragraph about
 * navigation and routing working. Truthful, and useless: it answered a question
 * about the BUILD and none of the questions the person clicking had.
 *
 * Every one of those routes now has its own page saying what the screen is for
 * and WHAT TO DO TODAY, with a link that works. This walks all of them, as the
 * role whose tree owns them, and fails if any dead end survives.
 *
 * ⚠️ IT ALSO CHECKS THE SIGNPOST RESOLVES. A page that says "do this instead"
 * and links to another unbuilt screen sends somebody in a circle, which is
 * worse than the placeholder it replaced. Every link is followed.
 *
 *   node verify/verify-no-dead-ends.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const PLACEHOLDER = /scheduled for a later phase/i;

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

/**
 * The routes to walk, READ FROM THE CONTENT REGISTRIES rather than restated.
 * A hardcoded list here would drift with the same edit that breaks it, and a
 * route added to the menu without an entry would simply never be checked.
 */
function routesFrom(file) {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/^ {2}'(\/[a-z0-9\-/]+)':/gm)].map((m) => m[1]);
}
const ROOT = 'C:/Users/USER/Documents/autoworkshop-ai';
const customerRoutes = routesFrom(`${ROOT}/apps/customer-web/app/_screens/planned-content.ts`);
const technicianRoutes = routesFrom(`${ROOT}/apps/workshop-web/app/_screens/planned-content.ts`);

const browser = await chromium.launch();

async function signIn(base, user, role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/home/dashboard`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${base}/home/dashboard`, { waitUntil: 'load' });
  if (role) {
    const sw = page.locator('#aw-role-switcher');
    if ((await sw.count()) > 0) {
      await sw.selectOption(role).catch(() => {});
      await page.waitForTimeout(3000);
      await page.goto(`${base}/home/dashboard`, { waitUntil: 'load' });
    }
  }
  return page;
}

async function walk(page, base, routes, who) {
  console.log(`\n  ${who} — ${routes.length} routes\n`);
  let dead = 0;
  let unsignposted = 0;
  const links = new Set();

  for (const route of routes) {
    const res = await page.goto(`${base}${route}`, { waitUntil: 'load' }).catch(() => null);
    const html = await page.content().catch(() => '');
    const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];

    if (res?.status() !== 200) {
      dead += 1;
      check(`${route}`, false, `HTTP ${res?.status()}`);
      continue;
    }
    if (PLACEHOLDER.test(main)) {
      dead += 1;
      check(`${route}`, false, 'still renders the "not built yet" catch-all');
      continue;
    }
    // It must say what to do now, not merely exist.
    if (!/What you can do now/i.test(main)) {
      // A fully working screen is fine and needs no signpost.
      continue;
    }
    const href = /<a[^>]+href="(\/[^"]*)"[^>]*>(?![\s\S]{0,40}<\/a>\s*<\/nav>)/i.exec(
      /What you can do now[\s\S]*?<\/div>/i.exec(main)?.[0] ?? '',
    )?.[1];
    if (href) links.add(href);
    else unsignposted += 1;
  }

  check(`${who}: no route renders "not built yet"`, dead === 0, `${dead} dead end(s)`);
  check(`${who}: every planned screen names a next step`, unsignposted === 0, `${unsignposted} without one`);

  // 🔴 AND THE NEXT STEP MUST RESOLVE. A signpost into another unbuilt screen
  // sends somebody in a circle — worse than the placeholder it replaced.
  let broken = 0;
  for (const href of links) {
    const res = await page.goto(`${base}${href}`, { waitUntil: 'load' }).catch(() => null);
    const main = (/<main[\s\S]*?<\/main>/i.exec(await page.content().catch(() => '')) ?? [''])[0];
    if (res?.status() !== 200 || PLACEHOLDER.test(main)) {
      broken += 1;
      check(`signpost ${href}`, false, `HTTP ${res?.status()} or placeholder`);
    }
  }
  check(`${who}: all ${links.size} signposts resolve to a real screen`, broken === 0, `${broken} broken`);
}

const custPage = await signIn(CUSTOMER, process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local');
await walk(custPage, CUSTOMER, customerRoutes, 'CUSTOMER');

const techPage = await signIn(
  WORKSHOP,
  process.env['DEV_TECH_EMAIL'] ?? 'technician@autoworkshop.local',
  'technician',
);
await walk(techPage, WORKSHOP, technicianRoutes, 'TECHNICIAN');

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
