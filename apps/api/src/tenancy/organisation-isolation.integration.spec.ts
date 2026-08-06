import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

/**
 * ORGANISATION ISOLATION, OVER THE WHOLE SCHEMA — LIST A item A2 (T-0006).
 *
 * ── 🔴 WHY A WHOLE-SCHEMA SUITE AND NOT ANOTHER PER-MIGRATION VERIFY ───────
 *
 * Each migration from 045 onward carries its own isolation checks and they all
 * pass. That told us nothing about migrations 001–044, and on 2026-08-06 a
 * count found that **~100 policies written before 045 filter on `tenant_id`
 * alone** — no organisation predicate anywhere. A tenant in this database holds
 * MORE THAN ONE organisation, so for the whole original product (customers,
 * vehicles, every `repair.*` table, finance, warranty, parts, reception, media)
 * the database's second line of defence stopped at the tenant boundary.
 *
 * Per-slice verifies could never have found that, because each one only ever
 * looked at its own tables. **This one asks the question of every table at
 * once, and it will ask it again of every table added after today.**
 *
 * `COMPLETION_PLAN.md` §4 item 1: *tenant alone is not isolation here.*
 *
 * ── WHAT IT ASSERTS ────────────────────────────────────────────────────────
 *
 *  1. RLS is ENABLED and FORCED on every tenant-owned table.
 *  2. Every table carrying BOTH `tenant_id` and `organization_id` has at least
 *     one policy naming `current_organization_id()`.
 *  3. Behaviourally: two organisations in ONE tenant cannot see each other's
 *     rows — asserted against a real table, under a role RLS applies to.
 *
 * ── ⚠️ THE EXEMPTIONS ARE NAMED AND ARGUED, NOT A CONVENIENT FILTER ────────
 *
 * A suite that quietly skips what it cannot prove is worth nothing. Every
 * exemption below carries the reason it is not a defect, and adding to the list
 * should feel expensive.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';
const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

/**
 * Tables that legitimately have NO organisation predicate.
 *
 * 🔴 EACH ONE IS HERE FOR A REASON THAT WOULD SURVIVE BEING ASKED ABOUT.
 * The common thread: these are reached by code paths where NO organisation
 * context exists, so an organisation predicate would evaluate against NULL and
 * refuse everything.
 *
 *   · `withUser()` sets only `app.user_id` — the marketplace buyer, who has no
 *     workshop at all (migration 022's whole premise).
 *   · `queryWithoutTenant()` sets nothing — health, the migrations ledger, the
 *     PUBLIC catalogue and the public workshop profile.
 *   · the registration bootstrap (037/038) INSERTs the organisation itself,
 *     before any context could name it.
 */
const NO_ORG_PREDICATE_EXPECTED = new Set([
  // identity: the tenancy spine. An organisation predicate on the table that
  // DEFINES organisations is circular, and registration writes these before any
  // organisation exists to be named.
  'identity.tenants',
  'identity.organizations',
  'identity.users',
  'identity.memberships',
  'identity.branches',
  'identity.roles',
  'identity.role_permissions',
  // public marketplace: reached by buyers with no workshop, via withUser().
  'catalogue.orders',
  'catalogue.order_lines',
  'catalogue.order_events',
  // the public parts catalogue and supplier surface: read anonymously.
  'catalogue.parts',
  'catalogue.part_fitments',
  'catalogue.suppliers',
  'catalogue.supplier_parts',
  'catalogue.vehicle_makes',
  'catalogue.vehicle_models',
  // the audit trail is tenant-wide on purpose: an event about organisation A
  // written while acting in organisation B must still be recorded.
  'audit.events',
]);

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;

/** A test that SKIPS (not passes) when there is no database to prove it against. */
const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) ctx.skip();
    await fn();
  });

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, max: 2, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    reachable = true;
  } catch {
    await pool?.end().catch(() => undefined);
    pool = null;
    console.warn(
      '[organisation-isolation] NO DATABASE at ADMIN_URL — this suite is SKIPPED, not passed. ' +
        'Organisation isolation is NOT proven by this run.',
    );
    return;
  }
  client = await pool.connect();
});

afterAll(async () => {
  client?.release();
  await pool?.end().catch(() => undefined);
});

/** Every table carrying both tenant_id and organization_id. */
async function orgScopedTables(): Promise<string[]> {
  const r = await client!.query<{ t: string }>(
    `SELECT c.table_schema || '.' || c.table_name AS t
       FROM information_schema.columns c
       JOIN information_schema.tables tb
         ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        AND tb.table_type = 'BASE TABLE'
      WHERE c.column_name = 'organization_id'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c2
           WHERE c2.table_schema = c.table_schema
             AND c2.table_name = c.table_name
             AND c2.column_name = 'tenant_id')
      ORDER BY 1`,
  );
  return r.rows.map((x) => x.t);
}

describe('organisation isolation — the whole schema, not one slice', () => {
  dbIt('there are tables to check (the suite must not pass vacuously)', async () => {
    const tables = await orgScopedTables();
    // If this ever drops to zero the query is broken, not the schema clean.
    expect(tables.length).toBeGreaterThan(20);
  });

  dbIt('RLS is ENABLED and FORCED on every organisation-scoped table', async () => {
    const r = await client!.query<{ t: string; enabled: boolean; forced: boolean }>(
      `SELECT n.nspname || '.' || c.relname AS t, c.relrowsecurity AS enabled,
              c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname || '.' || c.relname = ANY($1::text[])`,
      [await orgScopedTables()],
    );
    // ENABLE without FORCE is inert for the owning role — Solar shipped exactly
    // that and every policy was decorative. Both flags, or it proves nothing.
    const bad = r.rows.filter((x) => !x.enabled || !x.forced).map((x) => x.t);
    expect(bad, `RLS not ENABLED+FORCED on: ${bad.join(', ')}`).toEqual([]);
  });

  dbIt('every organisation-scoped table has a policy naming current_organization_id()', async () => {
    const tables = (await orgScopedTables()).filter((t) => !NO_ORG_PREDICATE_EXPECTED.has(t));

    const r = await client!.query<{ t: string; expr: string }>(
      `SELECT schemaname || '.' || tablename AS t,
              coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
         FROM pg_policies
        WHERE schemaname || '.' || tablename = ANY($1::text[])`,
      [tables],
    );

    const withOrg = new Set(
      r.rows.filter((x) => x.expr.includes('current_organization_id')).map((x) => x.t),
    );
    const missing = tables.filter((t) => !withOrg.has(t));

    // 🔴 THE FAILURE MESSAGE IS THE DELIVERABLE. A bare count would send the
    // next reader hunting; this names every table so the retrofit has a list.
    expect(
      missing,
      `${missing.length} table(s) are TENANT-scoped only — a tenant here holds more than one ` +
        `organisation, so these are isolated by the application layer alone:\n  ` +
        missing.join('\n  '),
    ).toEqual([]);
  });

  dbIt('BEHAVIOURAL: one TENANT cannot read another tenant rows', async () => {
    // 🔴 THIS ASSERTION USED TO LIVE IN `tests/tenant-isolation/rls_proof.sql`,
    // WHICH NOTHING RAN. Nothing in `.github/` referenced it, and it had been
    // BROKEN since migrations 037/038 shut the registration bootstrap door —
    // its fixture inserted 0 rows and it then failed on unrelated pre-existing
    // data. A security test nobody runs is not a safety net, it is a note
    // claiming there is one. Moved here, where `pnpm test` runs it.
    const me = (await client!.query<{ id: string }>('SELECT id FROM identity.users LIMIT 1'))
      .rows[0]!.id;
    await client!.query('BEGIN');
    try {
      const tA = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;
      const tB = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;
      const oB = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;

      await client!.query(`SELECT set_config('app.bootstrap','on',true)`);
      await client!.query(`SELECT set_config('app.bootstrap_user',$1,true)`, [me]);
      for (const [id, slug] of [[tA, 'tiso-a'], [tB, 'tiso-b']] as const) {
        await client!.query(
          `INSERT INTO identity.tenants (id,name,slug,created_by) VALUES ($1,$2,$3,$4)`,
          [id, `tiso ${slug}`, `${slug}-${id.replace(/-/g, '')}`, me],
        );
      }
      await client!.query(
        `INSERT INTO identity.organizations (id,tenant_id,name,org_type,created_by)
         VALUES ($1,$2,'tiso B org','individual_workshop',$3)`,
        [oB, tB, me],
      );
      await client!.query(`SELECT set_config('app.bootstrap','off',true)`);

      // Bind to tenant A and try to see tenant B's organisation.
      await client!.query(`SELECT set_config('app.tenant_id',$1,true)`, [tA]);
      await client!.query(`SELECT set_config('app.organization_ids','',true)`);
      await client!.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const seen = await client!.query(`SELECT id FROM identity.organizations WHERE id = $1`, [oB]);
      await client!.query('RESET ROLE');

      expect(seen.rowCount, 'tenant A can read an organisation belonging to tenant B').toBe(0);
    } finally {
      await client!.query('ROLLBACK').catch(() => undefined);
      await client!.query('RESET ROLE').catch(() => undefined);
    }
  });

  dbIt('BEHAVIOURAL: one organisation cannot read another organisation rows', async () => {
    // 🔴 THE MECHANICAL CHECKS ABOVE READ THE CATALOGUE. This one reads the
    // DATA, because a policy that exists and a policy that works are different
    // claims — and this repository has shipped a correct-looking policy that
    // applied to nobody.
    const me = (await client!.query<{ id: string }>('SELECT id FROM identity.users LIMIT 1'))
      .rows[0]!.id;

    await client!.query('BEGIN');
    try {
      const tid = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;
      const orgA = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;
      const orgB = (await client!.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;

      await client!.query(`SELECT set_config('app.bootstrap','on',true)`);
      await client!.query(`SELECT set_config('app.bootstrap_user',$1,true)`, [me]);
      await client!.query(
        `INSERT INTO identity.tenants (id,name,slug,created_by) VALUES ($1,'orgiso',$2,$3)`,
        [tid, `orgiso-${tid.replace(/-/g, '')}`, me],
      );
      // TWO organisations in ONE tenant — the shape that makes a tenant-only
      // predicate insufficient. Without the second there is nothing to be
      // isolated FROM and the assertion passes vacuously.
      for (const [id, name] of [[orgA, 'orgiso A'], [orgB, 'orgiso B']] as const) {
        await client!.query(
          `INSERT INTO identity.organizations (id,tenant_id,name,org_type,created_by)
           VALUES ($1,$2,$3,'individual_workshop',$4)`,
          [id, tid, name, me],
        );
      }
      await client!.query(`SELECT set_config('app.bootstrap','off',true)`);

      await client!.query(`SELECT set_config('app.tenant_id',$1,true)`, [tid]);

      // Write a customer into organisation B.
      await client!.query(`SELECT set_config('app.organization_ids',$1,true)`, [orgB]);
      const cust = (
        await client!.query<{ id: string }>(
          `INSERT INTO core.customers (tenant_id,organization_id,display_name,created_by)
           VALUES ($1,$2,'orgiso B customer',$3) RETURNING id`,
          [tid, orgB, me],
        )
      ).rows[0]!.id;

      // Now read as organisation A, under a role RLS actually applies to.
      await client!.query(`SELECT set_config('app.organization_ids',$1,true)`, [orgA]);
      await client!.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const seen = await client!.query(`SELECT id FROM core.customers WHERE id = $1`, [cust]);
      await client!.query('RESET ROLE');

      expect(
        seen.rowCount,
        'organisation A can read a customer belonging to organisation B of the same tenant',
      ).toBe(0);
    } finally {
      await client!.query('ROLLBACK').catch(() => undefined);
      await client!.query('RESET ROLE').catch(() => undefined);
    }
  });
});
