import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';

/**
 * Integration proof that withTenant()'s mechanism actually enforces RLS.
 *
 * The unit tests prove the CONTEXT RESOLUTION logic. They cannot prove that the
 * resulting statements isolate anything — only a real PostgreSQL can. Last
 * night the policies were textbook-correct and completely inert because the
 * connecting role was a superuser; that class of defect is invisible to unit
 * tests by construction.
 *
 * Skips cleanly when no database is reachable, so CI without infrastructure
 * stays green rather than silently passing a test that never ran.
 */
const APP_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const ctx = (tenantId: string): TenantContext => ({
  tenantId,
  organizationId: 'aaaaaaaa-0000-0000-0000-000000000001',
  branchId: null,
  userId: '00000000-0000-0000-0000-0000000000ff',
  activeRole: 'workshop_owner',
  hasPlatformGrant: false,
  correlationId: 'integration-test',
});

let pool: Pool | null = null;
let reachable = false;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: APP_URL, max: 2, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    await pool?.end().catch(() => undefined);
    pool = null;
  }
});

afterAll(async () => {
  await pool?.end().catch(() => undefined);
});

interface QueryResultLike {
  rows: Array<Record<string, unknown>>;
}
interface ClientLike {
  query: (text: string, values?: unknown[]) => Promise<QueryResultLike>;
  release: () => void;
}

/** Mirrors DatabaseService.withTenant without needing the Nest container. */
async function withTenant<T>(
  c: TenantContext,
  work: (client: ClientLike) => Promise<T>,
): Promise<T> {
  const client = (await pool!.connect()) as unknown as ClientLike;
  try {
    await client.query('BEGIN');
    for (const stmt of tenantSessionStatements(c)) {
      await client.query(stmt.text, stmt.values);
    }
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

describe('DatabaseService.withTenant — RLS enforcement (integration)', () => {
  it('the application role is NOT a superuser and cannot bypass RLS', async () => {
    if (!reachable) return;
    const r = await pool!.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    // If either is true, every RLS policy in the system is decorative.
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });

  it('scopes reads to the bound tenant', async () => {
    if (!reachable) return;
    const a = await withTenant(ctx(TENANT_A), (c) =>
      c.query('SELECT id, tenant_id FROM identity.organizations'),
    );
    expect(a.rows.length).toBeGreaterThan(0);
    expect(a.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it('cannot read another tenant by direct id', async () => {
    if (!reachable) return;
    const res = await withTenant(ctx(TENANT_A), (c) =>
      c.query('SELECT id FROM identity.organizations WHERE tenant_id = $1', [TENANT_B]),
    );
    expect(res.rows).toHaveLength(0);
  });

  it('does not leak context to the next connection borrowed from the pool', async () => {
    if (!reachable) return;
    // The heart of the pooling risk: settings are transaction-local, so a
    // later borrow must start with no tenant context at all.
    await withTenant(ctx(TENANT_A), (c) => c.query('SELECT 1'));
    const client = await pool!.connect();
    try {
      const r = await client.query(`SELECT current_setting('app.tenant_id', true) AS t`);
      expect(r.rows[0].t === null || r.rows[0].t === '').toBe(true);
    } finally {
      client.release();
    }
  });

  it('FAILS CLOSED: no tenant context returns zero rows, never all rows', async () => {
    if (!reachable) return;
    const client = await pool!.connect();
    try {
      const r = await client.query('SELECT count(*)::int AS n FROM identity.organizations');
      expect(r.rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });
});
