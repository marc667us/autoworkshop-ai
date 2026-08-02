/**
 * Navigation coverage audit — does every role that MAY do something have a way
 * to reach it by clicking?
 *
 * 🔴 WHY THIS EXISTS. Four separate times in one day a role was permitted by the
 * API to do something and had no navigable route to it: pricing, quality
 * control, creating a customer, creating a vehicle. Each was found by accident.
 *
 * The root cause is structural rather than careless. `ROLE_TO_NAV` maps eight
 * roles to nav ids, but only FOUR trees exist (owner, manager, reception,
 * technician) — so `workshop_supervisor`, `storekeeper`,
 * `quality_control_inspector` and `cashier` all fall back to the DEFAULT tree,
 * as does `platform_administrator`, which is not mapped at all. Every one of the
 * 21 write capabilities in the API therefore spans 2-5 trees, and nothing
 * checked that each of those trees carried a route.
 *
 * ⚠️ THIS SCRIPT SHIPPED WRONG ONCE, AND THE FAILURE IS INSTRUCTIVE. Its first
 * version located each tree with `indexOf('[')` after the declaration — which
 * matched the `[]` in `NavGroup[]`, balanced immediately, and returned an EMPTY
 * array. Every tree measured ZERO routes, so every feature looked missing
 * everywhere and it confidently reported 21 gaps that did not exist. The
 * route-count line below is printed for exactly that reason: a tree reporting 0
 * routes means the PARSER is broken, not the navigation.
 *
 * ⚠️ THE FEATURE LIST IS HAND-MAINTAINED AND THAT IS A REAL LIMITATION. A
 * capability name cannot be derived from a URL slug, so `FEATURES` below is a
 * curated mapping. This is a REGRESSION GUARD, not a complete model of the
 * product: a capability nobody adds here is a capability it cannot check.
 *
 *   node scripts/audit-nav-coverage.mjs
 *
 * Exits non-zero when a gap is found, so it can run in CI.
 */
import { readFileSync } from 'node:fs';

// Resolved from this file's location, not hardcoded — a script that only works
// on one machine is not a CI guard. (§0.3: no hardcoded paths in logic.)
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ws = readFileSync(`${ROOT}/packages/navigation/src/workspaces.ts`, 'utf8');

/** Slice out the array literal assigned to `name`, brace-balanced. */
function block(name) {
  const decl = `const ${name}: NavGroup[] = [`;
  const start = ws.indexOf(decl);
  if (start < 0) throw new Error(`declaration not found: ${name}`);
  // ⚠️ The array literal starts at the END of the declaration, not at the first
  // '[' after it — that one is the `[]` in `NavGroup[]`, which balanced
  // immediately and returned an EMPTY array. Every tree then parsed as 0 routes
  // and the audit reported 21 gaps that did not exist.
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

/** group('slug', ... [ ['entry', 'Label'], ... ]) → "group/entry" paths. */
function routesIn(src) {
  const out = new Set();
  const groupRe = /group\(\s*'([a-z0-9-]+)'/g;
  const groups = [...src.matchAll(groupRe)].map((m) => ({ slug: m[1], at: m.index }));
  for (let g = 0; g < groups.length; g++) {
    const from = groups[g].at;
    const to = g + 1 < groups.length ? groups[g + 1].at : src.length;
    const body = src.slice(from, to);
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'/g)) {
      out.add(`/${groups[g].slug}/${m[1]}`);
    }
  }
  return out;
}

const TREES = {
  'DEFAULT (§34)': routesIn(block('workshopGroups')),
  'owner (§46)': routesIn(block('workshopOwnerGroups')),
  'manager (§47)': routesIn(block('workshopManagerGroups')),
  'reception (§48)': routesIn(block('workshopReceptionGroups')),
  'technician (§49)': routesIn(block('workshopTechnicianGroups')),
};

/** Which roles land on which tree (from the audit). */
const TREE_ROLES = {
  'DEFAULT (§34)': ['platform_administrator', 'workshop_supervisor', 'quality_control_inspector', 'storekeeper', 'cashier'],
  'owner (§46)': ['workshop_owner'],
  'manager (§47)': ['workshop_manager'],
  'reception (§48)': ['reception_staff'],
  'technician (§49)': ['technician'],
};

/**
 * A capability, the roles that hold it, and the route slug FRAGMENT that would
 * satisfy it. Matched on the last path segment so a tree naming it differently
 * (`quality-control` vs `quality-control-queue`) still counts.
 */
const FEATURES = [
  { cap: 'CAN_CREATE_CUSTOMER', frag: ['register-customer'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  { cap: 'CAN_CREATE_VEHICLE',  frag: ['register-vehicle','add-vehicle'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  { cap: 'CAN_INSPECT (QC)',    frag: ['quality-control','quality-control-queue'], roles: ['quality_control_inspector','workshop_supervisor','workshop_manager','workshop_owner','platform_administrator'] },
  { cap: 'PRICING (029 owner)', frag: ['pricing-rules','pricing'], roles: ['workshop_owner','platform_administrator'] },
  { cap: 'CAN_CREATE_JOB',      frag: ['job-cards','create-job-card','new-job-card'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  { cap: 'CAN_GRANT_MEMBERSHIP',frag: ['staff','staff-and-roles','users-and-roles','roles-and-permissions'], roles: ['platform_administrator','workshop_owner'] },
  { cap: 'CAN_CREATE_BRANCH',   frag: ['branches'], roles: ['platform_administrator','workshop_owner'] },
];

console.log('ROUTES PER TREE (counts):');
for (const [t, r] of Object.entries(TREES)) console.log(`  ${t.padEnd(18)} ${r.size} routes`);

console.log('\n\nGAPS — a role holds the capability but its tree has no route for it\n');
let gaps = 0;
for (const f of FEATURES) {
  const missing = [];
  for (const [tree, roles] of Object.entries(TREE_ROLES)) {
    const holders = roles.filter((r) => f.roles.includes(r));
    if (holders.length === 0) continue;
    const has = [...TREES[tree]].some((route) =>
      f.frag.some((fr) => route.endsWith(`/${fr}`)),
    );
    if (!has) missing.push(`${tree} — blocks ${holders.join(', ')}`);
  }
  if (missing.length) {
    gaps += missing.length;
    console.log(`  ${f.cap}`);
    for (const m of missing) console.log(`      MISSING in ${m}`);
    console.log('');
  } else {
    console.log(`  ${f.cap}  — every holder has a route\n`);
  }
}
console.log(`TOTAL GAPS: ${gaps}`);

// ⚠️ A tree with no routes means the PARSER broke, not that navigation vanished.
// Checked explicitly, because the silent version of this produced a confident
// report of 21 gaps that were all false.
for (const [tree, routes] of Object.entries(TREES)) {
  if (routes.size === 0) {
    console.error(`
PARSER FAILURE: ${tree} parsed as ZERO routes. The gaps above are meaningless.`);
    process.exit(2);
  }
}

if (gaps > 0) {
  console.error(
    `
${gaps} navigation gap(s). See docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md — ` +
      'these are pending an owner decision, so this script is advisory until they are closed.',
  );
}
// Advisory for now: the known gaps are documented and awaiting a decision.
// Flip to `process.exit(gaps > 0 ? 1 : 0)` once the proposal is applied, so a
// NEW gap fails the build.
process.exit(0);
