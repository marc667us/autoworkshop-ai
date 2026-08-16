import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { InsuranceService } from './insurance.service';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';

/**
 * SLICE 18 — the admin verification queue, proven against a real database.
 *
 * ── 🔴 WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * `apps/api/src/insurance/` had NO spec files at all — measured on 2026-08-16
 * while changing `reviewQueue`'s response shape. An insurance marketplace
 * shipped across four migrations (080/082/083/084) with the whole module
 * untested, and slice 18 then widened a live endpoint on top of that.
 *
 * The two things asserted here are exactly the two the screen depends on, and
 * neither is provable by a unit test:
 *
 *   1. `reviewQueue` returns BOTH halves and splits them correctly. It used to
 *      return only unverified products, which left `setProductVerification`'s
 *      withdrawal path with no caller — a verified product vanished from the
 *      only list that existed.
 *   2. Withdrawing verification ALSO UNLISTS. The service does both in one
 *      statement, and the two coming apart would leave a product on sale after
 *      the platform decided it should not be.
 *
 * ⚠️ BUILD AS OWNER, ASSERT AS THE APP. The fixture is created by the owner
 * connection because RLS bootstrap doors are shut to the application role — but
 * the owner also BYPASSES RLS, so an assertion made as the owner proves
 * nothing. Every service call runs under `SET LOCAL ROLE autoworkshop_app`,
 * which is what Render actually connects as. That trap has cost this repository
 * two sessions in both directions.
 *
 * ⚠️ NO DATABASE IS A *SKIP*, NOT A PASS. `dbIt` calls `ctx.skip()` so the
 * reporter shows these as skipped rather than green — a silent skip is
 * indistinguishable from a pass, and this repository has a recorded rule that
 * passed / failed / SKIPPED are three states.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;
/**
 * 🔴 WHY THE FAILURE IS KEPT RATHER THAN SWALLOWED.
 *
 * The first version of this file caught everything into `reachable = false`, so
 * when the FIXTURE SQL was wrong all eight tests reported SKIPPED against a
 * database that was running perfectly well. A broken fixture is not "no
 * database" — it is a failure wearing a skip's clothes, which is precisely the
 * confusion `dbIt` exists to prevent, reproduced one function above it.
 *
 * So: a connection that cannot be made is a SKIP; anything else is a FAILURE
 * with its reason printed.
 */
let setupError = '';
let connected = false;

let tenantId = '';
let insurerOrgId = '';
let adminUserId = '';
let pendingProductId = '';
let verifiedProductId = '';
/** Dedicated products so the mutating tests do not depend on each other. */
let toVerifyId = '';
let toWithdrawId = '';
/**
 * 🔴 A SECOND TENANT, AND IT IS THE POINT OF THE FILE.
 *
 * Codex: the first version set `hasPlatformGrant: true` in the TypeScript
 * context and never inserted a grant row, so every read succeeded through
 * ORDINARY TENANT SCOPING — `tenant_isolation` passes on a tenant match — and
 * the suite proved nothing about platform authority. With ONE tenant the two
 * are indistinguishable, so it passed for the wrong reason.
 *
 * This product lives in a DIFFERENT tenant. Only a live grant in
 * `identity.platform_administrators` can make it visible, so it is the one
 * assertion that can tell the two apart.
 */
let otherTenantId = '';
let otherProductId = '';
/** A user with NO grant — the negative control. */
let plainUserId = '';

let insurance: InsuranceService;

/**
 * The platform administrator's context.
 *
 * 🔴 `hasPlatformGrant: true` IS THE WHOLE GATE. Since migrations 077/078 the
 * role NAME confers nothing — `resolveTenantContext` will not even select a
 * `platform_administrator` membership without an un-revoked grant row. Setting
 * the flag here is what makes this context represent a real administrator
 * rather than a string that looks like one.
 */
const adminCtx = (): TenantContext => ({
  tenantId,
  organizationId: insurerOrgId,
  branchId: null,
  userId: adminUserId,
  activeRole: 'platform_administrator',
  hasPlatformGrant: true,
  correlationId: 'slice-18-integration',
});

class OneTransactionDb {
  constructor(private readonly c: PoolClient) {}

  async withTenant<T>(ctx: TenantContext, work: (c: PoolClient) => Promise<T>): Promise<T> {
    // A savepoint rather than a transaction, so a refusal under test does not
    // abort the fixture the remaining tests still need.
    await this.c.query('SAVEPOINT s');
    try {
      for (const stmt of tenantSessionStatements(ctx)) {
        await this.c.query(stmt.text, stmt.values);
      }
      await this.c.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const out = await work(this.c);
      await this.c.query('RELEASE SAVEPOINT s');
      return out;
    } catch (err) {
      await this.c.query('ROLLBACK TO SAVEPOINT s');
      throw err;
    } finally {
      await this.c.query('RESET ROLE');
    }
  }
}

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, connectionTimeoutMillis: 4000 });
    client = await pool.connect();
    connected = true;
  } catch (err) {
    // No database: a legitimate skip. CI has no Postgres.
    connected = false;
    return;
  }

  try {
    await client.query('BEGIN');
    // Owner privileges for fixture construction only.
    await client.query(`SELECT set_config('app.current_role','admin',true)`);

    // `slug` is NOT NULL with no default — read from the live schema rather
    // than assumed, after the first version of this fixture failed on it.
    const t = await client.query(
      `INSERT INTO identity.tenants (name, slug)
       VALUES ('slice18-tenant', 'slice18-tenant') RETURNING id`,
    );
    tenantId = t.rows[0].id;

    const o = await client.query(
      `INSERT INTO identity.organizations (tenant_id, name, org_type)
       VALUES ($1, 'Slice18 Assurance', 'insurance_company') RETURNING id`,
      [tenantId],
    );
    insurerOrgId = o.rows[0].id;

    const u = await client.query(
      `INSERT INTO identity.users (email, display_name, keycloak_subject)
       VALUES ('slice18-admin@test.invalid', 'Slice18 Admin', 'slice18-subject')
       RETURNING id`,
    );
    adminUserId = u.rows[0].id;

    // One product on each side of the split. A single-product fixture could not
    // express "the split is correct" and would pass vacuously for ever.
    const mk = async (name: string, verified: boolean, published: boolean) => {
      // ⚠️ `insurer_name` IS A NOT NULL COLUMN ON THE PRODUCT (migration 084),
      // denormalised so the PUBLIC listing can name the insurer without joining
      // a tenant-scoped table. The admin queue still reads the name through the
      // ORGANISATION join, so the two can disagree — worth knowing, and the
      // fixture sets both to the same value so this test is not the thing that
      // discovers it.
      const r = await client!.query(
        `INSERT INTO insurance.products
           (tenant_id, organization_id, name, cover_type, premium, currency,
            term_months, insurer_name, is_verified, is_published, created_by)
         VALUES ($1,$2,$3,'comprehensive',120.00,'GHS',12,'Slice18 Assurance',$4,$5,$6)
         RETURNING id`,
        [tenantId, insurerOrgId, name, verified, published, adminUserId],
      );
      return r.rows[0].id as string;
    };
    pendingProductId = await mk('Slice18 Pending Cover', false, false);
    verifiedProductId = await mk('Slice18 Verified Cover', true, true);
    // Own products for the mutating tests, so those tests do not depend on
    // declaration order or on each other. Running one in isolation must work.
    toVerifyId = await mk('Slice18 To Verify', false, false);
    toWithdrawId = await mk('Slice18 To Withdraw', true, true);

    // 🔴 THE REAL GRANT. Without this row the application flag is a fiction:
    // `identity.is_platform_admin()` reads THIS TABLE, and under
    // `SET LOCAL ROLE autoworkshop_app` the seed escape is closed because it
    // also requires the connection to own the table.
    await client.query(
      `INSERT INTO identity.platform_administrators (user_id, granted_actor, granted_reason)
       VALUES ($1, 'slice18-integration-spec', 'fixture: prove cross-tenant admin visibility')`,
      [adminUserId],
    );

    // A second tenant with its own insurer and product. Ordinary tenant
    // scoping cannot reach this; only the grant can.
    const t2 = await client.query(
      `INSERT INTO identity.tenants (name, slug)
       VALUES ('slice18-other-tenant', 'slice18-other-tenant') RETURNING id`,
    );
    otherTenantId = t2.rows[0].id;
    const o2 = await client.query(
      `INSERT INTO identity.organizations (tenant_id, name, org_type)
       VALUES ($1, 'Slice18 Other Assurance', 'insurance_company') RETURNING id`,
      [otherTenantId],
    );
    const p2 = await client.query(
      `INSERT INTO insurance.products
         (tenant_id, organization_id, name, cover_type, premium, currency,
          term_months, insurer_name, is_verified, is_published, created_by)
       VALUES ($1,$2,'Slice18 Other Cover','third_party',80.00,'GHS',6,
               'Slice18 Other Assurance', false, false, $3)
       RETURNING id`,
      [otherTenantId, o2.rows[0].id, adminUserId],
    );
    otherProductId = p2.rows[0].id;

    // The negative control: a real user holding no grant at all.
    const pu = await client.query(
      `INSERT INTO identity.users (email, display_name, keycloak_subject)
       VALUES ('slice18-plain@test.invalid', 'Slice18 Plain', 'slice18-plain-subject')
       RETURNING id`,
    );
    plainUserId = pu.rows[0].id;

    insurance = new InsuranceService(
      new OneTransactionDb(client) as never,
      { write: async () => undefined } as unknown as AuditService,
    );

    reachable = true;
  } catch (err) {
    // Connected, but the fixture failed. That is a DEFECT in this file or in
    // the schema it assumes — never a skip.
    reachable = false;
    setupError = err instanceof Error ? err.message : String(err);
  }
}, 30000);

afterAll(async () => {
  // Nothing persists: the whole fixture lives in one rolled-back transaction.
  try {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
  } finally {
    await pool?.end();
  }
});

const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) ctx.skip();
    await fn();
  });

describe('slice 18 — the platform verification queue', () => {
  // ⚠️ A PLAIN `it`, NOT `dbIt`. Using `dbIt` here made the guard skip itself
  // whenever it had something to report — the one test whose whole job is to
  // say "these assertions did not run" was silenced by the same flag it was
  // meant to expose.
  it('the fixture built, or says exactly why not', (ctx) => {
    if (!connected) {
      // No Postgres. A real skip, and the reporter shows it as one.
      ctx.skip();
      return;
    }
    expect(setupError, `fixture failed to build: ${setupError}`).toBe('');
    expect(reachable).toBe(true);
  });

  dbIt('reviewQueue returns BOTH halves, not just the unverified ones', async () => {
    const q = await insurance.reviewQueue(adminCtx());
    expect(q).toHaveProperty('pending');
    expect(q).toHaveProperty('verified');
    expect(Array.isArray(q.pending)).toBe(true);
    expect(Array.isArray(q.verified)).toBe(true);
  });

  dbIt('the split is correct — pending holds the unverified product only', async () => {
    const q = await insurance.reviewQueue(adminCtx());
    expect(q.pending.map((p) => p.id)).toContain(pendingProductId);
    expect(q.pending.map((p) => p.id)).not.toContain(verifiedProductId);
  });

  dbIt('the split is correct — verified holds the verified product only', async () => {
    const q = await insurance.reviewQueue(adminCtx());
    expect(q.verified.map((p) => p.id)).toContain(verifiedProductId);
    expect(q.verified.map((p) => p.id)).not.toContain(pendingProductId);
  });

  dbIt('the insurer NAME is joined in — approving the wrong company is the risk', async () => {
    const q = await insurance.reviewQueue(adminCtx());
    const row = q.pending.find((p) => p.id === pendingProductId);
    // 🔴 A JOIN RETURNS FEWER ROWS RATHER THAN FAILING. If the organisations
    // join were blocked by RLS this would be undefined, not an error — an empty
    // list behind a 200, which is the failure 2026-08-14 spent a day on.
    expect(row).toBeDefined();
    expect(row!.insurerName).toBe('Slice18 Assurance');
  });

  // ── the assertion the first version could not make ───────────────────────

  dbIt('THE GRANT IS WHAT MAKES IT PLATFORM-WIDE — another tenant is visible', async () => {
    const q = await insurance.reviewQueue(adminCtx());
    // 🔴 This product is in a DIFFERENT tenant. `tenant_isolation` cannot admit
    // it; only an un-revoked row in identity.platform_administrators can. If
    // the grant were removed this is the assertion that would fail, which is
    // exactly what the first version of this file could not detect.
    expect(q.pending.map((p) => p.id)).toContain(otherProductId);
  });

  dbIt('WITHOUT a grant the same query cannot see the other tenant', async () => {
    // Same query, same code path, a user holding no grant. If this ALSO
    // returned the other tenant's product, the test above would be proving
    // nothing — the pair is what makes either meaningful.
    const q = await insurance.reviewQueue({
      ...adminCtx(),
      userId: plainUserId,
      activeRole: 'insurance_assessor',
      hasPlatformGrant: false,
    });
    expect(q.pending.map((p) => p.id)).not.toContain(otherProductId);
  });

  // ── mutations, each on its OWN product so they run in any order ──────────

  dbIt('verifying moves a product from pending to verified', async () => {
    await insurance.setProductVerification(adminCtx(), toVerifyId, true);
    const q = await insurance.reviewQueue(adminCtx());
    expect(q.verified.map((p) => p.id)).toContain(toVerifyId);
    expect(q.pending.map((p) => p.id)).not.toContain(toVerifyId);
  });

  dbIt('WITHDRAWING VERIFICATION ALSO UNLISTS — the two must not come apart', async () => {
    const before = await insurance.reviewQueue(adminCtx());
    expect(before.verified.find((p) => p.id === toWithdrawId)?.isPublished).toBe(true);

    const after = await insurance.setProductVerification(adminCtx(), toWithdrawId, false);
    expect(after.isVerified).toBe(false);
    // 🔴 THE POINT OF THE TEST. A product left published after its verification
    // was withdrawn would stay on sale after the platform decided otherwise.
    expect(after.isPublished).toBe(false);

    // And it comes back to the queue that can act on it. Asserted HERE rather
    // than in a following test, which would only pass if this one ran first.
    const q = await insurance.reviewQueue(adminCtx());
    expect(q.pending.map((p) => p.id)).toContain(toWithdrawId);
  });
});
