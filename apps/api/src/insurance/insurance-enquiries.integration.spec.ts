import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { InsuranceService } from './insurance.service';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';

/**
 * SLICE 17 — the enquiry, proven against a real database.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THIS IS THE API HALF THAT `verify/086` DELIBERATELY DOES NOT COVER.
 *
 * That file proves the DATABASE refuses a forged enquiry. It cannot prove the
 * service reads the right rows or refuses the right callers, because
 * `INSURANCE_ROLES` and `assertInsuranceOperator` are TypeScript. The two
 * halves are in different languages on purpose — "two literals in two files
 * cannot be type-checked into agreement" is this repository's most-recorded
 * root cause — and neither half is sufficient alone.
 *
 * What is asserted here, and why each one is load-bearing:
 *
 *   1. The ANONYMOUS write lands with NO tenant context. This is the production
 *      path: `PublicInsuranceController` calls `queryWithoutTenant`, which sets
 *      no tenant at all.
 *      ⚠️ It is NOT evidence about RLS — `submit_enquiry` is SECURITY DEFINER
 *      and the local owner is a superuser, so the INSERT policy is not
 *      evaluated here. See `submitAnonymously` for the full statement of what
 *      this can and cannot establish, and verify/086 4a-4c for the policy.
 *   2. The insurer sees its OWN enquiry and NOT the neighbour's. The negative
 *      is asserted first — a test that only checks the owner CAN see a row
 *      passes just as happily when everybody can.
 *   3. `setEnquiryStatus` on another organisation's enquiry is NOT FOUND, not
 *      forbidden. Telling a caller an id exists but belongs elsewhere is a
 *      disclosure, and the service is written to give one answer for both.
 *   4. A non-insurer is refused BOTH routes. Widening the read without the
 *      write, or the write without the read, is the shape found FOUR TIMES in
 *      one day on 2026-08-17.
 *
 * ⚠️ BUILD AS OWNER, ASSERT AS THE APP — same trap as the slice 18 file. The
 * owner bypasses RLS on this workstation, so an assertion made as the owner
 * proves nothing about Render. The `listEnquiries` / `setEnquiryStatus`
 * assertions DO run under `SET LOCAL ROLE autoworkshop_app` (see
 * `OneTransactionDb`) and are therefore real isolation evidence; the anonymous
 * write is the one that is not.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let client: PoolClient | null = null;
let connected = false;
let reachable = false;
let setupError = '';

let tenantId = '';
let orgId = '';
let userId = '';
let productId = '';
/** A SECOND insurer, in its own tenant. Without it, isolation is untestable. */
let otherTenantId = '';
let otherOrgId = '';
let otherUserId = '';
let otherProductId = '';

let ownEnquiryId = '';
let otherEnquiryId = '';

let insurance: InsuranceService;

const insurerCtx = (): TenantContext => ({
  tenantId,
  organizationId: orgId,
  branchId: null,
  userId,
  activeRole: 'insurance_owner',
  hasPlatformGrant: false,
  correlationId: 'slice-17-integration',
});

/** The negative control: a real session, wrong line of business. */
const outsiderCtx = (): TenantContext => ({
  tenantId,
  organizationId: orgId,
  branchId: null,
  userId,
  activeRole: 'workshop_owner',
  hasPlatformGrant: false,
  correlationId: 'slice-17-integration',
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

/**
 * The ANONYMOUS write, run the way production runs it — with NO tenant, NO
 * organisation and NO `app.current_role`.
 *
 * 🔴 AND IT IS *NOT* AN RLS TEST. THE FIRST VERSION OF THIS COMMENT CLAIMED IT
 * WAS, WHICH WAS FALSE IN THE MOST MISLEADING POSSIBLE WAY.
 *
 * `SET LOCAL ROLE autoworkshop_app` is set below, and it does not survive the
 * call: `insurance.submit_enquiry()` is SECURITY DEFINER, so execution switches
 * to the table OWNER — who on this workstation is `rolsuper = t,
 * rolbypassrls = t`. The INSERT policy is therefore never evaluated here, and
 * this function would pass with `enquiries_public_insert` deleted. Saying
 * otherwise would have made every reader trust a Render-only failure was
 * covered when it is not. Caught by Codex, 2026-08-19.
 *
 * ▶ WHAT THIS DOES ESTABLISH: the API/service path — that the function exists,
 *   is callable with no tenant context, derives the tenant, organisation and
 *   price from the product, and refuses an unpublished one.
 * ▶ WHERE THE POLICY IS ACTUALLY ADJUDICATED:
 *   `infrastructure/migrations/verify/086_insurance_enquiries.sql` checks
 *   4a-4c, which create a throwaway NOLOGIN role inheriting `autoworkshop_app`
 *   plus table INSERT — the only role available locally that both reaches the
 *   statement and is bound by RLS.
 */
async function submitAnonymously(c: PoolClient, product: string, name: string, email: string) {
  await c.query('SAVEPOINT anon');
  try {
    await c.query(`SELECT set_config('app.current_role','',true)`);
    await c.query(`SELECT set_config('app.tenant_id','',true)`);
    await c.query(`SELECT set_config('app.organization_ids','',true)`);
    await c.query(`SET LOCAL ROLE ${APP_ROLE}`);
    const r = await c.query(
      `SELECT insurance.submit_enquiry($1,$2,$3,NULL,NULL,'from the integration spec',NULL) AS id`,
      [product, name, email],
    );
    await c.query('RELEASE SAVEPOINT anon');
    return r.rows[0].id as string;
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT anon');
    throw err;
  } finally {
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('app.current_role','admin',true)`);
  }
}

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, connectionTimeoutMillis: 4000 });
    client = await pool.connect();
    connected = true;
  } catch {
    connected = false;
    return;
  }

  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_role','admin',true)`);

    const mkInsurer = async (slug: string, org: string, email: string, subject: string) => {
      const t = await client!.query(
        `INSERT INTO identity.tenants (name, slug) VALUES ($1,$1) RETURNING id`,
        [slug],
      );
      const o = await client!.query(
        `INSERT INTO identity.organizations (tenant_id, name, org_type)
         VALUES ($1,$2,'insurance_company') RETURNING id`,
        [t.rows[0].id, org],
      );
      const u = await client!.query(
        `INSERT INTO identity.users (email, display_name, keycloak_subject)
         VALUES ($1,$2,$3) RETURNING id`,
        [email, org, subject],
      );
      // Published AND verified: 086's INSERT policy admits an enquiry against
      // nothing else, so an unpublished fixture would make every test here fail
      // for a reason that has nothing to do with what it is asserting.
      const p = await client!.query(
        `INSERT INTO insurance.products
           (tenant_id, organization_id, name, cover_type, premium, currency,
            term_months, insurer_name, is_verified, is_published, created_by)
         VALUES ($1,$2,$3,'comprehensive',900.00,'GHS',12,$4,true,true,$5)
         RETURNING id`,
        [t.rows[0].id, o.rows[0].id, `${org} Comprehensive`, org, u.rows[0].id],
      );
      return {
        tenantId: t.rows[0].id as string,
        orgId: o.rows[0].id as string,
        userId: u.rows[0].id as string,
        productId: p.rows[0].id as string,
      };
    };

    const a = await mkInsurer('slice17-a', 'Slice17 Assurance A', 'slice17-a@test.invalid', 'slice17-a');
    tenantId = a.tenantId;
    orgId = a.orgId;
    userId = a.userId;
    productId = a.productId;

    const b = await mkInsurer('slice17-b', 'Slice17 Assurance B', 'slice17-b@test.invalid', 'slice17-b');
    otherTenantId = b.tenantId;
    otherOrgId = b.orgId;
    otherUserId = b.userId;
    otherProductId = b.productId;

    ownEnquiryId = await submitAnonymously(client, productId, 'Ama Mensah', 'ama@example.test');
    otherEnquiryId = await submitAnonymously(client, otherProductId, 'Kofi Owusu', 'kofi@example.test');

    insurance = new InsuranceService(
      new OneTransactionDb(client) as unknown as ConstructorParameters<typeof InsuranceService>[0],
      new AuditService(),
    );
    reachable = true;
  } catch (err) {
    // A broken FIXTURE is a FAILURE, not a skip. The slice 18 file records why:
    // swallowing this reported eight green skips against a healthy database.
    setupError = err instanceof Error ? err.message : String(err);
    reachable = false;
  }
});

afterAll(async () => {
  // Nothing persists: the whole fixture lives in one rolled-back transaction.
  try {
    await client?.query('ROLLBACK');
  } catch {
    // Already aborted; nothing to undo.
  }
  client?.release();
  await pool?.end();
});

/**
 * 🔴 `REQUIRE_DB=1` TURNS A MISSING DATABASE FROM A SKIP INTO A FAILURE.
 *
 * Without it this whole suite can report green having asserted NOTHING — the
 * sentinel skips itself when there is no connection, and every `dbIt` skips
 * with it. That is defensible on a workstation where Postgres may legitimately
 * be down, and indefensible in a job whose purpose is to run these assertions.
 * A skip is a third state, not a pass, and a job that cannot tell the two apart
 * is not a gate. Raised by Codex, 2026-08-19.
 *
 * Opt-in rather than default, deliberately: flipping the default would turn
 * every developer's `pnpm test` red for a reason unrelated to their change,
 * which is how a gate gets disabled wholesale.
 */
const REQUIRE_DB = process.env.REQUIRE_DB === '1';

const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) {
      if (REQUIRE_DB) {
        throw new Error(
          `REQUIRE_DB=1 but this test could not run. ${
            connected ? `The fixture failed: ${setupError}` : 'No database connection.'
          }`,
        );
      }
      ctx.skip();
    }
    await fn();
  });

describe('slice 17 — the insurance enquiry', () => {
  // A plain `it`. Using `dbIt` here would let the one test whose job is to
  // report "nothing ran" be silenced by the flag it exists to expose.
  it('the fixture built, or says exactly why not', (ctx) => {
    if (!connected) {
      // A real skip on a workstation with no Postgres — unless the caller has
      // declared that these assertions are the point of the run.
      if (REQUIRE_DB) throw new Error('REQUIRE_DB=1 but no database connection could be made.');
      ctx.skip();
      return;
    }
    expect(setupError, 'the fixture failed against a REACHABLE database').toBe('');
    expect(reachable).toBe(true);
  });

  dbIt('an anonymous shopper with no tenant context can lodge an enquiry', async () => {
    // Proven by the fixture having built it at all — `submitAnonymously` runs
    // as the app role with every context GUC blank, and throws otherwise.
    expect(ownEnquiryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  dbIt('the enquiry snapshots what was ADVERTISED, not what the caller said', async () => {
    const rows = await insurance.listEnquiries(insurerCtx());
    const mine = rows.find((e) => e.id === ownEnquiryId);
    expect(mine).toBeDefined();
    // 🔴 THE CALLER NEVER SENT A PRICE. `submit_enquiry` derives it from the
    // product, which is what stops a stranger recording an enquiry at a premium
    // they invented — and what keeps the record honest after a re-pricing.
    expect(mine?.premium).toBe('900.00');
    expect(mine?.currency).toBe('GHS');
    expect(mine?.productName).toBe('Slice17 Assurance A Comprehensive');
    expect(mine?.status).toBe('new');
    // Normalised by the function: trimmed and lowercased.
    expect(mine?.contactEmail).toBe('ama@example.test');
  });

  dbIt('the NEIGHBOUR is not in the inbox — asserted before the owner is', async () => {
    const rows = await insurance.listEnquiries(insurerCtx());
    expect(rows.some((e) => e.id === otherEnquiryId)).toBe(false);
    expect(rows.some((e) => e.id === ownEnquiryId)).toBe(true);
  });

  dbIt('insurer B sees its own enquiry and not insurer A\'s', async () => {
    const rows = await insurance.listEnquiries({
      tenantId: otherTenantId,
      organizationId: otherOrgId,
      branchId: null,
      userId: otherUserId,
      activeRole: 'insurance_owner',
      hasPlatformGrant: false,
      correlationId: 'slice-17-integration',
    });
    expect(rows.some((e) => e.id === ownEnquiryId)).toBe(false);
    expect(rows.some((e) => e.id === otherEnquiryId)).toBe(true);
  });

  dbIt('the insurer can work its own enquiry', async () => {
    const updated = await insurance.setEnquiryStatus(insurerCtx(), ownEnquiryId, 'contacted');
    expect(updated.status).toBe('contacted');
  });

  dbIt('updating ANOTHER organisation\'s enquiry is NOT FOUND, not forbidden', async () => {
    // One answer for "does not exist" and "is not yours". A distinct 403 would
    // confirm the id is real to somebody who has no business knowing.
    await expect(
      insurance.setEnquiryStatus(insurerCtx(), otherEnquiryId, 'closed'),
    ).rejects.toThrow(/not found/i);
  });

  dbIt('a non-insurer is refused BOTH halves, and the refusal names a way forward', async () => {
    // 🔴 BOTH, IN ONE TEST, ON PURPOSE. "The write half opened and the read half
    // did not" happened four times in one day on 2026-08-17; asserting only one
    // of these is how that keeps happening.
    await expect(insurance.listEnquiries(outsiderCtx())).rejects.toThrow(/insurance company/i);
    await expect(
      insurance.setEnquiryStatus(outsiderCtx(), ownEnquiryId, 'closed'),
    ).rejects.toThrow(/insurance company/i);
    // Every refusal must name a REACHABLE alternative — the repository's most
    // expensive defect class is a rule whose escape hatch does not exist.
    await expect(insurance.listEnquiries(outsiderCtx())).rejects.toThrow(/public marketplace/i);
  });

  dbIt('an enquiry against an UNPUBLISHED product is refused by the database', async () => {
    const draft = await client!.query(
      `INSERT INTO insurance.products
         (tenant_id, organization_id, name, cover_type, premium, currency,
          term_months, insurer_name, is_verified, is_published, created_by)
       VALUES ($1,$2,'Slice17 Draft','third_party',10.00,'GHS',12,'Slice17 Assurance A',false,false,$3)
       RETURNING id`,
      [tenantId, orgId, userId],
    );
    await expect(
      submitAnonymously(client!, draft.rows[0].id, 'Prober', 'prober@example.test'),
    ).rejects.toThrow();
  });
});
