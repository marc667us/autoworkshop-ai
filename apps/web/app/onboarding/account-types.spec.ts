import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TYPES, NOT_SELF_SERVICE } from './account-types';

/**
 * 🔴 A DOOR THIS SCREEN OFFERS THAT DOES NOT OPEN IS THE DEFECT THE SCREEN
 * EXISTS TO FIX.
 *
 * This repository has now recorded four separate instances of a role, route or
 * capability that was built, deployed, gated, tested and reachable by nobody —
 * `customer` (2026-08-08), `supplier_owner` (08-09), `fleet_administrator`
 * (08-09, whose 29 screens shipped while `POST /registration/fleet` answered
 * 404) and `insurance_assessor`. Every one of them went green.
 *
 * An onboarding screen is where that failure is most expensive, because it is
 * the first thing a new person ever uses and a dead link there reads as "this
 * product does not work". So both halves are asserted against the REAL sources
 * rather than against a copy of the same literals:
 *
 *   · every `href` resolves to a page in this artifact's own `app/` tree
 *   · every `roleName` is one the API's allow-list actually contains
 *
 * ⚠️ THE FILESYSTEM, NOT A HARDCODED ROUTE LIST. Comparing against another list
 * I typed would prove only that the two copies agree — the "check that walks
 * through its own gap" shape. The route either has a `page.tsx` on disk or it
 * does not.
 */

const APP_DIR = join(__dirname, '..');

/**
 * Does this artifact serve `pathname`?
 *
 * Next's App Router maps `/a/b` to `app/a/b/page.tsx`, but a segment may be
 * wrapped in a ROUTE GROUP — `app/customer/(app)/marketplace/page.tsx` serves
 * `/customer/marketplace`, because `(app)` is not part of the URL. Walking the
 * tree and stepping through any parenthesised directory is what makes this
 * check true of the real router rather than of a simplified model of it.
 */
function servesRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);

  function walk(dir: string, rest: readonly string[]): boolean {
    if (!existsSync(dir)) return false;
    if (rest.length === 0) return existsSync(join(dir, 'page.tsx'));

    const [head, ...tail] = rest;
    if (head === undefined) return false;

    // The plain child.
    if (walk(join(dir, head), tail)) return true;

    // Any route group at this level — `(app)`, `(marketing)` and so on — which
    // consumes no URL segment, so the SAME `rest` is tried inside it.
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('(') && e.name.endsWith(')'))
        .map((e) => e.name);
    } catch {
      return false;
    }
    return entries.some((group) => walk(join(dir, group), rest));
  }

  return walk(APP_DIR, segments);
}

describe('the doors the onboarding screen offers', () => {
  it('the route checker itself works', () => {
    // 🔴 GUARDS THE GUARD. A `servesRoute` that returned false for everything
    // would make the "no dead links" test below vacuously... fail — but one
    // that returned TRUE for everything would make it vacuously PASS, and pass
    // for ever, over any dead link anybody added later. Both directions are
    // pinned against routes whose existence is not in question.
    expect(servesRoute('/onboarding'), 'this very page').toBe(true);
    expect(servesRoute('/customer/marketplace'), 'lives behind the (app) route group').toBe(true);
    expect(servesRoute('/definitely/not/a/route')).toBe(false);
  });

  it.each(ACCOUNT_TYPES.map((t) => [t.id, t.href] as const))(
    '%s points at a route this artifact serves (%s)',
    (_id, href) => {
      expect(
        servesRoute(href),
        `the onboarding screen links to "${href}" and no page.tsx serves it — a new user's first click would 404`,
      ).toBe(true);
    },
  );

  it('never sends a brand-new user to the customer dashboard', () => {
    // 🔴 A REGRESSION TEST FOR A SPECIFIC WRONG ANSWER I WROTE.
    //
    // `/customer/home/dashboard` is the obvious target for "I own a vehicle"
    // and it is the wrong one: `CustomerDashboardScreen` calls
    // `apiGet('/vehicles')` immediately, that call needs a tenant context, and
    // a person with no membership cannot obtain one — so the screen renders
    // `ApiFailure`. An error panel, to somebody who has done nothing wrong, on
    // the first screen after signing up. Caught by Codex on 2026-08-14 before
    // it shipped.
    for (const type of ACCOUNT_TYPES) {
      expect(
        type.href,
        `"${type.id}" points at the customer dashboard, which shows ApiFailure without a membership`,
      ).not.toBe('/customer/home/dashboard');
    }
  });
});

describe('the roles the onboarding screen names', () => {
  const source = readFileSync(
    join(__dirname, '../../../api/src/identity/membership.service.ts'),
    'utf8',
  );

  const block = /const GRANTABLE_ROLES = new Set\(\[([\s\S]*?)\]\)/.exec(source);
  const grantable = new Set<string>(
    [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((r): r is string => typeof r === 'string'),
  );

  it('found the API allow-list to compare against', () => {
    // Same guard as `staff-roles.spec.ts`: without it every assertion below
    // runs against an EMPTY set and passes while proving nothing.
    expect(block, 'could not find GRANTABLE_ROLES in membership.service.ts').toBeTruthy();
    expect(grantable.size).toBeGreaterThanOrEqual(8);
  });

  it.each(
    ACCOUNT_TYPES.filter((t) => t.roleName !== null).map((t) => [t.id, t.roleName] as const),
  )('%s names a role the API knows (%s)', (_id, roleName) => {
    expect(grantable.has(roleName!)).toBe(true);
  });

  it('offers exactly the roles a self-service migration writes', () => {
    // 🔴 READ FROM THE MIGRATIONS, WHICH ARE THE ONLY AUTHORITY ON WHAT A
    // SELF-SERVICE DOOR ACTUALLY WRITES. `GRANTABLE_ROLES` is a different and
    // much wider question — it is what an EXISTING owner may confer, and a
    // handover note conflated the two lists on 2026-08-13. Offering a role from
    // that wider set would put a button on this screen with no door behind it.
    // 🔴 THE LAST DEFINITION OF EACH DOOR WINS, NOT THE UNION OF ALL OF THEM.
    //
    // This reader used to add every role literal it found near an
    // `INSERT INTO identity.memberships` in ANY migration, into one flat set.
    // That is wrong the first time a function is redefined, and migration 085
    // is that first time: it `CREATE OR REPLACE`s `register_insurer` to write
    // `insurance_owner` instead of `insurance_assessor`, and 080 still sits on
    // disk containing the old literal for ever. The union therefore claimed the
    // insurance door writes BOTH roles, when the database runs only the later
    // body.
    //
    // A migration directory is an ordered ledger, not a bag of files. Keyed by
    // FUNCTION and replayed in order, this asks the question the test name
    // claims: what does each self-service door write TODAY?
    //
    // ⚠️ The role vocabulary is no longer hardcoded either. It used to be an
    // alternation of six names, so a genuinely new role was invisible to the
    // check — it could not fail, which is this repository's most-recorded
    // defect class. Now any single-quoted literal in the membership INSERT is
    // read, and it is `expected` vs `offered` that has to agree.
    const migrations = join(__dirname, '../../../../infrastructure/migrations');
    const doorWrites = new Map<string, string>();
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(join(migrations, file), 'utf8');
      for (const fn of sql.matchAll(
        /CREATE OR REPLACE FUNCTION identity\.(register_\w+)\s*\(/g,
      )) {
        const name = fn[1];
        if (!name || fn.index === undefined) continue;
        // The body ends at the function's closing `$$;`.
        const close = sql.indexOf('$$;', fn.index);
        const body = sql.slice(fn.index, close === -1 ? sql.length : close);
        const ins = body.indexOf('INSERT INTO identity.memberships');
        if (ins === -1) continue;
        const role = /role_name[\s\S]{0,400}?'([a-z_]+)'\s*,\s*'active'/.exec(
          body.slice(ins, ins + 700),
        );
        if (role?.[1]) doorWrites.set(name, role[1]);
      }
    }

    expect(
      doorWrites.size,
      'no self-service registration function found — the reader is broken, not the product',
    ).toBeGreaterThanOrEqual(5);

    const written = new Set(doorWrites.values());

    const offered = new Set(
      ACCOUNT_TYPES.map((t) => t.roleName).filter((r): r is string => r !== null),
    );
    // ⚠️ NO `customer` FILTER ANY MORE, AND THAT IS A REAL NARROWING, NOT A
    // TIDY-UP. The old reader scanned every `INSERT INTO identity.memberships`
    // in every migration, so it saw `customer` (migration 061 enrols a vehicle
    // owner into an existing workshop) and had to strip it. This reader only
    // inspects `CREATE OR REPLACE FUNCTION identity.register_*` bodies, so
    // `customer` can never appear and the filter was dead code describing a
    // rule it no longer enforced. Removed rather than left to mislead.
    //
    // 🔴 THE COST, STATED: a future self-service door written as a plain
    // `CREATE FUNCTION`, or named outside `register_*`, or writing its
    // membership outside the function body, is INVISIBLE to a test whose name
    // promises "exactly the roles a self-service migration writes". The
    // `doorWrites.size >= 5` guard above is the only thing standing between
    // that and a silent pass. Widen the pattern when such a door is added.
    // (Supervisor, 2026-08-17.)
    const expected = new Set(written);
    expect(offered).toEqual(expected);
  });

  it('explains every role it does not offer, without pretending it is coming', () => {
    for (const role of NOT_SELF_SERVICE) {
      expect(role.label, `${role.id} has no label`).toBeTruthy();
      expect(role.reason, `${role.id} has no reason`).toBeTruthy();
      // A refusal with no reachable next step is a wall, not a rule — this
      // repository's standing lesson. "Coming soon" is the shape that promises
      // a date nobody has committed to.
      expect(role.reason.toLowerCase()).not.toContain('coming soon');
    }
  });
});

describe('what each door says you get', () => {
  it.each(ACCOUNT_TYPES.map((t) => [t.id, t] as const))(
    '%s lists real navigation groups',
    (_id, type) => {
      // Derived from `packages/navigation`, so an empty list means the lookup
      // silently missed — which would render "You get:" followed by nothing.
      expect(type.features.length, `${type.id} lists no features`).toBeGreaterThan(2);
      for (const f of type.features) {
        expect(f).toBeTruthy();
        // Group LABELS, not ids: `my-vehicles` in front of a new user is the
        // platform's internal vocabulary leaking onto its first screen.
        expect(f, `"${f}" looks like an id, not a label`).not.toMatch(/^[a-z-]+$/);
      }
    },
  );

  it('gives every door a distinct label and call to action', () => {
    expect(new Set(ACCOUNT_TYPES.map((t) => t.label)).size).toBe(ACCOUNT_TYPES.length);
    expect(new Set(ACCOUNT_TYPES.map((t) => t.href)).size).toBe(ACCOUNT_TYPES.length);
    for (const t of ACCOUNT_TYPES) {
      expect(t.cta, `${t.id} has no call to action`).toBeTruthy();
      expect(t.summary, `${t.id} has no summary`).toBeTruthy();
    }
  });
});
