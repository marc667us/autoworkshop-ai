/**
 * Menu coverage — how much of what a role SEES actually has a page behind it?
 *
 * 🔴 WHY THIS EXISTS. A progress report claimed "99 screens in workshop-web".
 * The owner's reply was that they do not see them at the front end, and they
 * were right: 99 counted every `page.tsx` FILE, including `[id]` detail variants
 * and one screen mounted at several role-tree routes. The honest figure is 61
 * distinct built routes — and even that is not what anyone experiences, because
 * the navigation was written from the FULL 11-phase spec while pages are built
 * phase by phase.
 *
 * Measured 2026-08-01: an OWNER sees 64 menu entries and 17 work. Roughly three
 * of every four things they click render a placeholder.
 *
 * ⚠️ THIS IS NOT THE SAME AS `audit-nav-coverage.mjs`. That one asks "can every
 * role REACH what the API permits" — an authorization question, and it exits 1
 * when the answer is no. This one asks "how much of the menu is real" — a
 * PROGRESS question with no correct answer, so it never fails a build. Reporting
 * only, deliberately.
 *
 *   node scripts/audit-menu-coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from this file, not hardcoded — §0.3.
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ws = readFileSync(`${ROOT}/packages/navigation/src/workspaces.ts`, 'utf8');

function block(name) {
  const decl = `const ${name}: NavGroup[] = [`;
  const start = ws.indexOf(decl);
  if (start < 0) throw new Error(`not found: ${name}`);
  let i = start + decl.length - 1;
  let depth = 0;
  for (let j = i; j < ws.length; j++) {
    if (ws[j] === '[') depth++;
    else if (ws[j] === ']') {
      depth--;
      if (depth === 0) return ws.slice(i, j + 1);
    }
  }
  return '';
}

function routesIn(src) {
  const out = [];
  const groups = [...src.matchAll(/group\(\s*'([a-z0-9-]+)'/g)].map((m) => ({
    slug: m[1],
    at: m.index,
  }));
  for (let g = 0; g < groups.length; g++) {
    const body = src.slice(groups[g].at, g + 1 < groups.length ? groups[g + 1].at : src.length);
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'/g)) {
      out.push(`/${groups[g].slug}/${m[1]}`);
    }
  }
  return out;
}

// Every real page route in an app.
//
// 🔴 `(app)` AND FRIENDS ARE ROUTE GROUPS, NOT PATH SEGMENTS. Next.js strips a
// parenthesised directory from the URL — `app/(app)/home/dashboard/page.tsx`
// serves `/home/dashboard`, not `/(app)/home/dashboard`. Counting them as
// segments makes every route in an app that uses them look unbuilt, which is
// how customer-web measured 0 of 35 while six of those screens were shipped and
// working. `check-page-gates.sh` mis-reads the same directories (issue D4).
function walkApp(appDir) {
  const pages = new Set();
  const planned = new Set();
  (function walk(dir, prefix = '') {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e.startsWith('[') || e.startsWith('_')) continue;
        if (e.startsWith('(') && e.endsWith(')')) {
          walk(p, prefix); // route group: contributes no path segment
          continue;
        }
        walk(p, `${prefix}/${e}`);
      } else if (e === 'page.tsx' && prefix) {
        pages.add(prefix);
        // 🔴 A PLANNED SCREEN IS NOT A BUILT FEATURE.
        //
        // Routes that render `PlannedScreen` have their own `page.tsx` — they
        // say what the screen is for and what to do today instead — so a
        // file-counting audit calls them BUILT and the coverage number jumps to
        // 100%. That is the same lie as the "99 screens" claim this whole
        // script was written to correct, arriving through a different door.
        //
        // They ARE better than the catch-all: nothing now dead-ends. But they
        // are counted apart, because a person reading "100% built" and finding
        // twenty screens that explain themselves has been misled by this file.
        if (/PlannedScreen/.test(readFileSync(p, 'utf8'))) planned.add(prefix);
      }
    }
  })(appDir);
  return { pages, planned };
}

// ⚠️ THE APP MATTERS. A role's tree is served by ONE app, and looking a
// customer route up in workshop-web's page list answers a question nobody
// asked. Until this was split, only workshop-web was measured at all, so the
// customer workspace — a whole seventh of the product — had never appeared in
// a coverage number.
const TREES = {
  'DEFAULT §34 (supervisor, QC, storekeeper, cashier, platform admin)': ['workshopGroups', 'workshop-web'],
  'OWNER §46': ['workshopOwnerGroups', 'workshop-web'],
  'MANAGER §47': ['workshopManagerGroups', 'workshop-web'],
  'RECEPTION §48': ['workshopReceptionGroups', 'workshop-web'],
  'TECHNICIAN §49': ['workshopTechnicianGroups', 'workshop-web'],
  'CUSTOMER §33': ['customerGroups', 'customer-web'],
};

const pagesByApp = new Map();
function pagesFor(app) {
  if (!pagesByApp.has(app)) pagesByApp.set(app, walkApp(join(ROOT, `apps/${app}/app`)));
  return pagesByApp.get(app);
}

console.log('WHAT EACH ROLE SEES IN ITS MENU vs WHAT HAS A PAGE BEHIND IT\n');

let totalAdvertised = 0;
const deadEverywhere = new Map();

for (const [label, [blockName, app]] of Object.entries(TREES)) {
  const { pages, planned } = pagesFor(app);
  const routes = routesIn(block(blockName));
  // WORKING = a real screen. PLANNED = a page that explains itself and points
  // somewhere useful. DEAD = the catch-all. Three numbers, because collapsing
  // the first two is how a coverage figure starts lying.
  const built = routes.filter((r) => pages.has(r) && !planned.has(r));
  const explained = routes.filter((r) => planned.has(r));
  const dead = routes.filter((r) => !pages.has(r));
  totalAdvertised += routes.length;
  // Keyed by app as well as route: `/home/dashboard` exists in both apps and is
  // a different screen in each. Merging them would hide one behind the other.
  for (const d of dead) {
    const k = `${app}${d}`;
    deadEverywhere.set(k, (deadEverywhere.get(k) ?? 0) + 1);
  }
  const pct = Math.round((built.length / routes.length) * 100);
  console.log(
    `  ${label}  (${app})\n     ${routes.length} menu entries · ${built.length} WORKING (${pct}%)` +
      ` · ${explained.length} explained + signposted · ${dead.length} dead ends\n`,
  );
}

for (const [app, { pages, planned }] of pagesByApp) {
  console.log(
    `  ${app}: ${pages.size - planned.size} working screens + ${planned.size} explained = ${pages.size} routes`,
  );
}
console.log();

console.log(`\nDistinct menu entries with NO page anywhere: ${deadEverywhere.size}`);
// `--all` prints every one. A 12-line sample is fine for a progress read, but
// BUILDING them needs the whole list — and re-deriving it by hand is exactly
// how a sweep misses the entries nobody happened to paste into a chat.
const showAll = process.argv.includes('--all');
console.log(showAll ? '\nEvery one of them:' : '\nA few of them:');
const dead = [...deadEverywhere.keys()];
(showAll ? dead : dead.slice(0, 12)).forEach((d) => console.log(`  ${d}`));

// Reporting only: menu coverage is a progress measure, not a correctness one.
// A build must never fail because a later phase has not been written yet.
process.exit(0);
