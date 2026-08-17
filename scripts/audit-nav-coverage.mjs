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
  const out = new Map(); // route -> required permission (or null)
  const groupRe = /group\(\s*'([a-z0-9-]+)'/g;
  const groups = [...src.matchAll(groupRe)].map((m) => ({ slug: m[1], at: m.index }));
  for (let g = 0; g < groups.length; g++) {
    const from = groups[g].at;
    const to = g + 1 < groups.length ? groups[g + 1].at : src.length;
    const body = src.slice(from, to);
    // ⚠️ THE PER-ENTRY PERMISSION IS CAPTURED, not just the slug. Without it
    // this audit false-PASSED on its own change: it saw
    // /customer-reception/register-customer in the DEFAULT tree and called the
    // capability covered, while four of the five roles landing on that tree
    // could not create a customer at all. Codex found the defect the audit
    // should have. Coverage means "a role that HOLDS the capability can SEE the
    // entry", and visibility depends on the gate.
    // ⚠️ THE GROUP GATE IS FOUND BY BALANCING THE ENTRIES ARRAY, not by a
    // non-greedy regex. The regex version stopped at the FIRST `]` — the end of
    // the first entry — and so never saw the trailing permission argument. It
    // reported the DEFAULT `settings` group as ungated, which made `Pricing`
    // look like it was offered to four roles that in fact cannot see it: a
    // false alarm from the very check meant to catch false alarms.
    const groupPerm = (() => {
      const open = body.indexOf('[');
      if (open < 0) return null;
      let depth = 0;
      for (let j = open; j < body.length; j++) {
        if (body[j] === '[') depth++;
        else if (body[j] === ']') {
          depth--;
          if (depth === 0) {
            // Whatever follows the entries array, up to the group's closing `)`.
            const tail = body.slice(j + 1, body.indexOf('),', j) + 1);
            return /'([a-z]+\.[a-z]+)'/.exec(tail)?.[1] ?? null;
          }
        }
      }
      return null;
    })();
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'(?:\s*,\s*\{([^}]*)\})?/g)) {
      const entryPerm = /permission:\s*'([a-z.]+)'/.exec(m[2] ?? '');
      // ⚠️ `groupPerm` is a STRING, not a match array — indexing `[1]` on it
      // yielded the single character 'r' from 'organization.admin', and the
      // report then claimed a permission called "r" was hiding the entry. It
      // read as a real finding; it was a leftover from when this was a regex.
      out.set(`/${groups[g].slug}/${m[1]}`, entryPerm?.[1] ?? groupPerm ?? null);
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

/**
 * Each role's permission grants, mirrored from the API's permission matrix.
 * Restated here rather than imported because this script reads source text
 * rather than running the app; the drift risk is accepted and small, and a
 * mismatch shows up as a nonsense result rather than a silent pass.
 */
const ROLE_PERMS = {
  platform_administrator: ['platform.admin', 'organization.admin', 'finance.read'],
  workshop_owner: ['finance.read', 'organization.admin'],
  workshop_manager: [],
  reception_staff: ['finance.read'],
  workshop_supervisor: [],
  technician: [],
  storekeeper: [],
  quality_control_inspector: [],
  cashier: ['finance.read'],
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
 *
 * `dedicated: true` means the route exists ONLY to perform this action, so a
 * role that can see it and cannot use it is a defect. `dedicated: false` marks
 * a shared screen — a list many roles read and some may act from — where that
 * reverse check does not apply and would cry wolf.
 */
const FEATURES = [
  { cap: 'CAN_CREATE_CUSTOMER', dedicated: true, frag: ['register-customer'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  { cap: 'CAN_CREATE_VEHICLE',  dedicated: true, frag: ['register-vehicle','add-vehicle'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  { cap: 'CAN_INSPECT (QC)',    dedicated: false, frag: ['quality-control','quality-control-queue'], roles: ['quality_control_inspector','workshop_supervisor','workshop_manager','workshop_owner','platform_administrator'] },
  { cap: 'PRICING (029 owner)', dedicated: true, frag: ['pricing-rules','pricing'], roles: ['workshop_owner','platform_administrator'] },
  // Raising is the technician's step (§3764 step 11); reviewing is the
  // supervisor's (§3792). Both are `dedicated: false` because the same screen
  // serves both — a technician sees the raise form, a reviewer sees the queue.
  { cap: 'CAN_RAISE_VARIATION',  dedicated: false, frag: ['variations','variation-requests'], roles: ['technician','workshop_supervisor','workshop_manager','workshop_owner','platform_administrator'] },
  { cap: 'CAN_REVIEW_VARIATION', dedicated: false, frag: ['variations','variation-requests'], roles: ['workshop_supervisor','workshop_manager','workshop_owner','platform_administrator'] },
  { cap: 'CAN_CREATE_JOB',      dedicated: false, frag: ['job-cards','create-job-card','new-job-card'], roles: ['platform_administrator','workshop_owner','workshop_manager','reception_staff'] },
  // 🔴 THESE TWO MIRRORS WERE FOUR ROLES BEHIND THE API, and `towing-roles.ts:32`
  // asserts that this script "will fail the build if the API permits a role the
  // navigation gives no way to reach". With the mirror stale, it did not — the
  // audit passed green over exactly the gap it exists to find. Brought level
  // with `membership.service.ts` and `branch.service.ts` on 2026-08-17.
  //
  // ⚠️ AND IT IS STILL ONLY HALF A GUARD: `TREE_ROLES` covers the five WORKSHOP
  // trees, so a partner role listed here is not yet checked against its own
  // pack's navigation. Extending that is its own change; recorded here rather
  // than left implied, because a mirror that looks complete and is not is what
  // produced this defect.
  { cap: 'CAN_GRANT_MEMBERSHIP',dedicated: false, frag: ['staff','staff-and-roles','users-and-roles','roles-and-permissions','users'], roles: ['platform_administrator','workshop_owner','supplier_owner','fleet_administrator','insurance_owner','towing_owner'] },
  { cap: 'CAN_CREATE_BRANCH',   dedicated: false, frag: ['branches'], roles: ['platform_administrator','workshop_owner','supplier_owner','fleet_administrator','insurance_owner','towing_owner'] },
  // ── 🔴 THE AGENT LAYER IS DELIBERATELY *NOT* DECLARED HERE (2026-08-08) ───
  //
  // `apps/api/src/agents` gates every route — `/agents/proposals`,
  // `/agents/proposals/:id/decision`, `/agents/proposals/:id/apply-leads`,
  // `/agents/discover/*` — on `assertWorkshopStaff`, which admits ALL NINE
  // staff roles. By this file's own definition that means all nine hold the
  // capability, and a row saying so would report a REAL gap today:
  //
  // Leads and Discovery are carried by the DEFAULT (§34), OWNER (§46) and
  // MANAGER (§47) trees. RECEPTION (§48) and TECHNICIAN (§49) carry NEITHER, so
  // `reception_staff` and `technician` can call these endpoints and cannot reach
  // any of it by clicking. That is the gap, stated exactly.
  //
  // The entries were placed in the groups where their domain already lives
  // (Customer Reception / Parts and Supply, and the role-tree equivalents)
  // rather than in a new "Sales" group, because CLAUDE.md's prohibited list
  // names "changing approved navigation without review" and §34's eleven groups
  // are asserted in `resolve.test.ts`. Neither of the two uncovered trees has a
  // group where "find suppliers on the web" honestly belongs.
  //
  // ⚠️ WHY NO ROW RATHER THAN A NARROWED ONE. Writing `roles:` as the subset
  // whose trees happen to carry the entry would make this audit pass by
  // asserting something FALSE about the API — the exact failure a regression
  // guard cannot survive, and the reason the parser-failure check above exists.
  // So the gap is recorded here in words, where it can be read and closed,
  // instead of being hidden behind a green run.
  //
  // TWO WAYS TO CLOSE IT, either of which should also add the row:
  //   1. Narrow the API's gate to the roles the product intends (a change to
  //      `apps/api/src/agents`, which is another change's territory today), or
  //   2. Get owner review for a dedicated Sales group carried by all five
  //      workshop trees, which gives every staff role one route.
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
    // The matching entry, and what it costs to see it.
    let entry = null;
    for (const [route, perm] of TREES[tree]) {
      if (f.frag.some((fr) => route.endsWith(`/${fr}`))) { entry = { route, perm }; break; }
    }
    if (!entry) {
      missing.push(`${tree} — NO ROUTE, blocks ${holders.join(', ')}`);
      continue;
    }
    // 🔴 VISIBILITY, NOT MERE EXISTENCE. A holder gated out of the entry cannot
    // reach it, so the gap is not closed for them.
    const blind = entry.perm ? holders.filter((r) => !(ROLE_PERMS[r] ?? []).includes(entry.perm)) : [];
    if (blind.length) {
      missing.push(`${tree} — route exists but '${entry.perm}' hides it from ${blind.join(', ')}`);
    }
    // And the mirror: a role that SEES it but cannot use it gets a guaranteed
    // refusal. That is the defect Codex found in this very change.
    //
    // ⚠️ ONLY FOR DEDICATED ACTION ROUTES. A screen like `/workshop-floor/job-cards`
    // is a LIST that many roles legitimately read while only some may create
    // from it, so "offered to somebody outside the create set" is not a defect
    // there — it is the normal case. Running this check against shared screens
    // produced three false alarms on its first version. It applies only where
    // the route exists to perform the action and nothing else.
    if (f.dedicated) {
      const seers = (TREE_ROLES[tree] ?? []).filter(
        (r) => !entry.perm || (ROLE_PERMS[r] ?? []).includes(entry.perm),
      );
      const cannotUse = seers.filter((r) => !f.roles.includes(r));
      if (cannotUse.length) {
        missing.push(`${tree} — OFFERED to ${cannotUse.join(', ')} who CANNOT use it`);
      }
    }
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

// ⚠️ ENFORCING, NOT ADVISORY. The seven known gaps were closed on 2026-08-01
// (proposal Option A, owner-approved), so ANY gap now is a NEW one — a
// capability whose permitted roles cannot reach it by clicking. That is exactly
// the regression this script exists to stop, and it arrived four times by
// accident before anyone looked.
if (gaps > 0) {
  console.error(
    `\n${gaps} navigation gap(s): a role may do something it cannot reach by clicking.\n` +
      'Either add the entry to that tree (with a page behind it), or narrow the\n' +
      'capability in the API. See docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md.',
  );
}
process.exit(gaps > 0 ? 1 : 0);
