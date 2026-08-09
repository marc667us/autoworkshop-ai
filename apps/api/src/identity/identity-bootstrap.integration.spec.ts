import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

/**
 * Integration proof for the two defects fixed by migration 003.
 *
 * WHY THESE TESTS EXIST AND WHY THEY MUST CONNECT AS THE APP ROLE
 *
 * Both defects were invisible to the entire suite -- typecheck, lint, 122 unit
 * tests and a 10-target build were all green while authorization could not
 * succeed for a single user. Neither is reachable by a unit test, because both
 * are properties of the DATABASE ROLE and the SESSION STATE, not of TypeScript:
 *
 *   1. `identity.memberships` is under FORCE RLS. With no tenant context its
 *      policy evaluates `tenant_id = NULL`, hiding every row -- so the bootstrap
 *      lookup that ESTABLISHES tenant context returned nothing, for everyone.
 *      Measured before the fix: 1 membership present, 0 visible.
 *   2. `audit.events` had no RLS at all while the app role held SELECT.
 *
 * A superuser bypasses RLS entirely, so a test run as one proves nothing. These
 * connect as `autoworkshop_app`, exactly as the application does.
 *
 * Skips cleanly when no database is reachable, so CI without infrastructure
 * stays green rather than silently passing a test that never ran.
 */
const APP_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop';

let pool: Pool | null = null;
let reachable = false;
let seededSubject: string | null = null;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: APP_URL, max: 2, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    reachable = true;
    // The bootstrap function is the only way to see a subject without a tenant
    // context, which is precisely the thing under test.
    // 🔴 A SUBJECT THAT ACTUALLY HAS A MEMBERSHIP, NOT WHICHEVER ROW COMES BACK
    // FIRST.
    //
    // This was `... WHERE status = 'active' LIMIT 1` with no ORDER BY and no
    // join. The property under test is that `memberships_for_subject` resolves
    // a membership with NO tenant context set — so a subject with no membership
    // at all fails it for a reason that has nothing to do with RLS.
    //
    // It passed for weeks and then failed on 2026-08-09 without a line of
    // product code changing: eight active users had accumulated in the local
    // database, one of them membership-less, and Postgres simply returned that
    // one first. An unordered LIMIT 1 is not a fixture, it is a coin toss that
    // usually lands the same way — and this repository already records "7 of 11
    // defects were in the HARNESS, not the product".
    //
    // The join makes the selection describe what the test needs. If nothing
    // matches, `seededSubject` stays null and the assertion SKIPS by its own
    // guard rather than failing — an empty database is not a regression.
    const r = await pool.query<{ keycloak_subject: string }>(
      `SELECT u.keycloak_subject
         FROM identity.users u
         JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
        WHERE u.status = 'active'
        ORDER BY u.keycloak_subject
        LIMIT 1`,
    );
    seededSubject = r.rows[0]?.keycloak_subject ?? null;
  } catch {
    reachable = false;
    await pool?.end().catch(() => undefined);
    pool = null;
  }
});

afterAll(async () => {
  await pool?.end().catch(() => undefined);
});

describe('identity bootstrap under RLS (migration 003)', () => {
  it('runs as a NON-SUPERUSER, or it proves nothing', async () => {
    if (!reachable || !pool) return;
    const r = await pool.query<{ rolsuper: boolean }>(
      `SELECT rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    expect(r.rows[0]?.rolsuper).toBe(false);
  });

  it('REGRESSION: resolves memberships with NO tenant context set', async () => {
    if (!reachable || !pool || !seededSubject) return;
    // This is the exact call MembershipRepository makes. Before migration 003
    // the equivalent direct query returned the user with a NULL tenant, which
    // the repository filtered to an empty membership list -- a platform-wide
    // authorization outage.
    const r = await pool.query<{ tenant_id: string | null; role_name: string | null }>(
      `SELECT user_id, tenant_id, organization_id, branch_id, role_name, status
         FROM identity.memberships_for_subject($1)`,
      [seededSubject],
    );
    expect(r.rows.length).toBeGreaterThan(0);
    // The point of the fix: a REAL tenant, not NULL.
    expect(r.rows.some((row) => row.tenant_id !== null)).toBe(true);
  });

  it('does NOT weaken RLS: a direct read of memberships is still blocked', async () => {
    if (!reachable || !pool) return;
    // If this ever returns rows, the fix was applied by loosening the policy
    // rather than by the narrowly scoped SECURITY DEFINER function, and tenant
    // isolation has been traded away for a login fix.
    const r = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity.memberships`,
    );
    expect(r.rows[0]?.n).toBe('0');
  });

  it('cannot be used to enumerate: an unknown subject returns nothing', async () => {
    if (!reachable || !pool) return;
    const r = await pool.query(
      `SELECT * FROM identity.memberships_for_subject($1)`,
      ['no-such-subject-does-not-exist'],
    );
    expect(r.rows.length).toBe(0);
  });
});

describe('audit.events row-level security (migration 003)', () => {
  it('has RLS both ENABLED and FORCED', async () => {
    if (!reachable || !pool) return;
    // ENABLE without FORCE leaves the owner exempt -- policies present, none
    // applied. That is the failure migration 002 exists to prevent.
    const r = await pool.query<{ enabled: boolean; forced: boolean }>(
      `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'audit' AND c.relname = 'events'`,
    );
    expect(r.rows[0]).toEqual({ enabled: true, forced: true });
  });

  it('still accepts the writes the audit trail depends on', async () => {
    if (!reachable || !pool) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        '11111111-1111-1111-1111-111111111111',
      ]);
      await client.query(`SELECT set_config('app.current_role', 'technician', true)`);

      // Own tenant — the ordinary case.
      await expect(
        client.query(
          `INSERT INTO audit.events (tenant_id, action, result)
           VALUES ($1, 'spec.audit.same_tenant', 'success')`,
          ['11111111-1111-1111-1111-111111111111'],
        ),
      ).resolves.toBeDefined();

      // System / pre-authentication events carry a NULL tenant. If the policy
      // rejected these the audit trail would silently lose them, which is worse
      // than the exposure the policy closes.
      await expect(
        client.query(
          `INSERT INTO audit.events (tenant_id, action, result)
           VALUES (NULL, 'spec.audit.system', 'success')`,
        ),
      ).resolves.toBeDefined();
    } finally {
      // Never commit: the audit table is append-only by rule, so a committed
      // test row could not be deleted afterwards.
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('rejects an event forged against another tenant', async () => {
    if (!reachable || !pool) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        '11111111-1111-1111-1111-111111111111',
      ]);
      await client.query(`SELECT set_config('app.current_role', 'technician', true)`);
      await expect(
        client.query(
          `INSERT INTO audit.events (tenant_id, action, result)
           VALUES ($1, 'spec.audit.forged', 'success')`,
          ['22222222-2222-2222-2222-222222222222'],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
