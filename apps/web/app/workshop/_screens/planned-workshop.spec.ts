import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSHOP_PLANNED } from './planned-content';

/**
 * THE SIGNPOST GUARD.
 *
 * ── WHY THIS TEST EXISTS ────────────────────────────────────────────────────
 *
 * `PlannedScreen` tells somebody what to do INSTEAD of the screen they clicked,
 * and links them there. The whole value of that pattern is the link working. A
 * refusal that names an unreachable alternative is a wall, and it is the most
 * expensive defect class recorded in this repository — the API once told
 * technicians to "start a new inspection" through a UI that had no way to.
 *
 * 104 of these entries were written in one sitting on 2026-08-05. Hand-checking
 * 104 hrefs against four different role trees is exactly the job a human does
 * badly and a test does perfectly, so it is checked here instead of promised in
 * a comment. It also keeps holding: if somebody later renames a route in
 * `workspaces.ts`, or deletes a screen an entry points at, this fails rather
 * than silently turning a signpost into a dead link.
 *
 * ── THE THREE PROPERTIES ────────────────────────────────────────────────────
 *
 * 1. Every planned route has a real `page.tsx` (otherwise it still dead-ends on
 *    the catch-all and the entry is decorative).
 * 2. Every `href` points at a route that is genuinely BUILT — not at another
 *    planned screen, which would be a signpost to a signpost.
 * 3. Every `href` is present in the nav tree of EVERY role whose tree contains
 *    the planned route. This is the one that cannot be eyeballed: a route in two
 *    trees may only point somewhere both roles can reach.
 */

// ADR-021: __dirname is apps/web/app/workshop/_screens now, one level
// deeper than apps/<pack>-web/app/_screens was, so this needs five.
const ROOT = join(__dirname, '..', '..', '..', '..', '..');
// ADR-021: the workshop pack's routes live inside the one artifact now, at
// apps/web/app/workshop -- `apps/workshop-web` was deleted with the other
// six shells. This walks the pack's real route files, so it must follow.
const APP = join(ROOT, 'apps', 'web', 'app', 'workshop');
const ws = readFileSync(join(ROOT, 'packages', 'navigation', 'src', 'workspaces.ts'), 'utf8');

/** The four workshop role trees plus the technician's — every tree this app serves. */
const TREES: Record<string, string> = {
  DEFAULT: 'workshopGroups',
  OWNER: 'workshopOwnerGroups',
  MANAGER: 'workshopManagerGroups',
  RECEPTION: 'workshopReceptionGroups',
  TECHNICIAN: 'workshopTechnicianGroups',
};

/**
 * `/` is the PUBLIC parts marketplace. It is in no nav tree because it is not a
 * workspace screen — it is the product's front door, reachable from the wordmark
 * in every app and from the browser's address bar, signed in or out. Several
 * parts-sourcing entries point there deliberately, because it is the one piece
 * of procurement that genuinely is built.
 */
const ALWAYS_REACHABLE = new Set(['/']);

function block(name: string): string {
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

/**
 * Every route carrying a permission gate, at ITEM or GROUP level.
 *
 * 🔴 TREE MEMBERSHIP IS NOT REACHABILITY, AND THAT COST THREE WALLS.
 * The first version of this test proved a signpost's target was in the role's
 * nav tree and stopped there. Three targets were in the tree and still 404'd,
 * because the navigation is filtered by GRANTS as well: `/settings/*` is an
 * `organization.admin` group in the §34 tree and a workshop supervisor holds no
 * permissions at all, so "go to Staff and roles" was a wall for exactly the
 * people it was written for. Found by driving a browser, not by reading code —
 * `verify-workshop-menu-reachable.mjs`.
 *
 * The rule enforced below: a target may be gated ONLY if the source carries the
 * SAME gate. Then everybody who can reach the refusal can also reach the advice,
 * and nobody else sees either. `/settings/branches` -> `/settings/workshop-profile`
 * is the honest case — both are organisation-admin. An UNGATED source pointing at
 * a GATED target is always a wall, and that is the shape all three real defects
 * had.
 */
function gatedRoutes(): Map<string, string> {
  const gated = new Map<string, string>();
  for (const name of Object.values(TREES)) {
    const src = block(name);
    const groups = [...src.matchAll(/group\(\s*'([a-z0-9-]+)'/g)].map((m) => ({
      slug: m[1] ?? '',
      at: m.index ?? 0,
    }));
    for (let g = 0; g < groups.length; g++) {
      const here = groups[g]!;
      const next = groups[g + 1];
      const body = src.slice(here.at, next ? next.at : src.length);
      // Item-level: ['slug', 'Label', { permission: '…' }]
      for (const m of body.matchAll(
        /\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,\s*\{\s*permission:\s*'([^']+)'/g,
      )) {
        gated.set(`/${here.slug}/${m[1]}`, m[2] ?? '?');
      }
      // Group-level: the trailing permission argument to `group(...)`, which
      // gates EVERY item in it. Missing this is what let `/settings/*` through.
      //
      // 🔴 THE COMMENT TOLERANCE IS LOAD-BEARING, NOT TIDINESS. The first
      // version of this pattern required whitespace only between the items `]`
      // and the permission string. `workspaces.ts` writes the §34 settings group
      // as:
      //
      //     ],
      //     // Whole group is admin-only.
      //     'organization.admin',
      //   ),
      //
      // so the comment line broke the match and the whole check silently found
      // nothing. Proved by re-injecting the exact defect it was written for: the
      // suite passed 4/4. A guard that cannot fail is not a guard, and this repo
      // has a standing rule to prove one by INJECTING the failure — which is the
      // only reason this was caught rather than shipped as a green tick.
      const groupGate = body.match(/\]\s*,\s*(?:\/\/[^\n]*\n\s*)*'([a-z]+\.[a-z]+)'\s*,?\s*\)/);
      if (groupGate) {
        for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'/g)) {
          gated.set(`/${here.slug}/${m[1]}`, groupGate[1] ?? '?');
        }
      }
    }
  }
  return gated;
}

/** Same extraction the coverage audit uses, so the two cannot disagree. */
function routesIn(src: string): string[] {
  const out: string[] = [];
  const groups: { slug: string; at: number }[] = [
    ...src.matchAll(/group\(\s*'([a-z0-9-]+)'/g),
  ].map((m) => ({ slug: m[1] ?? '', at: m.index ?? 0 }));
  for (let g = 0; g < groups.length; g++) {
    const here = groups[g]!;
    const next = groups[g + 1];
    const body = src.slice(here.at, next ? next.at : src.length);
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'/g)) {
      out.push(`/${here.slug}/${m[1]}`);
    }
  }
  return out;
}

/**
 * Every route with a `page.tsx`, split into BUILT and PLANNED.
 *
 * 🔴 `(app)` AND FRIENDS ARE ROUTE GROUPS, NOT PATH SEGMENTS — Next strips a
 * parenthesised directory from the URL. Treating them as segments is what made
 * customer-web once measure 0 of 35 while six screens were shipped and working.
 */
function walkApp(dir: string, prefix = '', acc = { built: new Set<string>(), planned: new Set<string>() }) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry.startsWith('[') || entry.startsWith('_') || entry === 'api') continue;
      if (entry.startsWith('(') && entry.endsWith(')')) {
        walkApp(p, prefix, acc);
        continue;
      }
      walkApp(p, `${prefix}/${entry}`, acc);
    } else if (entry === 'page.tsx' && prefix) {
      if (/PlannedScreen/.test(readFileSync(p, 'utf8'))) acc.planned.add(prefix);
      else acc.built.add(prefix);
    }
  }
  return acc;
}

const { built, planned } = walkApp(APP);
const treeRoutes = new Map<string, Set<string>>(
  Object.entries(TREES).map(([role, blockName]) => [role, new Set(routesIn(block(blockName)))]),
);

describe('planned workshop screens', () => {
  it('every planned route has its own page.tsx', () => {
    const missing = Object.keys(WORKSHOP_PLANNED).filter(
      (route) => !existsSync(join(APP, route, 'page.tsx')),
    );
    expect(missing, `planned content with no page — these still dead-end on the catch-all:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every signpost points at a route that is actually built', () => {
    const bad: string[] = [];
    for (const [route, content] of Object.entries(WORKSHOP_PLANNED)) {
      const href = content.href;
      if (!href) continue;
      if (ALWAYS_REACHABLE.has(href)) continue;
      // A signpost to another signpost sends somebody one click further into the
      // same nothing, which is worse than saying "not built" once.
      if (planned.has(href)) bad.push(`${route} -> ${href} (that target is ITSELF a planned screen)`);
      else if (!built.has(href)) bad.push(`${route} -> ${href} (no page.tsx anywhere)`);
    }
    expect(bad, `signposts pointing nowhere real:\n${bad.join('\n')}`).toEqual([]);
  });

  it('no signpost sends a viewer somewhere their permissions cannot follow', () => {
    const gated = gatedRoutes();
    const bad: string[] = [];
    for (const [route, content] of Object.entries(WORKSHOP_PLANNED)) {
      const href = content.href;
      if (!href || ALWAYS_REACHABLE.has(href)) continue;
      const targetGate = gated.get(href);
      // Ungated target: anybody who can see the source can follow it.
      if (!targetGate) continue;
      const sourceGate = gated.get(route);
      if (sourceGate !== targetGate) {
        bad.push(
          `${route}${sourceGate ? ` (needs ${sourceGate})` : ' (ungated)'} -> ${href} ` +
            `(needs ${targetGate}) — the viewer who sees the refusal cannot follow the advice`,
        );
      }
    }
    expect(bad, `signposts a viewer cannot follow:\n${bad.join('\n')}`).toEqual([]);
  });

  it('every signpost is reachable by every role that can see the route', () => {
    const bad: string[] = [];
    for (const [route, content] of Object.entries(WORKSHOP_PLANNED)) {
      const href = content.href;
      if (!href || ALWAYS_REACHABLE.has(href)) continue;
      for (const [role, routes] of treeRoutes) {
        // Only roles whose menu actually contains this route can land on it.
        if (!routes.has(route)) continue;
        if (!routes.has(href)) {
          bad.push(`${role} sees ${route} but ${href} is NOT in the ${role} tree — 404 on click`);
        }
      }
    }
    expect(bad, `unreachable signposts — a refusal naming an alternative that 404s:\n${bad.join('\n')}`).toEqual([]);
  });
});
