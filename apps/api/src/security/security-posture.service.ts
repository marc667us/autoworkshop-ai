import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * The Security Hub — posture audit.
 *
 * Modelled on Solar's `new_soc2_audit_routes.py`, whose one load-bearing idea is
 * worth restating because it is what makes this file worth having:
 *
 *   **It walks the LIVE database and reports what it MEASURES, never what the
 *   migrations claim.**
 *
 * That distinction has already cost this project real time. Migration 016
 * declared a `tenant_isolation` policy on `repair.organization_pricing` and the
 * file read correctly; what the database actually did was let a technician
 * rewrite the workshop's labour rate. Solar shipped 33 tables with RLS `ENABLE`d
 * and never `FORCE`d, leaving every policy on them inert while every migration
 * file looked right. A control that is configured but has no effect is the most
 * expensive defect class in both codebases, and reading the schema files can
 * never detect it — only interrogating `pg_catalog` can.
 *
 * ⚠️ SCOPED TO THE APPLICATION SCHEMAS, DELIBERATELY. Keycloak shares this
 * database and owns the entire `public` schema — roughly ninety tables with no
 * RLS, correctly so, because Keycloak does its own authorization and the
 * application role cannot read them anyway. Auditing them would produce ninety
 * findings that can never be fixed, and a report that is mostly noise is a
 * report nobody reads. `_backup` and `_drill` are operational fixtures for the
 * restore drill and are excluded for the same reason.
 *
 * ⚠️ READ-ONLY, AND THERE IS DELIBERATELY NO REMEDIATION PATH. Solar's AI-SOC
 * shipped its kill switch and its detection slices before anything could act,
 * and slices 0-3 there still take ZERO automated actions. This module is the
 * equivalent of those slices: it observes and reports. Nothing here writes a
 * row, alters a policy, or changes a grant. Fixing a finding is a migration,
 * reviewed like any other.
 */

/** The schemas this application owns. Everything else is somebody else's. */
const APP_SCHEMAS = ['identity', 'core', 'repair', 'catalogue', 'audit'] as const;

/**
 * Ordinary tables AND partitioned tables.
 *
 * ⚠️ `'p'` IS NOT OPTIONAL, and leaving it out is the same defect class as the
 * `polwithcheck IS NULL` bug this file already shipped once: a predicate that
 * silently matches nothing. PostgreSQL gives a PARTITIONED table `relkind = 'p'`,
 * not `'r'`, so every control here would have skipped one entirely — a
 * partitioned table with no RLS, no foreign keys, or a writable audit grant
 * would simply not appear in the report, and the report would say "pass".
 *
 * There are no partitioned tables in this schema today, which is exactly why it
 * had to be fixed now: the first one added would arrive unmeasured and nothing
 * would say so. Raised by Codex.
 */
const TABLE_KINDS = ['r', 'p'] as const;

export type ControlStatus = 'pass' | 'warn' | 'fail';

export interface PostureControl {
  /** Stable id — the UI and any future alerting key off this, not the title. */
  id: string;
  title: string;
  status: ControlStatus;
  /** One sentence a non-specialist can act on. */
  summary: string;
  /** What was actually measured. Empty when the control passed cleanly. */
  findings: string[];
  /** Why this control exists, in terms of a defect that really happened. */
  rationale: string;
}

export interface SecurityPosture {
  generatedAt: string;
  schemas: string[];
  controls: PostureControl[];
  counts: { pass: number; warn: number; fail: number };
}

/**
 * Identifier columns that deliberately carry no foreign key, and why.
 *
 * ⚠️ AN EXEMPTION LIST IS A LIABILITY UNLESS IT CARRIES ITS REASONING. A bare
 * list of names would let a future entry be added to silence a finding, which is
 * precisely how a real gap gets buried. Each entry has to say what protects the
 * column INSTEAD, because a comment does not stop anyone.
 */
const ACCEPTED_WITHOUT_FK: Record<string, string> = {
  'audit.events.tenant_id':
    'An audit trail must outlive the thing it describes. ON DELETE CASCADE would ' +
    'erase the record of a tenant at the moment that record matters most; ' +
    'RESTRICT would make the audit log a reason a tenant can never be removed. ' +
    'Both are wrong for append-only evidence, so the id is recorded as a value.',
  'audit.events.organization_id': 'As audit.events.tenant_id — evidence outlives its subject.',
  'audit.events.actor_user_id':
    'As audit.events.tenant_id. Also: actor_kind may be "agent" or "system", ' +
    'for which there is no user row to point at.',
};

/**
 * Tables deliberately NOT under row-level security, with the compensating
 * control that makes each one safe. Same discipline as `ACCEPTED_WITHOUT_FK`:
 * the reason is mandatory, and each claim is asserted by a test elsewhere.
 */
const ACCEPTED_WITHOUT_RLS: Record<string, string> = {
  'identity.users':
    'One human may hold memberships in several tenants, so a user row cannot ' +
    'belong to any single tenant (migration 001). Compensating control: every ' +
    'query reaches it ONLY by joining identity.memberships, which is ENABLE+FORCE. ' +
    'Asserted by user_directory_is_scoped_by_membership, not by comment.',
  'core.vehicle_makes':
    'Shared reference data — the list of vehicle manufacturers is the same for ' +
    'every tenant and contains nothing tenant-owned. Read-only to the application.',
  'core.vehicle_models':
    'Shared reference data, as core.vehicle_makes.',
};

@Injectable()
export class SecurityPostureService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * ⚠️ `queryWithoutTenant`, AND THAT IS CORRECT RATHER THAN LAZY. Every query
   * below reads `pg_catalog`, which is server-wide metadata and carries no
   * tenant column for a policy to filter on — running them inside `withTenant`
   * would set a context that no statement here consults and imply a scoping
   * that does not exist. The authorization for this data is the ROUTE's
   * administrator check, which is where it belongs and where it is tested.
   *
   * Nothing returned is tenant data: these are table names, policy shapes and
   * counts. No row of customer, vehicle or job data is read by this file.
   */
  async audit(): Promise<SecurityPosture> {
    const controls = await Promise.all([
      this.rlsEnabled(),
      this.rlsForced(),
      this.policyShape(),
      this.foreignKeysPresent(),
      this.foreignKeysValidated(),
      this.auditAppendOnly(),
      this.auditActivity(),
      this.connectionRole(),
    ]);

    const counts = { pass: 0, warn: 0, fail: 0 };
    for (const c of controls) counts[c.status] += 1;

    return {
      // Stamped from the database clock, not the API process clock: the reader
      // is being told when the DATABASE was in this state.
      generatedAt: await this.now(),
      schemas: [...APP_SCHEMAS],
      controls,
      counts,
    };
  }

  private async now(): Promise<string> {
    const rows = await this.db.queryWithoutTenant<{ now: Date }>('SELECT now() AS now');
    return (rows[0]?.now ?? new Date()).toISOString();
  }

  /**
   * Control 1 — row-level security is ENABLED on every application table.
   *
   * A table with RLS off is not protected by a weaker policy; it has no policy
   * at all, and every row is visible to any query the application makes.
   */
  private async rlsEnabled(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{ table_name: string }>(
      `SELECT n.nspname || '.' || c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = ANY($2)
          AND n.nspname = ANY($1)
          AND NOT c.relrowsecurity
        ORDER BY 1`,
      [APP_SCHEMAS, TABLE_KINDS],
    );

    const unexpected = rows.filter((r) => !(r.table_name in ACCEPTED_WITHOUT_RLS));
    const accepted = rows.filter((r) => r.table_name in ACCEPTED_WITHOUT_RLS);

    return {
      id: 'rls.enabled',
      title: 'Row-level security is enabled on every application table',
      status: unexpected.length === 0 ? 'pass' : 'fail',
      summary:
        unexpected.length === 0
          ? `Every application table has RLS enabled, or is one of ${accepted.length} ` +
            `documented exceptions with a named compensating control.`
          : `${unexpected.length} table(s) have NO row-level security and no recorded reason.`,
      findings: [
        ...unexpected.map((r) => `NO RLS, unexplained: ${r.table_name}`),
        ...accepted.map((r) => `accepted: ${r.table_name} — ${ACCEPTED_WITHOUT_RLS[r.table_name]}`),
      ],
      rationale:
        'A table with RLS off returns every row to any query the application ' +
        'makes. Solar found enterprise_sponsor_users in exactly this state — ' +
        'missed entirely rather than merely un-FORCEd.',
    };
  }

  /**
   * Control 2 — RLS is FORCED, not merely enabled.
   *
   * 🔴 THE SINGLE MOST IMPORTANT CHECK IN THIS FILE. PostgreSQL exempts a
   * table's OWNER from its own policies unless `FORCE` is set. Solar measured 33
   * tables `ENABLE`d and not `FORCE`d, which made every policy on them inert
   * while the migrations that created them read perfectly.
   *
   * This application connects as `autoworkshop_app` (NOSUPERUSER, NOBYPASSRLS)
   * and is not the table owner, so an un-FORCEd table is not exploitable today.
   * It is one `ALTER TABLE ... OWNER TO` away from being so, and the migration
   * that did it would look harmless.
   */
  private async rlsForced(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{ table_name: string }>(
      `SELECT n.nspname || '.' || c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = ANY($2)
          AND n.nspname = ANY($1)
          AND c.relrowsecurity
          AND NOT c.relforcerowsecurity
        ORDER BY 1`,
      [APP_SCHEMAS, TABLE_KINDS],
    );

    return {
      id: 'rls.forced',
      title: 'Row-level security is FORCED, so the table owner is not exempt',
      status: rows.length === 0 ? 'pass' : 'fail',
      summary:
        rows.length === 0
          ? 'Every table with RLS enabled also has it forced.'
          : `${rows.length} table(s) have RLS enabled but NOT forced — their policies ` +
            'are inert for the owning role.',
      findings: rows.map((r) => `ENABLED but not FORCED: ${r.table_name}`),
      rationale:
        'Postgres exempts the table owner from its own policies unless FORCE is ' +
        'set. Solar shipped 33 tables in this state; every policy on them read ' +
        'correctly and enforced nothing.',
    };
  }

  /**
   * Control 3 — no `FOR ALL` policy governs a writable table on `USING` alone.
   *
   * 🔴 THIS IS THE DEFECT MIGRATION 029 WAS WRITTEN TO FIX, GENERALISED. A
   * `FOR ALL` policy that carries only `USING` and no `WITH CHECK` has two
   * separate problems, and the second is the one that bites:
   *
   *   1. Postgres reuses `USING` as the `WITH CHECK` for INSERT. Solar's
   *      enterprise onboarding was rejected by its own policy for exactly this
   *      reason — the tenant row had to exist before the membership that would
   *      authorise it.
   *   2. One predicate cannot express "everyone reads, only the owner writes".
   *      `repair.organization_pricing` had one such policy and every role in the
   *      tenant could rewrite the labour rate. Measured, not theorised.
   *
   * Reported as a WARNING rather than a failure: a `FOR ALL` policy is not
   * wrong in itself. On a table where read and write authority genuinely
   * coincide it is the correct, simplest choice. The finding says "these need a
   * decision", not "these are broken".
   */
  private async policyShape(): Promise<PostureControl> {
    // ⚠️ DETECTED BY COMPARING THE TWO EXPRESSIONS, **NOT** BY `polwithcheck IS
    // NULL`. That was the first version of this query and it was a measurement
    // that measured nothing: when a `FOR ALL` policy is written with `USING`
    // alone, PostgreSQL does not leave `polwithcheck` null — it stores a COPY of
    // the `USING` expression. The check therefore returned zero rows against a
    // database holding twenty policies of exactly the shape it was written to
    // find, and it would have reported a clean pass forever.
    //
    // Verified against this database before the query was trusted:
    //   repair.diagnoses | withcheck_is_null=false | same_as_using=true
    //
    // A policy that deliberately states `WITH CHECK (same predicate)` is
    // indistinguishable from one that omitted it, and that is acceptable —
    // both mean read and write authority are identical here, which is the
    // thing worth confirming.
    const rows = await this.db.queryWithoutTenant<{ table_name: string; policy: string }>(
      `SELECT n.nspname || '.' || c.relname AS table_name, p.polname AS policy
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1)
          AND p.polcmd = '*'
          AND pg_get_expr(p.polwithcheck, p.polrelid)
              IS NOT DISTINCT FROM pg_get_expr(p.polqual, p.polrelid)
        ORDER BY 1, 2`,
      [APP_SCHEMAS],
    );

    return {
      id: 'rls.policy_shape',
      title: 'No FOR ALL policy relies on USING as its own WITH CHECK',
      status: rows.length === 0 ? 'pass' : 'warn',
      summary:
        rows.length === 0
          ? 'Every policy that governs writes states its WITH CHECK explicitly.'
          : `${rows.length} FOR ALL policies carry no WITH CHECK, so reads and writes ` +
            'cannot differ and INSERT is governed by the read predicate.',
      findings: rows.map((r) => `${r.table_name}: policy "${r.policy}" is FOR ALL with no WITH CHECK`),
      rationale:
        'Migration 029: repair.organization_pricing had one such policy and a ' +
        'TECHNICIAN was measured rewriting the workshop labour rate. The same ' +
        'shape rejected Solar enterprise onboarding at INSERT time.',
    };
  }

  /**
   * Control 4 — every `*_id` column is backed by a real foreign key.
   *
   * The owner's binding instruction: **use relationships in schemas** — real
   * foreign keys and real joins, not columns that merely hold something that
   * looks like another table's primary key. A `uuid` named `customer_id` with no
   * constraint behind it is a promise the database will not keep: the row it
   * points at can be deleted, or never have existed.
   *
   * ⚠️ AND A FOREIGN KEY IS NOT ISOLATION. Recorded here because the two are
   * routinely confused: a FK proves the referenced row EXISTS, and says nothing
   * about which tenant may see it. Relationships give integrity, RLS gives
   * isolation, and this hub checks both separately because both are required.
   */
  private async foreignKeysPresent(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{ table_name: string; column_name: string }>(
      `SELECT n.nspname || '.' || c.relname AS table_name, a.attname AS column_name
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = ANY($2)
          AND n.nspname = ANY($1)
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname LIKE '%\\_id'
          AND a.atttypid = 'uuid'::regtype
          -- Not covered by ANY foreign key, single-column or composite.
          AND NOT EXISTS (
                SELECT 1 FROM pg_constraint k
                 WHERE k.conrelid = c.oid
                   AND k.contype = 'f'
                   AND a.attnum = ANY (k.conkey))
        ORDER BY 1, 2`,
      [APP_SCHEMAS, TABLE_KINDS],
    );

    const qualified = rows.map((r) => `${r.table_name}.${r.column_name}`);
    const unexplained = qualified.filter((c) => !(c in ACCEPTED_WITHOUT_FK));
    const accepted = qualified.filter((c) => c in ACCEPTED_WITHOUT_FK);

    return {
      id: 'relationships.foreign_keys',
      title: 'Every identifier column is backed by a real foreign key',
      status: unexplained.length === 0 ? 'pass' : 'warn',
      summary:
        unexplained.length === 0
          ? `Every uuid column named *_id participates in a foreign key, or is one of ` +
            `${accepted.length} documented exceptions.`
          : `${unexplained.length} uuid column(s) named *_id have no foreign key and no ` +
            'recorded reason — the row they point at may not exist.',
      findings: [
        ...unexplained.map((c) => `no FK, unexplained: ${c}`),
        ...accepted.map((c) => `accepted: ${c} — ${ACCEPTED_WITHOUT_FK[c]}`),
      ],
      rationale:
        'Owner instruction, binding: relationships in schemas means real foreign ' +
        'keys and real joins. An unconstrained *_id can point at a row that was ' +
        'deleted or never existed. Integrity is not isolation — RLS is checked ' +
        'separately, and both are required.',
    };
  }

  /**
   * Control 5 — no foreign key is left `NOT VALID`.
   *
   * `ADD CONSTRAINT ... NOT VALID` enforces the rule for NEW rows while leaving
   * existing rows unchecked. It is the correct way to add a constraint to a
   * large live table without taking a long lock — and it is only half of the
   * job. Solar carried 22 of 48 foreign keys in this state until migration 021
   * validated them; every historical row turned out to pass, which is the usual
   * outcome and exactly why the second half gets forgotten.
   */
  private async foreignKeysValidated(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{ table_name: string; constraint_name: string }>(
      `SELECT n.nspname || '.' || c.relname AS table_name, k.conname AS constraint_name
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE k.contype = 'f'
          AND NOT k.convalidated
          AND n.nspname = ANY($1)
        ORDER BY 1, 2`,
      [APP_SCHEMAS],
    );

    return {
      id: 'relationships.validated',
      title: 'No foreign key is left NOT VALID',
      status: rows.length === 0 ? 'pass' : 'warn',
      summary:
        rows.length === 0
          ? 'Every foreign key has been validated against existing rows.'
          : `${rows.length} foreign key(s) are NOT VALID — existing rows were never checked.`,
      findings: rows.map((r) => `NOT VALID: ${r.table_name} (${r.constraint_name})`),
      rationale:
        'NOT VALID enforces the rule for new rows only. Solar carried 22 of 48 ' +
        'in this state until migration 021 validated them.',
    };
  }

  /**
   * Control 6 — the audit log is append-only at the GRANT level.
   *
   * CLAUDE.md: approvals, payments, warranty decisions and audit events are
   * append-only. A policy can express that, but a policy is evaluated per row
   * and can be dropped by a later migration without anything noticing. The
   * absence of an UPDATE or DELETE grant is a blunter and more durable control,
   * and it is what this checks.
   *
   * ⚠️ MEASURED AS AN EFFECTIVE PRIVILEGE, not by reading the grant list.
   * `has_table_privilege` accounts for privileges inherited through role
   * membership; enumerating `information_schema.role_table_grants` would miss a
   * grant made to a role that `autoworkshop_app` inherits from, and report a
   * clean pass over a table that is fully writable.
   */
  private async auditAppendOnly(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{
      table_name: string;
      can_update: boolean;
      can_delete: boolean;
    }>(
      `SELECT n.nspname || '.' || c.relname AS table_name,
              has_table_privilege('autoworkshop_app', c.oid, 'UPDATE') AS can_update,
              has_table_privilege('autoworkshop_app', c.oid, 'DELETE') AS can_delete
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = ANY($1)
          AND n.nspname = 'audit'
        ORDER BY 1`,
      [TABLE_KINDS],
    );

    const writable = rows.filter((r) => r.can_update || r.can_delete);

    return {
      id: 'audit.append_only',
      title: 'The audit log cannot be updated or deleted by the application',
      status: rows.length === 0 ? 'fail' : writable.length === 0 ? 'pass' : 'fail',
      summary:
        rows.length === 0
          ? 'No audit tables were found at all — the audit schema is empty.'
          : writable.length === 0
            ? `All ${rows.length} audit table(s) are append-only: no UPDATE or DELETE privilege.`
            : `${writable.length} audit table(s) can be modified after the fact.`,
      findings: writable.map(
        (r) =>
          `${r.table_name} is writable after insert:` +
          `${r.can_update ? ' UPDATE' : ''}${r.can_delete ? ' DELETE' : ''}`,
      ),
      rationale:
        'An audit trail an attacker can edit is not evidence. CLAUDE.md makes ' +
        'audit events append-only; a missing grant survives a dropped policy.',
    };
  }

  /**
   * Control 7 — the audit log is actually receiving events.
   *
   * Solar's SOC-2 audit checks audit-log activity for a reason that this repo
   * has now hit repeatedly in other forms: **a control that is present but
   * never fires is indistinguishable from one that was never wired.** Keycloak
   * reported healthy for thirty hours with a dead database; a Playwright suite
   * exited 0 while running zero tests for two days. An audit table with a
   * correct schema, correct policies and no rows is the same shape of lie.
   *
   * A warning, not a failure: a genuinely idle development database has no
   * events and that is not a defect.
   */
  private async auditActivity(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{ total: string; recent: string; latest: Date | null }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE occurred_at > now() - interval '7 days')::text AS recent,
              max(occurred_at) AS latest
         FROM audit.events`,
    );

    const total = Number(rows[0]?.total ?? 0);
    const recent = Number(rows[0]?.recent ?? 0);
    const latest = rows[0]?.latest ?? null;

    return {
      id: 'audit.activity',
      title: 'The audit log is receiving events',
      status: total === 0 ? 'warn' : 'pass',
      summary:
        total === 0
          ? 'The audit log is EMPTY. Either nothing auditable has happened, or ' +
            'audit writes are not reaching the database.'
          : `${total} audit event(s), ${recent} in the last 7 days` +
            (latest ? `, most recent ${new Date(latest).toISOString()}.` : '.'),
      findings:
        total > 0 && recent === 0
          ? ['No audit events in the last 7 days, though the log is not empty.']
          : [],
      rationale:
        'A control that never fires cannot be distinguished from one that was ' +
        'never wired. Keycloak reported healthy for 30 hours with a dead ' +
        'database; the e2e suite exited 0 while running zero tests for two days.',
    };
  }

  /**
   * Control 8 — the application does not connect as a superuser.
   *
   * `DatabaseService` refuses at boot to use the bootstrap superuser, but that
   * check reads the connection STRING. This one asks the database what the role
   * it is actually connected as can do — a role that was later granted
   * `SUPERUSER` or `BYPASSRLS` would keep the same name and the same URL, and
   * the boot check would still pass while every policy in the database stopped
   * applying.
   */
  private async connectionRole(): Promise<PostureControl> {
    const rows = await this.db.queryWithoutTenant<{
      role_name: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(
      `SELECT rolname AS role_name, rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
         FROM pg_roles WHERE rolname = current_user`,
    );

    const me = rows[0];
    const bad = !me || me.is_superuser || me.bypasses_rls;

    return {
      id: 'connection.least_privilege',
      title: 'The application connects as a role that row-level security applies to',
      status: bad ? 'fail' : 'pass',
      summary: !me
        ? 'The connected role could not be identified.'
        : bad
          ? `Connected as "${me.role_name}", which BYPASSES row-level security. ` +
            'Every policy in this database is inert.'
          : `Connected as "${me.role_name}": not a superuser, does not bypass RLS.`,
      findings: me
        ? [
            `current_user = ${me.role_name}`,
            `SUPERUSER = ${me.is_superuser}`,
            `BYPASSRLS = ${me.bypasses_rls}`,
          ]
        : ['current_user could not be resolved'],
      rationale:
        'A superuser bypasses RLS entirely, even with FORCE. The boot check ' +
        'reads the connection string; this asks the database what the role can ' +
        'actually do, which is what a later GRANT would change.',
    };
  }
}
