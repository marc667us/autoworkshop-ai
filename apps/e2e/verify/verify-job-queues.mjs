/**
 * The job queues, through a browser — every route, as the role that owns it.
 *
 * 🔴 THE ROLE IS PART OF THE TEST, NOT AN OBSTACLE TO IT. Every one of these
 * routes lives in exactly one role's navigation tree, and `requireNavRoute`
 * correctly refuses it to anybody else. A first run of this check drove them
 * all as a platform administrator and reported 1 of 14 — which looked like
 * thirteen broken screens and was thirteen correct refusals. Driving each route
 * as its own role is what makes a PASS mean "the screen works" instead of
 * "the guard happened to let me in".
 *
 * `owner@` holds three memberships and defaults to platform_administrator by
 * ROLE_PRECEDENCE, so owner-tree routes need the switcher — the same thing a
 * real owner does.
 *
 *   node verify/verify-job-queues.mjs
 *
 * DEV ONLY — real Keycloak sign-in against the local stack.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ⚠️ THE DEFINITIONS ARE READ AS SOURCE, NOT IMPORTED. They live in a
// TypeScript file and this is a plain Node script — `import` of a `.ts` module
// fails at run time. Parsing the literal keeps the expectation tied to the one
// place the queues are defined, without a build step for one script.
const DEFS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../workshop-web/app/_screens/job-queue-definitions.ts'),
  'utf8',
);
function definitionFor(route) {
  // The route is used literally: `/` and `-` carry no special meaning outside a
  // character class, so no escaping is needed and adding some (as a first
  // version did) corrupts the pattern into one that matches nothing — which
  // reported every route as "not this queue" while every route was correct.
  const block = new RegExp(`'${route}': \\{([\\s\\S]*?)\\n  \\},`).exec(DEFS);
  if (!block) return null;
  const pick = (key) => {
    const m = new RegExp(`${key}:\\s*\\n?\\s*'([^']*)'`).exec(block[1]);
    return m ? m[1] : null;
  };
  return { description: pick('description'), emptyTitle: pick('emptyTitle') };
}

// Proves the parser found something before any route is driven. Without this a
// broken pattern reads as fourteen broken screens — which is exactly what the
// first version reported.
for (const probe of ['/my-jobs/awaiting-parts', '/home/tasks']) {
  const d = definitionFor(probe);
  if (!d?.description) {
    console.error(`  the definitions parser could not read ${probe} — fix the script, not the app`);
    process.exit(1);
  }
}

const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/** route -> the identity and acting role whose menu carries it. */
const ROUTES = [
  ['/my-jobs/inspection-required', 'technician@autoworkshop.local', null],
  ['/my-jobs/diagnosis-required', 'technician@autoworkshop.local', null],
  ['/my-jobs/repair-approved', 'technician@autoworkshop.local', null],
  ['/my-jobs/repair-in-progress', 'technician@autoworkshop.local', null],
  ['/my-jobs/testing-required', 'technician@autoworkshop.local', null],
  ['/my-jobs/quality-control-returns', 'technician@autoworkshop.local', null],
  ['/my-jobs/awaiting-parts', 'technician@autoworkshop.local', null],
  ['/repair-control/ready-for-collection', 'owner@autoworkshop.local', 'workshop_owner'],
  ['/repair-control/customer-approvals', 'owner@autoworkshop.local', 'workshop_owner'],
  ['/workshop-operations/repair-requests', 'owner@autoworkshop.local', 'workshop_owner'],
  ['/workshop-operations/customer-complaints', 'owner@autoworkshop.local', 'workshop_owner'],
  ['/repair-control/internal-review', 'manager@autoworkshop.local', null],
  ['/home/my-tasks', 'manager@autoworkshop.local', null],
  ['/home/tasks', 'owner@autoworkshop.local', null],
];

let checks = 0;
let failures = 0;
const errors = [];

function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
  }
}

const browser = await chromium.launch();

async function sessionFor(user, actAs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${user}: ${e}`));

  await page.goto(`${BASE}/home/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /^Sign in$/i }).first().click();
  await page.waitForTimeout(1500);
  if (page.url().includes('/api/auth/signin')) {
    await page.click('button[type="submit"], form button');
    await page.waitForTimeout(2500);
  }
  if (page.url().includes(':8080')) {
    await page.fill('#username', user);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login');
    await page.waitForTimeout(6000);
  }
  if (actAs) {
    const switcher = page.locator('#aw-role-switcher');
    if ((await switcher.count()) > 0) {
      await switcher.selectOption(actAs);
      await page.waitForTimeout(2500);
    }
  }
  return { ctx, page };
}

// One session per (identity, role) rather than one per route: signing in
// fourteen times is slow and proves nothing extra.
const sessions = new Map();
for (const [route, user, actAs] of ROUTES) {
  const key = `${user}|${actAs ?? ''}`;
  if (!sessions.has(key)) sessions.set(key, await sessionFor(user, actAs));
  const { page } = sessions.get(key);

  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  const main = page.locator('main');
  const text = (
    (await main.count()) ? await main.innerText().catch(() => '') : ''
  ).replace(/\s+/g, ' ');

  // Three distinct wrong outcomes, named separately so a failure says which.
  const placeholder = /scheduled for a later phase/i.test(text);
  const refused = /not in your menu/i.test(text);
  // A real queue renders either rows ("N jobs") or its own empty sentence.
  const real = /\d+ jobs?\b|Nothing|No inspections|No diagnoses|No repairs|No complaints|No new requests/i.test(text);

  // 🔴 AND IT MUST BE THIS QUEUE, NOT JUST *A* QUEUE. Raised by Codex: the
  // first version accepted any tailored empty state, so a route wired to the
  // WRONG stages still rendered "Nothing waiting…" and passed. Asserting the
  // route's own description ties the rendered page to its definition, so a
  // copy/paste between two queues fails here.
  const definition = definitionFor(route);
  const rightQueue = definition
    ? text.includes(definition.description) ||
      text.includes(definition.emptyTitle)
    : false;

  check(
    `${route}  as ${actAs ?? user.split('@')[0]}`,
    real && rightQueue && !placeholder && !refused,
    placeholder
      ? 'still the "not built yet" placeholder'
      : refused
        ? 'the menu guard refused this role — the route/role table is wrong'
        : !rightQueue
          ? `rendered a queue, but not THIS one — expected "${definition?.description}"`
          : `no queue content: ${text.slice(0, 120)}`,
  );
}

for (const { ctx } of sessions.values()) await ctx.close();
await browser.close();

console.log(`\n${checks - failures}/${checks} queue routes render a real screen, ${errors.length} page errors`);
errors.forEach((e) => console.log(`  page error: ${e}`));
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
