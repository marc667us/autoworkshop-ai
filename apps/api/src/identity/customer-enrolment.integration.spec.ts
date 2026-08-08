import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { CustomerEnrolmentService } from './customer-enrolment.service';
import { MembershipRepository } from './membership.repository';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';

/**
 * ENROLMENT — THE SERVICE HALF, AGAINST A REAL DATABASE.
 *
 * ── WHAT THIS PROVES THAT THE REHEARSAL DOES NOT ──────────────────────────
 *
 * `infrastructure/migrations/rehearse/061_customer_enrolment_render_privileges.sql`
 * already drives `identity.enrol_as_customer` under production's privilege
 * shape — a NOSUPERUSER NOBYPASSRLS owner, no user context — and asserts the
 * membership, the idempotence, the two refusals and that the bootstrap door
 * closes. That is the half that could only fail on Render.
 *
 * This file covers the half the rehearsal cannot see: **`CustomerEnrolmentService`
 * creating the `core.customers` row and linking it to the user.** That step is
 * deliberately NOT in the SQL function (migration 061 explains why:
 * `core.customers` carries migration 054's RESTRICTIVE `org_restrict` policy),
 * so nothing in the rehearsal exercises it.
 *
 * 🔴 AND IT IS THE STEP THAT MATTERS MOST FOR THE ORIGINAL BUG. A membership on
 * its own makes the API answer; it does not give the person any RECORDS. Every
 * customer-scoped read in this product resolves through `core.customers.user_id`
 * — a column **no application code had ever written**. Without this step the
 * fix would produce an account that reaches the workshop's shared surfaces and
 * none of its own, which is a worse failure than the one it replaced.
 *
 * ⚠️ BUILD AS OWNER, ASSERT AS THE APP. Migration 038 shut the bootstrap door
 * to everyone except the owner of `register_workshop`, so the fixture must be
 * built by the owner connection. But the owner also BYPASSES RLS, and an
 * assertion made under a bypassing role says nothing at all. So every assertion
 * runs under `SET LOCAL ROLE autoworkshop_app` — the role the application
 * really connects as.
 *
 * ⚠️ NO DATABASE IS A *SKIP*, NOT A PASS — AND NOT A FAILURE EITHER.
 * With no Postgres the suite prints a loud notice naming what was not proven
 * and every test reports SKIPPED. Three states, never two.
 *
 * 🔴 THE FIRST VERSION ASSERTED `reachable === true` IN A TEST, AND THAT TURNED
 * `Release` RED. CI has no Postgres, so a correct instinct — a silent skip is
 * indistinguishable from a pass — was implemented as a failure for an
 * ENVIRONMENTAL reason, which is the one thing guaranteed to teach people to
 * ignore red. The repository had already recorded that exact defect once
 * (`feedback_three_states_pass_fail_skip`); this is the second time.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';
const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;

let tenantId = '';
let orgId = '';
let strangerId = '';
const strangerSubject = 'enrolment-spec-stranger';

/** Marks a test SKIPPED (not passed) when there is no database. */
const dbIt: typeof it = ((name: string, fn: never) =>
  it(name, async (ctx: { skip: () => void }) => {
    if (!reachable) return ctx.skip();
    return (fn as unknown as () => Promise<void>)();
  })) as unknown as typeof it;

/**
 * A `DatabaseService` stand-in on ONE transaction, rolled back at the end.
 *
 * The same client throughout: handing each call a fresh pooled connection would
 * leave the fixture in an uncommitted transaction on one connection and the
 * reads on another, where they cannot see it — and the test would then fail for
 * a reason unrelated to the code under test.
 */
class OneTransactionDb {
  constructor(private readonly c: PoolClient) {}

  async withTenant<T>(ctx: TenantContext, work: (c: PoolClient) => Promise<T>): Promise<T> {
    await this.c.query('SAVEPOINT s');
    try {
      for (const stmt of tenantSessionStatements(ctx)) {
        await this.c.query(stmt.text, stmt.values);
      }
      const out = await work(this.c);
      await this.c.query('RELEASE SAVEPOINT s');
      return out;
    } catch (err) {
      await this.c.query('ROLLBACK TO SAVEPOINT s');
      throw err;
    }
  }

  async queryWithoutTenant<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const res = await this.c.query(text, values as never[]);
    return res.rows as T[];
  }
}

let service: CustomerEnrolmentService;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, connectionTimeoutMillis: 4000 });
    client = await pool.connect();
    await client.query('BEGIN');
    reachable = true;
  } catch {
    reachable = false;
    // 🔴 A LOUD NOTICE, THEN SKIP — NOT A FAILURE.
    //
    // The first version of this file asserted `reachable === true` in a test,
    // reasoning that a silent skip is indistinguishable from a pass. The
    // instinct is right and the implementation was wrong: CI has no Postgres,
    // so it turned `Release` RED for an environmental reason — exactly the
    // defect this repository already recorded once, in
    // `feedback_three_states_pass_fail_skip`. A suite that goes red when the
    // environment is missing teaches people to ignore red.
    //
    // The three states are kept by SAYING SO on stderr and skipping, which is
    // what every sibling integration spec here does. The run then reports
    // `skipped`, not `passed`, and the notice names what was not proven.
    console.warn(
      '[customer-enrolment.integration] NO DATABASE at ADMIN_URL — this suite is SKIPPED, ' +
        'not passed. Customer enrolment and the core.customers link are NOT proven by this run.',
    );
    return;
  }

  const c = client!;
  // ── fixture, built as the owner ─────────────────────────────────────────
  const t = await c.query<{ id: string }>(
    `INSERT INTO identity.tenants (name, slug, status) VALUES ('Enrolment Spec', 'enrolment-spec-' || substr(replace(gen_random_uuid()::text,'-',''),1,8), 'active') RETURNING id`,
  );
  tenantId = t.rows[0]!.id;

  const o = await c.query<{ id: string }>(
    `INSERT INTO identity.organizations (tenant_id, name, org_type, status) VALUES ($1, 'Enrolment Spec Motors', 'individual_workshop', 'active') RETURNING id`,
    [tenantId],
  );
  orgId = o.rows[0]!.id;

  await c.query(
    `INSERT INTO identity.branches (tenant_id, organization_id, name, status) VALUES ($1, $2, 'Main branch', 'active')`,
    [tenantId, orgId],
  );

  // The workshop opts in to being found by strangers. Constraint 2 of
  // migration 061 — this is the consent that makes self-service safe.
  await c.query(
    `INSERT INTO catalogue.mechanic_directory (organization_id, trading_name, city, country, is_published)
     VALUES ($1, 'Enrolment Spec Motors', 'Accra', 'GH', TRUE)
     ON CONFLICT (organization_id) DO UPDATE SET is_published = TRUE`,
    [orgId],
  );

  const u = await c.query<{ id: string }>(
    `INSERT INTO identity.users (keycloak_subject, email, display_name, status)
     VALUES ($1, 'enrolment-spec-stranger@example.test', 'Ada Stranger', 'active') RETURNING id`,
    [strangerSubject],
  );
  strangerId = u.rows[0]!.id;

  // ── from here on, act as the application role ───────────────────────────
  await c.query(`SET LOCAL ROLE ${APP_ROLE}`);

  const db = new OneTransactionDb(c) as unknown as ConstructorParameters<
    typeof CustomerEnrolmentService
  >[1];
  service = new CustomerEnrolmentService(
    new MembershipRepository(db as never),
    db as never,
  );
});

afterAll(async () => {
  // ⚠️ ROLLBACK, never COMMIT. The fixture must not outlive the run.
  if (client) {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  await pool?.end().catch(() => undefined);
});

describe('customer enrolment — membership AND customer record', () => {
  dbIt('enrols a stranger and creates their customer record', async () => {
    const result = await service.enrol(
      strangerSubject,
      orgId,
      'Ada Stranger',
      'enrolment-spec-stranger@example.test',
    );

    expect(result.roleName).toBe('customer');
    expect(result.created).toBe(true);
    expect(result.organizationId).toBe(orgId);
    expect(result.customerId).toBeTruthy();
  });

  dbIt('the membership really exists, and really is `customer`', async () => {
    // Read it back independently rather than trusting the return value — the
    // question is what is IN the database, not what the method said.
    const res = await client!.query<{ role_name: string; status: string }>(
      `SELECT role_name, status FROM identity.memberships
        WHERE user_id = $1 AND organization_id = $2`,
      [strangerId, orgId],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0]!.role_name).toBe('customer');
    expect(res.rows[0]!.status).toBe('active');
  });

  dbIt('🔴 the customer record is LINKED to the user — the step nothing ever wrote', async () => {
    const res = await client!.query<{ user_id: string; display_name: string }>(
      `SELECT user_id, display_name FROM core.customers
        WHERE organization_id = $1 AND user_id = $2`,
      [orgId, strangerId],
    );
    expect(
      res.rowCount,
      'no core.customers row linked to the enrolled user — every customer-scoped read joins through this column, so the account would reach the workshop’s shared surfaces and none of its own',
    ).toBe(1);
    expect(res.rows[0]!.user_id).toBe(strangerId);
  });

  dbIt('is idempotent — the funnel calls it on every visit', async () => {
    const again = await service.enrol(
      strangerSubject,
      orgId,
      'Ada Stranger',
      'enrolment-spec-stranger@example.test',
    );
    expect(again.created).toBe(false);

    const memberships = await client!.query(
      `SELECT 1 FROM identity.memberships WHERE user_id = $1 AND organization_id = $2`,
      [strangerId, orgId],
    );
    const customers = await client!.query(
      `SELECT 1 FROM core.customers WHERE user_id = $1 AND organization_id = $2`,
      [strangerId, orgId],
    );
    // Both halves must be idempotent. A second membership is blocked by the
    // unique constraint; a second customer row is blocked by migration 063's
    // partial unique index, and WITHOUT that index this is the assertion that
    // would fail — the check-then-insert would race.
    expect(memberships.rowCount).toBe(1);
    expect(customers.rowCount).toBe(1);
  });

  dbIt('refuses a workshop that has not published itself', async () => {
    const priv = await client!.query<{ id: string }>(
      `INSERT INTO identity.organizations (tenant_id, name, org_type, status)
       VALUES ($1, 'Private Garage', 'individual_workshop', 'active') RETURNING id`,
      [tenantId],
    );
    // No mechanic_directory row at all: the workshop never invited anybody.
    await expect(
      service.enrol(strangerSubject, priv.rows[0]!.id, 'Ada', 'a@example.test'),
    ).rejects.toThrow(/not taking new customers online/i);
  });
});
