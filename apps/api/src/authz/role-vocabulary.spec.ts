import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PRECEDENCE } from './permission-matrix';

/**
 * 🔴 A ROLE NAME THAT DOES NOT EXIST IS A SILENT LOCKOUT.
 *
 * `WORKSHOP_STAFF_ROLES` listed `'quality_controller'`. There is no such role:
 * the name in `identity.memberships.role_name`, in `ROLE_PERMISSIONS`, in
 * `ROLE_PRECEDENCE`, in `MembershipService`'s grantable list and in every
 * `repair/*-rules.ts` set is `'quality_control_inspector'`. The phantom had
 * been copied into six more lists — settings, reports, knowledge (twice), comms
 * and calls — so a quality control inspector was refused by `assertWorkshopStaff`
 * and by every one of those gates, while `CAN_INSPECT` and `ROLE_TARGET_STAGES`
 * correctly admitted them to the quality-control stage they exist to run.
 *
 * It fails CLOSED, so it was a lockout and not a leak. That is exactly why it
 * survived: nothing errored, nothing was logged, and the person affected saw a
 * refusal that read like a deliberate policy. This repository already has the
 * lesson recorded — "a NAME that is wrong reads as a POLICY statement".
 *
 * ── ⚠️ WHY A SCANNER AND NOT A LIST OF IMPORTS ─────────────────────────────
 *
 * A test that imports the lists it knows about only ever checks the lists
 * somebody remembered to add to it — and most of these constants are
 * module-private, so half of them could not be imported at all without
 * exporting internals purely to be tested. The next invented name will be in
 * the list nobody added. So this READS THE SOURCE, and a new role list is
 * covered the moment it is written.
 *
 * `agents/agent-operator-roles.ts` does the same job for its own list at MODULE
 * LOAD, which is stronger for that one constant (a typo cannot reach a running
 * server even if the suite is skipped) and weaker everywhere else (it protects
 * exactly one list). The two are complements; this is the repo-wide half.
 */

/** `apps/api/src` — the tree this test is responsible for. */
const SRC = resolve(__dirname, '..');

/**
 * A DECLARED, WHOLLY-LITERAL LIST: `const NAME = [...]`, `new Set([...])` or
 * `Object.freeze([...])`. Anything computed is out of scope — this test can
 * only judge names it can read.
 */
const DECLARATION =
  /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)(?:\s*:[^=]+)?\s*=\s*(?:new\s+Set\s*\(\s*|Object\.freeze\s*\(\s*)?\[([^\]]*)\]/g;

/**
 * The naming convention every role gate in this codebase already follows:
 * `MAY_READ_CONFIG`, `MAY_START_CALL`, `CAN_INSPECT`, `CAN_READ_JOBS`,
 * `WORKSHOP_STAFF_ROLES`, `GRANTABLE_ROLES`, `CUSTOMER_THREAD_RECEIVERS`.
 *
 * Matching on the NAME (rather than only on the contents) is what makes a list
 * whose every entry is invented still fail — a contents-only rule would call
 * such a list "not a role list" and wave it through.
 */
const ROLE_LIST_NAME = /^(MAY_|CAN_)|(_ROLES|_RECEIVERS)$/;

/**
 * ⚠️ TWO OTHER VOCABULARIES EXIST AND ARE NOT WRONG. Named here with the reason
 * rather than silently skipped, because an unexplained exclusion is how the
 * next real defect gets excluded too.
 */
const OTHER_VOCABULARIES: Readonly<Record<string, string>> = {
  /**
   * `catalogue.supplier_members.role` — `'owner' | 'staff'`, mirroring
   * `ck_supplier_member_role` in migration 023. A supplier is not an
   * organisation in this schema, and these are not `identity.memberships`
   * role names at all.
   */
  SUPPLIER_MEMBER_ROLES: 'catalogue.supplier_members.role, per migration 023',
  /**
   * The names POSTGRES accepts as the platform administrator, which
   * deliberately includes the bare literal `'admin'` that seed scripts,
   * migrations and hand-run psql set. Its own comment explains why, and
   * `permission-matrix.spec` asserts it against the SQL text of migration 025.
   */
  DB_PLATFORM_ADMIN_ROLE_NAMES: 'the SQL vocabulary, asserted against migration 025',
};

interface FoundList {
  file: string;
  name: string;
  roles: string[];
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * ⚠️ COMMENT LINES ARE BLANKED FIRST, and that is not a convenience. These
 * files discuss role names in prose constantly — `testing-rules.ts` has a
 * paragraph about `quality_control_inspector` being ABSENT from its set. A
 * scanner that read the prose would report lists that do not exist. What is
 * checked is what the module evaluates.
 *
 * Lines are blanked rather than removed so nothing shifts: a declaration that
 * follows a comment block still parses the same.
 */
function statementsOf(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : line;
    })
    .join('\n');
}

function roleListsIn(file: string): FoundList[] {
  const code = statementsOf(readFileSync(file, 'utf8'));
  const lines = code.split('\n');
  const found: FoundList[] = [];

  for (const match of code.matchAll(DECLARATION)) {
    const name = match[1]!;
    const body = match[2]!;
    if (name in OTHER_VOCABULARIES) continue;

    // Every element must be a plain string literal. If anything else is in
    // there (a spread, an identifier, a number) this is not a list of names
    // that can be judged by reading it.
    const withoutStrings = body.replace(/'[^']*'|"[^"]*"/g, '').replace(/[\s,]/g, '');
    if (withoutStrings !== '') continue;

    const items = [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]!);
    if (items.length === 0) continue;

    // A role list is one that is NAMED like a role gate, or one that holds at
    // least one real role name AND is used somewhere in its own file in a
    // sentence about roles (`MAY_X.includes(ctx.activeRole)`,
    // `FRONT_DESK.includes(role)`). The second arm catches lists that do not
    // follow the naming convention; the first catches lists whose contents are
    // entirely invented and would otherwise look like something else.
    const holdsARealRole = items.some((i) => ROLE_PRECEDENCE.includes(i));
    const usedAboutRoles = lines.some(
      (line) => line.includes(name) && !line.includes(`const ${name}`) && /role/i.test(line),
    );
    if (!ROLE_LIST_NAME.test(name) && !(holdsARealRole && usedAboutRoles)) continue;

    found.push({ file: file.slice(SRC.length + 1).replace(/\\/g, '/'), name, roles: items });
  }
  return found;
}

const LISTS = sourceFiles(SRC).flatMap(roleListsIn);

describe('every role name used in a role gate is a role that exists', () => {
  /**
   * 🔴 THE SCANNER MUST BE PROVED TO SCAN. A green gate that ran ZERO tests for
   * two days is recorded in this repository, and a source scanner that silently
   * matched nothing would pass every assertion below for ever. These are the
   * lists that actually exist today, including all seven that carried the
   * phantom name.
   */
  it('finds the role lists it is supposed to be checking', () => {
    const names = LISTS.map((l) => `${l.file}:${l.name}`);
    for (const expected of [
      'authz/workshop-roles.ts:WORKSHOP_STAFF_ROLES',
      'settings/settings.service.ts:MAY_READ_CONFIG',
      'reports/reports.service.ts:MAY_READ_OPERATIONS',
      'knowledge/knowledge.service.ts:MAY_READ_LIBRARY',
      'knowledge/knowledge.service.ts:MAY_WRITE',
      'comms/comms.service.ts:MAY_START_THREAD',
      'calls/calls.service.ts:MAY_START_CALL',
      // …and lists that follow no naming convention, reached by the second arm.
      'reception/reception-rules.ts:FRONT_DESK',
      'repair/quality-rules.ts:CAN_INSPECT',
    ]) {
      expect(names, expected).toContain(expected);
    }
    // A floor, not the exact count: adding a role gate must not fail this test.
    expect(LISTS.length).toBeGreaterThanOrEqual(40);
  });

  /**
   * 🔴 THE ONE THAT WOULD HAVE CAUGHT IT. `quality_controller` is not in
   * `ROLE_PRECEDENCE`, so every list naming it fails here — by name and by
   * file, so the report says where to go.
   */
  it('names no role that is absent from ROLE_PRECEDENCE', () => {
    const offenders = LISTS.flatMap((l) =>
      l.roles.filter((r) => !ROLE_PRECEDENCE.includes(r)).map((r) => `${l.file}:${l.name} → "${r}"`),
    );
    expect(
      offenders,
      'A role name that does not exist fails CLOSED: whoever holds the real role is ' +
        'silently refused, and the refusal reads like a deliberate policy. Add the ' +
        'role to ROLE_PRECEDENCE, or correct the spelling.',
    ).toEqual([]);
  });

  /**
   * The specific phantom, pinned by name so it cannot come back by copy-paste
   * into somewhere the declaration scanner does not look — an object key, a SQL
   * literal, a `switch` arm.
   *
   * ⚠️ COMMENTS ARE EXCLUDED HERE TOO, and there is a live reason:
   * `agents/agent-operator-roles.ts` QUOTES the wrong name while explaining the
   * defect. Banning the string in prose would ban writing down what happened.
   */
  it('executes no `quality_controller` anywhere in the API source', () => {
    const canonical = 'quality_control_inspector';
    expect(ROLE_PRECEDENCE).toContain(canonical);
    expect(ROLE_PRECEDENCE).not.toContain('quality_controller');

    const hits = sourceFiles(SRC)
      .filter((f) => /\bquality_controller\b/.test(statementsOf(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'));
    expect(hits, `the role is called "${canonical}"`).toEqual([]);
  });

  /**
   * ⚠️ AND THE INSPECTOR IS ACTUALLY ADMITTED. The assertions above would all
   * pass if somebody "fixed" the phantom by DELETING it — which would leave the
   * same lockout with nothing left to find. These are the lists §50 says a
   * quality control inspector belongs to.
   */
  it('admits the quality control inspector to the gates the phantom locked', () => {
    const shouldAdmit = [
      'authz/workshop-roles.ts:WORKSHOP_STAFF_ROLES',
      'settings/settings.service.ts:MAY_READ_CONFIG',
      'reports/reports.service.ts:MAY_READ_OPERATIONS',
      'knowledge/knowledge.service.ts:MAY_READ_LIBRARY',
      'knowledge/knowledge.service.ts:MAY_WRITE',
      'comms/comms.service.ts:MAY_START_THREAD',
      'calls/calls.service.ts:MAY_START_CALL',
    ];
    for (const key of shouldAdmit) {
      const list = LISTS.find((l) => `${l.file}:${l.name}` === key);
      expect(list, key).toBeDefined();
      expect(list!.roles, key).toContain('quality_control_inspector');
    }
  });
});
