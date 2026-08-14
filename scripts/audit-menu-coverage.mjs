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
//
// 🔴 AND THE SAME MISTAKE WAS STILL IN THIS LIST, ONE LEVEL UP. Until
// 2026-08-09 the table below held SIX trees across TWO apps, and printed
// "100%" for five of them. `COMPLETION_PLAN.md` says so in its own scope line:
// *"The other four apps — supplier, fleet, insurance, towing, admin — are out
// of scope for this plan."* So the number was 100% OF THE PART THAT WAS IN
// SCOPE, and it was read — by me, in a session summary — as 100% of the
// product.
//
// The owner said "still so many functionalities show not built yet" while this
// script printed 0 dead ends. Both were true. `packages/navigation` defines
// full menus for all SEVEN workspaces; five of those apps have between 3 and 8
// pages behind them. A coverage measure that only looks where the work was
// done cannot report the work that was not.
//
// All seven are measured now. The number went down, and it is the true one.
const TREES = {
  'DEFAULT §34 (supervisor, QC, storekeeper, cashier, platform admin)': ['workshopGroups', 'workshop'],
  'OWNER §46': ['workshopOwnerGroups', 'workshop'],
  'MANAGER §47': ['workshopManagerGroups', 'workshop'],
  'RECEPTION §48': ['workshopReceptionGroups', 'workshop'],
  'TECHNICIAN §49': ['workshopTechnicianGroups', 'workshop'],
  'CUSTOMER §33': ['customerGroups', 'customer'],
  'SUPPLIER §35': ['supplierGroups', 'supplier'],
  'FLEET §36': ['fleetGroups', 'fleet'],
  'INSURANCE §37': ['insuranceGroups', 'insurance'],
  'TOWING §38': ['towingGroups', 'towing'],
  'PLATFORM ADMIN §32': ['adminGroups', 'admin'],
};

const pagesByApp = new Map();
// 🔴 ONE ARTIFACT, SEVEN PACKS — AND THIS SCRIPT HAD BEEN DEAD SINCE ADR-021.
//
// It walked `apps/<pack>-web/app`, seven directories the 2026-08-13
// consolidation DELETED, so every run since has crashed with
//
//   ENOENT: scandir 'apps/workshop-web/app'
//
// Nobody noticed for a day, because the only thing that reads this number is
// a human quoting `CURRENT_PHASE.md` — which went on citing its last
// successful reading ("267 of 380, 70%") as though it were current. THE
// INSTRUMENT THAT MEASURES DELIVERY WAS BROKEN WHILE ITS LAST OUTPUT WAS
// BEING QUOTED AS FACT. That is worse than having no number, because a stale
// number is trusted.
//
// The packs now live at `apps/web/app/<pack>`, and `walkApp` already strips
// route groups — which matters because customer screens sit behind `(app)`.
// The paths it returns stay UNMOUNTED (`/group/item`), the same shape the
// navigation model stores, so the comparison below is unchanged.
function pagesFor(pack) {
  if (!pagesByApp.has(pack)) pagesByApp.set(pack, walkApp(join(ROOT, `apps/web/app/${pack}`)));
  return pagesByApp.get(pack);
}

console.log('WHAT EACH ROLE SEES IN ITS MENU vs WHAT HAS A PAGE BEHIND IT\n');

let totalAdvertised = 0;
const deadEverywhere = new Map();

// 🔴 DEDUPED BY app+route, NOT SUMMED PER TREE. Five of the eleven trees are
// workshop-web — the one app that is finished — so a per-tree sum counts a
// screen once per role that can see it, and prints a role-weighted average
// dominated by that app. `deadEverywhere` right underneath has always keyed on
// app+route for this reason; the totals now match it.
//
// ⚠️ THE CORRECTION IS SMALLER THAN IT LOOKS, AND THE NUMBER WAS CHECKED
// RATHER THAN TAKEN ON TRUST. The reviewer who found the double-count
// predicted the honest figure was "roughly 115 of 238, about 48%". It is
// 255 of 380 (67%) — the five workshop trees overlap far less than that
// assumed, their union being ~215 distinct routes rather than ~66. The
// arithmetic is self-checking: 255 working + 2 signposted + 123 dead = 380.
// A reviewer being right about the DEFECT and wrong about its SIZE is normal;
// re-measure before repeating either.
const advertisedOnce = new Set();
const workingOnce = new Set();

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
  for (const rt of routes) advertisedOnce.add(`${app}${rt}`);
  for (const rt of built) workingOnce.add(`${app}${rt}`);
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

// 🔴 THE HEADLINE, PRINTED WHETHER OR NOT ANYONE ASKS FOR IT. The per-tree rows
// above are easy to skim as "lots of 100%" — which is how five apps sitting at
// 0-19% went unremarked while a session summary reported the product complete.
// One number, over every workspace the product actually ships.
const pctAll = Math.round((workingOnce.size / advertisedOnce.size) * 100);
console.log(
  `\n══ DISTINCT SCREENS ACROSS ${new Set(Object.values(TREES).map(([, a]) => a)).size} APPS: ` +
    `${workingOnce.size} of ${advertisedOnce.size} WORKING (${pctAll}%) ══`,
);
console.log(
  `   (${totalAdvertised} menu entries in ${Object.keys(TREES).length} role trees; ` +
    `the trees overlap, so each screen is counted once here)`,
);

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
