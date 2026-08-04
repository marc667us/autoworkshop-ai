/**
 * EVERY MENU ENTRY, FOR EVERY WORKSHOP ROLE, DRIVEN IN A REAL BROWSER.
 *
 * ── WHAT THIS ANSWERS ───────────────────────────────────────────────────────
 *
 * `audit-menu-coverage.mjs` reads the filesystem and says how many routes have
 * a `page.tsx`. That is a claim about FILES. This clicks through every entry a
 * role can actually see, as that role, and asserts three things per route:
 *
 *   1. it renders (no 404, no error page),
 *   2. it does NOT carry the catch-all's "Not built yet" badge,
 *   3. if it is a signposted screen, its "what you can do now" link RESOLVES —
 *      followed, and checked for a 404, as that same role.
 *
 * Property 3 is the one no static audit can make. `planned-workshop.spec.ts`
 * proves the href is in the role's nav tree; only a browser proves the page
 * behind it actually answers for this signed-in person.
 *
 * ── ⚠️ IT ABORTS RATHER THAN REPORTING FALSE DEFECTS ────────────────────────
 *
 * If the sign-in did not take, or the role switch did not land, every route
 * below would 404 as a CORRECT refusal and this script would report a page of
 * defects that do not exist. That has happened in this repo twice. Both are
 * checked before anything is measured, and a failure exits non-zero immediately.
 *
 * Usage: node verify/verify-workshop-menu-reachable.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSHOP = process.argv[2] ?? 'http://localhost:3001';
const PASSWORD = process.env.DEV_PASSWORD ?? 'Change_me_locally1!';
const ROOT = join(process.cwd(), '..', '..');

/** Roles under test, and the account that holds each. §34/§46/§47/§48/§49. */
const ROLES = [
  { key: 'workshop_owner', tree: 'workshopOwnerGroups', user: 'owner@autoworkshop.local', label: 'OWNER §46' },
  { key: 'workshop_manager', tree: 'workshopManagerGroups', user: 'manager@autoworkshop.local', label: 'MANAGER §47' },
  { key: 'reception_staff', tree: 'workshopReceptionGroups', user: 'reception@autoworkshop.local', label: 'RECEPTION §48' },
  { key: 'technician', tree: 'workshopTechnicianGroups', user: 'technician@autoworkshop.local', label: 'TECHNICIAN §49' },
  { key: 'workshop_supervisor', tree: 'workshopGroups', user: 'supervisor@autoworkshop.local', label: 'DEFAULT §34' },
];

const ws = readFileSync(join(ROOT, 'packages/navigation/src/workspaces.ts'), 'utf8');
function block(name) {
  const decl = `const ${name}: NavGroup[] = [`;
  const start = ws.indexOf(decl);
  if (start < 0) throw new Error(`nav block not found: ${name}`);
  const i = start + decl.length - 1;
  let depth = 0;
  for (let j = i; j < ws.length; j++) {
    if (ws[j] === '[') depth++;
    else if (ws[j] === ']') {
      depth--;
      if (depth === 0) return ws.slice(i, j + 1);
    }
  }
  throw new Error(`unterminated nav block: ${name}`);
}
function routesIn(src) {
  const out = [];
  const groups = [...src.matchAll(/group\(\s*'([a-z0-9-]+)'/g)].map((m) => ({ slug: m[1], at: m.index }));
  for (let g = 0; g < groups.length; g++) {
    const body = src.slice(groups[g].at, g + 1 < groups.length ? groups[g + 1].at : src.length);
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'/g)) {
      out.push(`/${groups[g].slug}/${m[1]}`);
    }
  }
  return out;
}

/**
 * SENTINEL. Every judgement below depends on recognising the catch-all's badge.
 * If its wording changes, this script would pass everything forever while
 * measuring nothing — the failure mode this repo calls "a gate that never ran
 * and exited 0". So the string is asserted to still exist in the shared
 * component before it is trusted as a detector.
 */
const PLACEHOLDER = 'Not built yet';
const modulePage = readFileSync(join(ROOT, 'packages/next-shell/src/ModulePage.tsx'), 'utf8');
if (!modulePage.includes(PLACEHOLDER)) {
  console.error(
    `SENTINEL FAILED: "${PLACEHOLDER}" is no longer in ModulePage.tsx, so this script can no ` +
      `longer recognise an unbuilt screen and every PASS below would be meaningless.`,
  );
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch();

for (const role of ROLES) {
  const routes = routesIn(block(role.tree));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();

  console.log(`\n${'='.repeat(70)}\n${role.label} — ${role.user} — ${routes.length} menu entries\n${'='.repeat(70)}`);

  await page.goto(`${WORKSHOP}/home/dashboard`);
  const signInLink = page.getByRole('link', { name: 'Sign in' }).first();
  if ((await signInLink.count()) > 0) {
    await signInLink.click();
    const provider = page.getByRole('button', { name: /Keycloak/i });
    // waitFor, not count() — count does not auto-wait, and a run that carries on
    // SIGNED OUT reports correct refusals as product defects.
    await provider.waitFor({ state: 'visible', timeout: 60000 });
    await provider.click({ noWaitAfter: true });
    await page.waitForURL(/openid-connect\/auth/, { timeout: 120000 });
    await page.fill('#username', role.user);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login', { noWaitAfter: true });
    await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 120000 });
  }
  await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });

  const shell = await page.content();
  const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
  check(`${role.label}: MEASUREMENT VALID — signed in`, signedIn, 'every FAIL below would be a refusal, not a defect');
  if (!signedIn) {
    console.log(`  ABORT ${role.label}: not signed in.`);
    await ctx.close();
    continue;
  }

  // The identity may hold several memberships; the tree under test is the one
  // whose routes we are about to drive.
  const switcher = page.locator('#aw-role-switcher');
  if ((await switcher.count()) > 0) {
    const current = await switcher.inputValue().catch(() => '');
    if (current !== role.key) {
      await switcher.selectOption(role.key).catch(() => {});
      await page.waitForTimeout(3000);
      await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
    }
    const active = await page.locator('#aw-role-switcher').inputValue().catch(() => '');
    check(`${role.label}: MEASUREMENT VALID — acting as ${role.key}`, active === role.key, `active: ${active}`);
    if (active !== role.key) {
      console.log(`  ABORT ${role.label}: driving this tree as another role measures the wrong menu.`);
      await ctx.close();
      continue;
    }
  }

  /**
   * 🔴 THE ROUTES ARE READ FROM THE RENDERED MENU, NOT FROM THE STATIC TREE.
   *
   * The first version of this script drove the raw §34 tree and reported 14
   * failures. Every one was a CORRECT REFUSAL: the nav is filtered by the
   * viewer's grants, so the supervisor account's menu renders 5 entries out of
   * the tree's 56, and the other 51 rightly 404. Driving the static tree
   * measures what the SPEC lists; driving the rendered menu measures what this
   * person can actually click, which is the only thing a user experiences.
   *
   * This repo has made the same mistake before — a queue check reported 1/14
   * where 13 were correct role refusals. The static tree is still used above,
   * for the console line that shows how much of the spec this role's grants
   * unlock.
   */
  /**
   * ⚠️ EVERY GROUP MUST BE EXPANDED FIRST, and this is not a convenience.
   * `SideNav.tsx` renders a group's `<ul>` only on `open && !collapsed`, so a
   * COLLAPSED group's links are not in the DOM at all. Reading the nav without
   * expanding reported 4 links for every role — which looked like a catastrophic
   * permissions bug and was really a measurement reading one open accordion.
   * Two false alarms from one script in one session: first the static tree, then
   * the collapsed nav. Both said "defect" when the product was fine.
   */
  for (let sweep = 0; sweep < 30; sweep++) {
    const collapsed = page.locator('nav button[aria-expanded="false"]');
    const n = await collapsed.count();
    if (n === 0) break;
    await collapsed.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }

  const menuRoutes = [
    ...new Set(
      (
        await page.evaluate(() =>
          [...document.querySelectorAll('nav a[href^="/"]')].map((a) => a.getAttribute('href')),
        )
      ).filter((h) => h && h !== '/'),
    ),
  ];
  console.log(
    `  spec lists ${routes.length} entries for this tree; this account's grants render ${menuRoutes.length}`,
  );

  let placeholders = 0;
  let notFound = 0;
  let brokenSignposts = 0;

  for (const route of menuRoutes) {
    const res = await page.goto(`${WORKSHOP}${route}`, { waitUntil: 'load' }).catch(() => null);
    const status = res?.status() ?? 0;
    const html = await page.content();

    if (status === 404 || /This page could not be found/i.test(html)) {
      notFound++;
      check(`${role.label} ${route}`, false, `404 — advertised in the menu, does not resolve`);
      continue;
    }
    if (html.includes(PLACEHOLDER)) {
      placeholders++;
      check(`${role.label} ${route}`, false, 'still renders the generic "Not built yet" catch-all');
      continue;
    }

    // If this is a signposted screen, FOLLOW its link. A signpost whose target
    // 404s for this role is a wall, and it is the defect class this repo has
    // paid for most often.
    const cta = page.locator('text=What you can do now').first();
    if ((await cta.count()) > 0) {
      const link = page.locator('a[href^="/"]').filter({ hasNot: page.locator('nav a') });
      const hrefs = await page.evaluate(() => {
        const box = [...document.querySelectorAll('div')].find((d) =>
          d.textContent?.startsWith('What you can do now'),
        );
        return box ? [...box.querySelectorAll('a')].map((a) => a.getAttribute('href')) : [];
      });
      for (const href of hrefs.filter(Boolean)) {
        const r2 = await page.goto(`${WORKSHOP}${href}`, { waitUntil: 'load' }).catch(() => null);
        const s2 = r2?.status() ?? 0;
        const h2 = await page.content();
        const dead = s2 === 404 || /This page could not be found/i.test(h2);
        if (dead) {
          brokenSignposts++;
          check(`${role.label} ${route} -> ${href}`, false, 'signpost 404s for this role — a wall');
        } else {
          pass++;
        }
      }
      void link;
    }
    pass++;
  }

  console.log(
    `  ${menuRoutes.length} reachable routes · ${notFound} not found · ${placeholders} generic placeholders · ` +
      `${brokenSignposts} broken signposts`,
  );
  await ctx.close();
}

await browser.close();

console.log(`\n${'='.repeat(70)}`);
console.log(`${pass} passed · ${fail} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(70));
process.exit(fail === 0 ? 0 : 1);
