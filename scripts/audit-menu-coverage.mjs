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

// Every real page route in workshop-web.
const pages = new Set();
function walk(dir, prefix = '') {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e.startsWith('[') || e.startsWith('_')) continue;
      walk(p, `${prefix}/${e}`);
    } else if (e === 'page.tsx' && prefix) {
      pages.add(prefix);
    }
  }
}
walk(join(ROOT, 'apps/workshop-web/app'));

const TREES = {
  'DEFAULT §34 (supervisor, QC, storekeeper, cashier, platform admin)': 'workshopGroups',
  'OWNER §46': 'workshopOwnerGroups',
  'MANAGER §47': 'workshopManagerGroups',
  'RECEPTION §48': 'workshopReceptionGroups',
  'TECHNICIAN §49': 'workshopTechnicianGroups',
};

console.log(`workshop-web has ${pages.size} real page routes\n`);
console.log('WHAT EACH ROLE SEES IN ITS MENU vs WHAT HAS A PAGE BEHIND IT\n');

let totalAdvertised = 0;
const deadEverywhere = new Map();

for (const [label, blockName] of Object.entries(TREES)) {
  const routes = routesIn(block(blockName));
  const built = routes.filter((r) => pages.has(r));
  const dead = routes.filter((r) => !pages.has(r));
  totalAdvertised += routes.length;
  for (const d of dead) deadEverywhere.set(d, (deadEverywhere.get(d) ?? 0) + 1);
  const pct = Math.round((built.length / routes.length) * 100);
  console.log(
    `  ${label}\n     ${routes.length} menu entries · ${built.length} built (${pct}%) · ${dead.length} land on "not built yet"\n`,
  );
}

console.log(`\nDistinct menu entries with NO page anywhere: ${deadEverywhere.size}`);
console.log('\nA few of them:');
[...deadEverywhere.keys()].slice(0, 12).forEach((d) => console.log(`  ${d}`));

// Reporting only: menu coverage is a progress measure, not a correctness one.
// A build must never fail because a later phase has not been written yet.
process.exit(0);
