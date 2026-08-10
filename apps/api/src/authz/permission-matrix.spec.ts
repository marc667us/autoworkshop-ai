import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_PRECEDENCE,
  DB_PLATFORM_ADMIN_ROLE_NAMES,
  permissionsForRole,
  rolePrecedence,
} from './permission-matrix';

/**
 * Permission matrix (T-0004) — the mapping `viewerGrants()` will finally read.
 *
 * These assert the two properties that matter: it fails CLOSED, and it stays in
 * step with the roles that can actually be granted.
 */

describe('permissionsForRole', () => {
  it('gives an unknown role NOTHING, never a default set', () => {
    // A typo in a role name must remove access, not grant it. If this ever
    // returned a default, a misspelling would silently hand out permissions.
    expect(permissionsForRole('workshop_ownr')).toEqual([]);
    expect(permissionsForRole('')).toEqual([]);
    expect(permissionsForRole('__proto__')).toEqual([]);
    expect(permissionsForRole('constructor')).toEqual([]);
  });

  it('grants platform.admin to exactly one role', () => {
    // §32 — the administration surface is for authorised administrative users.
    // Any second holder of this key is a finding, not a convenience.
    const holders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.platformAdmin))
      .map(([role]) => role);
    expect(holders).toEqual(['platform_administrator']);
  });

  it('withholds finance.read from every role §50 does not give financial access', () => {
    // §50 verbatim: manager = "daily operational control"; supervisor =
    // "technical review ... quality oversight"; technician = assigned-job work;
    // storekeeper = parts; QC = testing and quality. None is financial.
    for (const role of [
      'workshop_manager',
      'workshop_supervisor',
      'technician',
      'storekeeper',
      'quality_control_inspector',
      'towing_operator',
      'customer',
    ]) {
      expect(permissionsForRole(role), `${role} must not hold finance.read`).not.toContain(
        PERMISSIONS.financeRead,
      );
    }
  });

  it('grants finance.read to the roles §50 gives financial functions', () => {
    // owner "financial and reporting"; reception "invoice and release";
    // cashier "invoice review, payment collection and receipt generation".
    for (const role of ['workshop_owner', 'reception_staff', 'cashier']) {
      expect(permissionsForRole(role), `${role} needs finance.read`).toContain(
        PERMISSIONS.financeRead,
      );
    }
  });

  it('does not let an operational role administer the organisation', () => {
    for (const role of ['workshop_manager', 'technician', 'reception_staff', 'cashier']) {
      expect(permissionsForRole(role)).not.toContain(PERMISSIONS.organizationAdmin);
    }
  });

  it('returns a frozen table that a caller cannot widen at runtime', () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
  });
});

describe('the matrix and the grantable-role allow-list must stay in step', () => {
  /**
   * `MembershipService.GRANTABLE_ROLES` decides which roles may be assigned;
   * this matrix decides what each one may then see. A role that can be granted
   * but has no entry here receives NO permissions — which fails closed, so it
   * is safe, but presents as a user who logs in to an empty application and
   * looks like a bug at the screen rather than a gap in a table.
   *
   * The list is duplicated here deliberately rather than imported: importing it
   * would make the two agree by construction and prove nothing. This is the one
   * place the duplication is the point.
   */
  const GRANTABLE = [
    'workshop_owner',
    'workshop_manager',
    'reception_staff',
    'workshop_supervisor',
    'technician',
    'storekeeper',
    'quality_control_inspector',
    'cashier',
    'supplier_owner',
    'fleet_administrator',
    'insurance_assessor',
    'towing_operator',
    'customer',
  ];

  it('every grantable role has a matrix entry', () => {
    const missing = GRANTABLE.filter((r) => !(r in ROLE_PERMISSIONS));
    expect(missing, 'grantable roles with no permission-matrix entry').toEqual([]);
  });

  /**
   * 🔴 THE DRIFT THAT MADE NINE POLICIES INERT.
   *
   * Reads the SQL rather than restating it. A test that hard-coded the same two
   * strings would have passed happily throughout the four migrations in which
   * the database accepted only `admin` — the whole failure was that nobody
   * compared the two places.
   */
  describe('the SQL predicate accepts the role name the application actually sets', () => {
    function migrationText(name: string): string {
      let dir = resolve(__dirname);
      let sqlPath = '';
      for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
        const candidate = join(dir, `infrastructure/migrations/${name}`);
        if (existsSync(candidate)) sqlPath = candidate;
        dir = dirname(dir);
      }
      // Fail loudly rather than skip — a silent skip lets the two drift while
      // the suite still reports green, which is exactly how this got here.
      expect(sqlPath, `could not locate ${name}`).not.toBe('');
      return readFileSync(sqlPath, 'utf8');
    }

    /**
     * ⚠️ THE CANONICAL DEFINITION IS IN 001, NOT 025 — corrected 2026-08-01.
     *
     * This test originally read 025, and that was wrong in a way worth
     * recording: `identity.is_platform_admin()` has existed since migration
     * 001 and ALWAYS accepted both names. 025 re-declared it with
     * `CREATE OR REPLACE` and an identical body — a no-op, verified
     * character-for-character.
     *
     * So the real defect in 021-024 was NOT "two vocabularies nobody mapped".
     * It was that those four migrations IGNORED an existing helper which
     * already got this right, and hand-rolled `current_role_name() = 'admin'`
     * instead — while fourteen other migrations called the helper correctly.
     * A test anchored to 025 would keep passing if somebody edited 001, which
     * is the file that actually defines behaviour.
     */
    function adminNamesIn(sql: string): string[] {
      const body = /current_role_name\(\)\s+IN\s*\(([\s\S]*?)\)/.exec(sql)?.[1] ?? '';
      return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
    }

    /**
     * 🔴 THE DEFINITION MOVED, AND ANCHORING TO THE OLD FILE WOULD HAVE PASSED
     * FOREVER AGAINST BEHAVIOUR THAT NO LONGER EXISTS.
     *
     * This block used to read 001, on the correct reasoning that 001 was where
     * the function was really defined. Migration **077** replaced it again, and
     * 001 still contains its original two-name body — so the old assertion
     * would keep passing, green, describing a predicate the database stopped
     * using. That is the same class as the stale-artifact trap recorded
     * elsewhere in this repo: a test whose passing and whose irrelevance look
     * identical.
     *
     * Anchored to 077 and, more importantly, asserted on SHAPE rather than on a
     * name list — because 077's body is no longer an `IN (...)` at all.
     */
    it('077 is the newest is_platform_admin() and it no longer names a membership role', () => {
      const sql = migrationText('077_platform_administrator_grants.sql').replace(/--[^\n]*/g, '');
      const body = /CREATE OR REPLACE FUNCTION identity\.is_platform_admin[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(
        sql,
      )?.[1];

      expect(body, 'could not find the 077 function body').toBeTruthy();
      // The seed/psql alias survives, and it is the ONLY name tested.
      expect(body).toContain("identity.current_role_name() = 'admin'");
      // 🔴 The whole point of 077: the membership role name buys nothing.
      //
      // ⚠️ THE QUOTED LITERAL, NOT THE BARE WORD. A plain
      // `.not.toContain('platform_administrator')` FAILS against a correct
      // migration, because the TABLE is called
      // `identity.platform_administrators` and contains that substring. The
      // claim is about a SQL string literal being COMPARED, not about the word
      // appearing. Written the loose way first and caught by this suite.
      expect(
        body,
        'a membership role_name is conferring platform authority again',
      ).not.toContain("'platform_administrator'");
      // Authority is a grant row, checked against the current USER.
      expect(body).toContain('identity.platform_administrators');
      expect(body).toContain('revoked_at IS NULL');
    });

    it('DB_PLATFORM_ADMIN_ROLE_NAMES is now the database alias alone', () => {
      // Not a list of administrators — see the comment on the constant. A real
      // administrator's `activeRole` is deliberately NOT in here.
      expect([...DB_PLATFORM_ADMIN_ROLE_NAMES]).toEqual(['admin']);
    });

    it('001 and 025 are superseded, and are allowed to differ from 077', () => {
      // Kept as a record rather than deleted: three `CREATE OR REPLACE` bodies
      // now exist for one function and the LAST APPLIED wins. 001 and 025 still
      // agree with each other; 077 is what runs.
      expect(adminNamesIn(migrationText('025_platform_admin_role_name.sql'))).toEqual(
        adminNamesIn(migrationText('001_tenancy_foundation.sql')),
      );
      expect(adminNamesIn(migrationText('001_tenancy_foundation.sql'))).toContain(
        'platform_administrator',
      );
    });

    it('the catalogue migrations call the helper rather than restating it', () => {
      // The actual 021-024 defect: a hand-rolled predicate that omitted the
      // role name the application sets. Anchored here so a future migration
      // cannot reintroduce it by copying the old shape.
      for (const name of [
        '021_public_catalogue.sql',
        '022_marketplace_orders.sql',
        '023_supplier_accounts.sql',
        '024_supplier_catalogue.sql',
      ]) {
        // These four are historical and still contain the old text; 025 is what
        // repointed their POLICIES. What must never happen again is a NEW
        // migration hand-rolling it — asserted on 025 and 026, the two written
        // after the lesson.
        expect(typeof migrationText(name)).toBe('string');
      }
      for (const name of ['025_platform_admin_role_name.sql', '026_fitment_publication_guard.sql']) {
        // ⚠️ COMMENTS STRIPPED FIRST. Both files QUOTE the old predicate while
        // explaining why it was wrong, and the first version of this assertion
        // failed on that quotation — flagging the explanation as the defect it
        // describes. Only executable SQL can hand-roll anything.
        const executable = migrationText(name).replace(/--[^\n]*/g, '');
        expect(executable, `${name} should not hand-roll the admin predicate`).not.toContain(
          "current_role_name() = 'admin'",
        );
      }
    });

    it('platform_administrator is still a matrix role, and no longer a SQL one', () => {
      // ⚠️ THIS ASSERTION WAS INVERTED BY 077, DELIBERATELY.
      //
      // It used to require `platform_administrator` in the SQL list, because
      // without it an administrator "can write nothing". That was true while the
      // membership role name WAS the authority. 077 moved the authority to
      // `identity.platform_administrators`, so the name must now be absent from
      // the SQL vocabulary — its presence would be the escalation 077 closed.
      //
      // It remains a permission-matrix role: that is what grants
      // `platform.admin`, which is what every controller now gates on.
      expect(DB_PLATFORM_ADMIN_ROLE_NAMES).not.toContain('platform_administrator');
      expect(Object.keys(ROLE_PERMISSIONS)).toContain('platform_administrator');
      expect(permissionsForRole('platform_administrator')).toContain(PERMISSIONS.platformAdmin);
    });

    it('does not admit any OTHER role from the matrix', () => {
      // Widening this list is a privilege escalation across every catalogue and
      // marketplace table at once, so it is asserted rather than trusted.
      const admins = new Set(DB_PLATFORM_ADMIN_ROLE_NAMES);
      const wrongly = Object.keys(ROLE_PERMISSIONS).filter(
        (r) => admins.has(r) && r !== 'platform_administrator',
      );
      expect(wrongly, 'non-administrator roles treated as platform admin in SQL').toEqual([]);
    });
  });

  it('every role in the matrix is RANKED for the default tie-break', () => {
    // A role with no rank sorts LAST, which fails safe but is silent — and the
    // symptom at the screen is a user resolving as a weaker role than they
    // hold, with nothing to explain it. Two lists that must move together are
    // exactly the pair that drifts, so assert it rather than remember it.
    const unranked = Object.keys(ROLE_PERMISSIONS).filter((r) => !ROLE_PRECEDENCE.includes(r));
    expect(unranked, 'roles with a permission entry but no precedence rank').toEqual([]);
  });

  it('the precedence list ranks no role that does not exist', () => {
    // The other direction: a rank for a role nobody can hold reads as a
    // supported configuration and quietly outranks real ones if it is ever
    // seeded by hand.
    const phantom = ROLE_PRECEDENCE.filter((r) => !(r in ROLE_PERMISSIONS));
    expect(phantom, 'ranked roles with no permission-matrix entry').toEqual([]);
  });

  it('precedence puts governance above execution, not alphabetically', () => {
    // The ordering is the whole point — a list that happened to be alphabetical
    // would rank `cashier` above `workshop_owner`. Spot-check the pairs the
    // owner account actually depends on (`07.txt` pt2 §50).
    expect(rolePrecedence('platform_administrator')).toBeLessThan(rolePrecedence('workshop_owner'));
    expect(rolePrecedence('workshop_owner')).toBeLessThan(rolePrecedence('workshop_manager'));
    expect(rolePrecedence('workshop_manager')).toBeLessThan(rolePrecedence('technician'));
    expect(rolePrecedence('reception_staff')).toBeLessThan(rolePrecedence('technician'));
  });

  it('an unknown role ranks LAST, never first', () => {
    expect(rolePrecedence('not_a_role')).toBeGreaterThan(rolePrecedence('customer'));
  });

  it('every matrix entry is a role that can actually be granted', () => {
    // The other direction: an entry for a role nobody can hold is dead weight
    // that reads as a supported configuration.
    const grantable = new Set([...GRANTABLE, 'platform_administrator']);
    const orphans = Object.keys(ROLE_PERMISSIONS).filter((r) => !grantable.has(r));
    expect(orphans, 'permission entries for non-grantable roles').toEqual([]);
  });

  it('only permission keys the navigation actually gates on are granted', () => {
    // Guards against the matrix growing speculative keys no screen consumes,
    // which later get copied as though they were a decided taxonomy.
    const known = new Set<string>(Object.values(PERMISSIONS));
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(known.has(p), `${role} grants unknown permission '${p}'`).toBe(true);
      }
    }
  });
});
