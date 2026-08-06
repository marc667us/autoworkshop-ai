import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { FinanceService } from '../finance/finance.service';
import { MembershipService } from '../identity/membership.service';
import { UserService } from '../identity/user.service';
import { ReceptionService } from '../reception/reception.service';
import { WarrantyService } from '../warranty/warranty.service';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';
import { CustomerRecordsService } from './customer-records.service';

/**
 * SLICE 12 + LIST A ITEM A3 — PROVEN AGAINST A REAL DATABASE.
 *
 * ── 🔴 WHY THIS FILE EXISTS AND A UNIT TEST WOULD NOT DO ───────────────────
 *
 * `workshop-roles.spec.ts` tests the PREDICATE — given a context, is this a
 * staff role. That is worth having and it proves almost nothing about the
 * product, because the question A3 asks is different:
 *
 *     Can a real CUSTOMER, through the real service, reach the workshop's
 *     invoice book — and can they reach their OWN invoices?
 *
 * The 2026-08-07 defect passed every unit test in the repository. So did slice
 * 11, which 404'd on every call, and slice 9, whose every write committed and
 * then threw 403. A green build proves the code compiles. This drives the
 * services against real Postgres with a real customer context, which is the
 * only thing that would have caught any of the three.
 *
 * ⚠️ IT BUILDS ITS OWN FIXTURE AND ROLLS IT BACK. Two customers, because every
 * interesting failure here is "customer B reaching customer A's row", and a
 * one-customer fixture cannot express it — it would pass vacuously for ever.
 *
 * ⚠️ IT SKIPS CLEANLY WITH NO DATABASE, but a skip is REPORTED rather than
 * silent: `reachable` is asserted in the first test, so a CI run with no
 * Postgres fails that one test instead of printing a row of green ticks for
 * checks that never executed.
 */

/**
 * 🔴 TWO ROLES, ON PURPOSE — AND THIS IS THE SUBTLEST PART OF THE FILE.
 *
 * The fixture is built by the OWNER connection, because migration 038 shut the
 * registration bootstrap door to everyone except the owner of
 * `register_workshop`: a migration is, and the application is not. Connecting
 * as `autoworkshop_app` and trying to build a tenant fails with "new row
 * violates row-level security policy for table tenants", which is the door
 * working correctly.
 *
 * But the OWNER also BYPASSES RLS, and an assertion made under a role that
 * bypasses RLS says nothing whatsoever — that trap has cost this repository two
 * sessions in both directions (036 passed 9/9 against a live-only defect; 045
 * reported a correct schema as broken). So every assertion runs under
 * `SET LOCAL ROLE autoworkshop_app`, which is the role the application really
 * connects as and which RLS genuinely applies to.
 *
 * Build as owner, assert as the app. Neither role can do the other's job.
 */
const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

/** The role the application connects as — the one RLS applies to. */
const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let reachable = false;

// Fixture ids, filled by beforeAll.
let tenantId = '';
let orgId = '';
let userA = '';
let userB = '';
let custA = '';
let custB = '';
let invoiceA = '';
let policyA = '';

const ctxFor = (userId: string, role: string): TenantContext => ({
  tenantId,
  organizationId: orgId,
  branchId: null,
  userId,
  activeRole: role,
  correlationId: 'slice-12-integration',
});

/**
 * A `DatabaseService` stand-in that runs every call in ONE transaction which is
 * rolled back at the end, so the fixture never persists.
 *
 * 🔴 THE SAME CLIENT THROUGHOUT. Handing each call a fresh pooled connection
 * would put the fixture in an uncommitted transaction on one connection and the
 * reads on another, where they cannot see it — the test would then fail for a
 * reason that has nothing to do with the code under test.
 */
class OneTransactionDb {
  constructor(private readonly client: PoolClient) {}

  async withTenant<T>(ctx: TenantContext, work: (c: PoolClient) => Promise<T>): Promise<T> {
    // Re-bind the context on every call, exactly as the real service does — a
    // savepoint rather than a transaction, so a refusal does not abort the
    // fixture we still need.
    await this.client.query('SAVEPOINT s');
    try {
      for (const stmt of tenantSessionStatements(ctx)) {
        await this.client.query(stmt.text, stmt.values);
      }
      // 🔴 DROP TO THE APPLICATION ROLE FOR THE ACTUAL WORK. Without this every
      // assertion below runs as the owner, RLS applies to nothing, and the
      // suite reports success about the one thing it exists to check.
      await this.client.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const out = await work(this.client);
      await this.client.query('RESET ROLE');
      await this.client.query('RELEASE SAVEPOINT s');
      return out;
    } catch (e) {
      await this.client.query('ROLLBACK TO SAVEPOINT s').catch(() => undefined);
      // The savepoint rollback restores the role too, but say so explicitly
      // rather than relying on it — a fixture step running as the wrong role
      // fails in a way that looks like a product defect.
      await this.client.query('RESET ROLE').catch(() => undefined);
      throw e;
    }
  }
}

/** Audit writes are not what this file is testing; swallow them. */
const noAudit = { write: async () => undefined } as never;

let client: PoolClient | null = null;
let records: CustomerRecordsService;
let finance: FinanceService;
let warranty: WarrantyService;
let users: UserService;
let memberships: MembershipService;
let reception: ReceptionService;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, max: 2, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    await pool?.end().catch(() => undefined);
    pool = null;
    return;
  }

  client = await pool.connect();
  await client.query('BEGIN');

  // ── build the fixture through the bootstrap door, as verify/045 does ──────
  const me = await client.query<{ id: string }>('SELECT id FROM identity.users LIMIT 1');
  const seedUser = me.rows[0]?.id;
  if (!seedUser) throw new Error('no identity.users rows — cannot build a fixture');

  tenantId = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;
  orgId = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0]!.id;

  await client.query(`SELECT set_config('app.bootstrap', 'on', true)`);
  await client.query(`SELECT set_config('app.bootstrap_user', $1, true)`, [seedUser]);
  // ⚠️ THE SLUG IS ITS OWN PARAMETER. Reusing $1 as both a uuid and a text
  // gave "inconsistent types deduced for parameter $1" — Postgres infers one
  // type per placeholder, from its first use.
  await client.query(
    `INSERT INTO identity.tenants (id, name, slug, created_by)
     VALUES ($1, 'slice12 tenant', $2, $3)`,
    [tenantId, `slice12-${tenantId.replace(/-/g, '')}`, seedUser],
  );
  await client.query(
    `INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
     VALUES ($1, $2, 'slice12 workshop', 'individual_workshop', $3)`,
    [orgId, tenantId, seedUser],
  );

  // Two real users, so each customer's `user_id` link is genuine — the link
  // `resolveCustomerId` derives from and the whole point of the predicate.
  const mkUser = async (email: string) => {
    const r = await client!.query<{ id: string }>(
      // `keycloak_subject` is NOT NULL — every application user is an identity
      // the IdP issued, and there is no such thing here as a user this product
      // invented for itself.
      `INSERT INTO identity.users (email, display_name, keycloak_subject, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [email, email, `slice12-${email}`],
    );
    return r.rows[0]!.id;
  };
  userA = await mkUser(`slice12-a-${tenantId}@example.test`);
  userB = await mkUser(`slice12-b-${tenantId}@example.test`);
  await client.query(`SELECT set_config('app.bootstrap', 'off', true)`);

  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  await client.query(`SELECT set_config('app.organization_ids', $1, true)`, [orgId]);

  const mkCustomer = async (name: string, userId: string) => {
    const r = await client!.query<{ id: string }>(
      `INSERT INTO core.customers (tenant_id, organization_id, display_name, user_id, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [tenantId, orgId, name, userId, seedUser],
    );
    return r.rows[0]!.id;
  };
  custA = await mkCustomer('slice12 customer A', userA);
  custB = await mkCustomer('slice12 customer B', userB);

  let makeId = (await client.query<{ id: string }>('SELECT id FROM core.vehicle_makes LIMIT 1'))
    .rows[0]?.id;
  if (!makeId) {
    makeId = (
      await client.query<{ id: string }>(
        `INSERT INTO core.vehicle_makes (name) VALUES ('slice12 make') RETURNING id`,
      )
    ).rows[0]!.id;
  }

  const veh = (
    await client.query<{ id: string }>(
      `INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, registration_number,
                                  make_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [tenantId, orgId, custA, `S12-${tenantId.slice(0, 6)}`, makeId, seedUser],
    )
  ).rows[0]!.id;

  const job = (
    await client.query<{ id: string }>(
      `INSERT INTO repair.job_cards (tenant_id, organization_id, job_number, customer_id,
                                     vehicle_id, complaint, created_by)
       VALUES ($1,$2, repair.next_job_number($2), $3,$4,'slice12 noise',$5) RETURNING id`,
      [tenantId, orgId, custA, veh, seedUser],
    )
  ).rows[0]!.id;

  // ISSUED, not draft — the customer's list deliberately excludes drafts, so a
  // draft fixture would make every assertion below pass by returning nothing.
  invoiceA = (
    await client.query<{ id: string }>(
      `INSERT INTO finance.invoices (tenant_id, organization_id, job_card_id, invoice_number,
                                     currency, status, gross_total, issued_at, created_by)
       VALUES ($1,$2,$3,$4,'GHS','issued',500.00, now(), $5) RETURNING id`,
      [tenantId, orgId, job, `S12-INV-${tenantId.slice(0, 6)}`, seedUser],
    )
  ).rows[0]!.id;

  policyA = (
    await client.query<{ id: string }>(
      `INSERT INTO warranty.policies (tenant_id, organization_id, job_card_id, vehicle_id,
                                      policy_number, cover_summary, expires_on, created_by)
       VALUES ($1,$2,$3,$4,$5,'slice12 cover', current_date + 90, $6) RETURNING id`,
      [tenantId, orgId, job, veh, `S12-POL-${tenantId.slice(0, 6)}`, seedUser],
    )
  ).rows[0]!.id;

  // ⚠️ FinanceService and WarrantyService take the DB ONLY — they do not audit
  // reads. Passing a second argument ran fine under vitest (JavaScript ignores
  // it) and was caught only by `tsc`. Worth the note: "the test passed" and
  // "the call was correct" are different statements.
  const db = new OneTransactionDb(client) as never;
  records = new CustomerRecordsService(db, noAudit);
  finance = new FinanceService(db);
  warranty = new WarrantyService(db);
  users = new UserService(db);
  memberships = new MembershipService(db, noAudit);
  reception = new ReceptionService(db);
});

afterAll(async () => {
  // Nothing this file wrote survives.
  await client?.query('ROLLBACK').catch(() => undefined);
  client?.release();
  await pool?.end().catch(() => undefined);
});

describe('slice 12 — a customer reaches their own records and nothing else', () => {
  it('the database is reachable (a skipped suite must not read as a pass)', () => {
    expect(reachable).toBe(true);
  });

  // ── the door that was opened ────────────────────────────────────────────

  it('customer A sees their own issued invoice', async () => {
    const rows = await records.listMyInvoices(ctxFor(userA, 'customer'));
    expect(rows.map((r) => r.id)).toContain(invoiceA);
  });

  it('customer A can open their own invoice and read its lines', async () => {
    const one = await records.getMyInvoice(ctxFor(userA, 'customer'), invoiceA);
    expect(one.id).toBe(invoiceA);
    expect(one.lines).toBeDefined();
  });

  it('customer A sees their own warranty policy', async () => {
    const rows = await records.listMyWarrantyPolicies(ctxFor(userA, 'customer'));
    expect(rows.map((r) => r.id)).toContain(policyA);
  });

  // ── the wall between two customers of the SAME workshop ─────────────────
  //
  // 🔴 RLS CANNOT DO THIS. Both customers are in one organisation, so no policy
  // can separate them. If the service predicate regresses, these are the only
  // tests in the repository that would notice.

  it('customer B does NOT see customer A invoice', async () => {
    const rows = await records.listMyInvoices(ctxFor(userB, 'customer'));
    expect(rows.map((r) => r.id)).not.toContain(invoiceA);
  });

  it('customer B cannot open customer A invoice by id', async () => {
    await expect(records.getMyInvoice(ctxFor(userB, 'customer'), invoiceA)).rejects.toThrow();
  });

  it('customer B does NOT see customer A warranty', async () => {
    const rows = await records.listMyWarrantyPolicies(ctxFor(userB, 'customer'));
    expect(rows.map((r) => r.id)).not.toContain(policyA);
  });

  it('a customer naming another customer is REFUSED, not silently given their own', async () => {
    // Silent substitution would mask an authorization probe — the same reason
    // TenantGuard refuses a client-supplied organisation.
    await expect(
      records.listMyInvoices(ctxFor(userB, 'customer'), custA),
    ).rejects.toThrow(/only see your own/i);
  });

  // ── A3: THE STAFF GATE, PROVEN FROM THE OUTSIDE ─────────────────────────
  //
  // This is what LIST A item A3 asked for. Until now the fix was REASONED: the
  // predicate had a unit test and nothing drove the workshop's own services
  // with a customer context. These do.

  it('A3 — a customer is REFUSED the workshop invoice book', async () => {
    await expect(finance.listInvoices(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A3 — a customer is REFUSED a workshop invoice by id', async () => {
    await expect(finance.getInvoice(ctxFor(userA, 'customer'), invoiceA)).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A3 — a customer is REFUSED the workshop payment record', async () => {
    await expect(finance.listPayments(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A3 — a customer is REFUSED the workshop warranty policies and claims', async () => {
    await expect(warranty.listPolicies(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
    await expect(warranty.listClaims(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A3 — the refusal NAMES what the customer can still reach', async () => {
    // A rule whose escape hatch does not exist is a wall, and walls are the
    // most expensive defect class recorded in this repository.
    await expect(finance.listInvoices(ctxFor(userA, 'customer'))).rejects.toThrow(
      /your own pages/i,
    );
  });

  // ── A5: THE SAME PATTERN, FOUND IN FIVE MORE SERVICES ───────────────────
  //
  // 🔴 A CUSTOMER IS A CAR OWNER WHO BRINGS A VEHICLE IN. They are not staff,
  // and the workshop's own registers are not theirs to read. Sweeping the
  // services LIST A item A5 named turned up eleven more ungated reads behind
  // controllers carrying only `TenantGuard`:
  //
  //   · `/users` and `/memberships` — THE STAFF ROSTER, WITH EMAILS. The same
  //     data the security-posture leak exposed on 2026-08-07, still open by a
  //     different door.
  //   · `/appointments`, `/walk-ins`, `/customer-feedback` — OTHER CUSTOMERS'
  //     names, vehicles, times and complaints. Customer-to-customer PII.
  //   · `/service-bays`, `/branches`, `/organizations` — workshop internals.
  //
  // Every consumer of these is workshop-web or admin-web, both staff
  // workspaces, so gating them breaks no customer screen — checked before
  // changing anything, because a gate that walls a real caller is the defect
  // class this repository has paid the most for.

  it('A5 — a customer is REFUSED the staff roster', async () => {
    await expect(users.list(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
    await expect(memberships.list(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A5 — a customer is REFUSED the appointment book and walk-in register', async () => {
    await expect(reception.listAppointments(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
    await expect(reception.listWalkIns(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A5 — a customer is REFUSED other customers feedback', async () => {
    await expect(reception.listFeedback(ctxFor(userA, 'customer'))).rejects.toThrow(
      /belongs to the workshop/i,
    );
  });

  it('A5 — staff still read all of it', async () => {
    // The other half of every gate. A refusal that also refuses the people who
    // need the data is not a fix, it is an outage.
    await expect(users.list(ctxFor(userA, 'workshop_owner'))).resolves.toBeDefined();
    await expect(memberships.list(ctxFor(userA, 'workshop_owner'))).resolves.toBeDefined();
    await expect(
      reception.listAppointments(ctxFor(userA, 'reception_staff')),
    ).resolves.toBeDefined();
    await expect(reception.listFeedback(ctxFor(userA, 'reception_staff'))).resolves.toBeDefined();
  });

  // ── and staff are not locked out of either question ─────────────────────

  it('staff still read the workshop invoice book', async () => {
    const rows = await finance.listInvoices(ctxFor(userA, 'workshop_owner'));
    expect(rows.map((r) => r.id)).toContain(invoiceA);
  });

  it('staff may name a customer and get that customer records', async () => {
    const rows = await records.listMyInvoices(ctxFor(userA, 'reception_staff'), custA);
    expect(rows.map((r) => r.id)).toContain(invoiceA);

    const other = await records.listMyInvoices(ctxFor(userA, 'reception_staff'), custB);
    expect(other.map((r) => r.id)).not.toContain(invoiceA);
  });
});
