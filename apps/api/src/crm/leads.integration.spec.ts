import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { DatabaseService } from '../database/database.service';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';
import { LeadsService } from './leads.service';

/**
 * `GET /leads` AND ITS REFUSALS, AGAINST A REAL DATABASE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY A REAL DATABASE AND NOT A MOCK.
 *
 * Everything interesting about this service is a REFUSAL, and every refusal is
 * written twice — once in `assertAgentOperator` and once in migration 064's
 * `lead_select` / `lead_update` policies. A mocked `DatabaseService` proves only
 * the first copy, and the first copy is the one a future refactor deletes by
 * accident. Worse, the LOCAL owner role is a superuser (`rolbypassrls = t`,
 * measured in this repo), so an assertion made on the owner connection would
 * pass against RLS that does not exist. Every assertion below therefore runs
 * under `SET LOCAL ROLE autoworkshop_app`.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS PROVEN ────────────────────────────────────────────────────────
 *
 *   1. an agent operator (the workshop owner) reads the workshop's leads;
 *   2. a TECHNICIAN — staff, but not management — is refused, because this
 *      table's audience is narrower than "staff" and the navigation trees agree;
 *   3. a CUSTOMER is refused, which since migration 061 means "any stranger who
 *      enrolled" and is the reason 064 carries the clause at all;
 *   4. a status change is applied AND audited, with the previous value in the
 *      audit detail;
 *   5. 🔴 A SECOND WORKSHOP'S LEAD IS NEITHER LISTED NOR PATCHABLE. Two orgs
 *      exist so this cannot pass vacuously: the assertion is that org A's list
 *      contains A's lead and NOT B's — never merely that a list is empty, which
 *      would also be true if the query were broken outright.
 *
 * ── ⚠️ NO DATABASE IS A *SKIP*, NOT A PASS AND NOT A FAILURE ──────────────
 *
 * With no Postgres this file prints a loud notice naming what was not proven and
 * every test reports SKIPPED. Three states, never two — and `reachable` is NOT
 * asserted in a test, because doing exactly that turned `Release` red on
 * 2026-08-08 for the environmental reason that CI has no Postgres.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;

/** See `customer-value-chain.integration.spec.ts` — same shape, same reasons. */
class OneTransactionDb {
  constructor(private readonly c: PoolClient) {}

  async withTenant<T>(ctx: TenantContext, work: (c: PoolClient) => Promise<T>): Promise<T> {
    await this.c.query('SAVEPOINT s');
    try {
      for (const stmt of tenantSessionStatements(ctx)) {
        await this.c.query(stmt.text, stmt.values);
      }
      await this.c.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const out = await work(this.c);
      await this.c.query('RESET ROLE');
      await this.c.query('RELEASE SAVEPOINT s');
      return out;
    } catch (err) {
      await this.c.query('ROLLBACK TO SAVEPOINT s').catch(() => undefined);
      await this.c.query('RESET ROLE').catch(() => undefined);
      throw err;
    }
  }
}

let tenantId = '';
let orgA = '';
let orgB = '';
let branchA = '';
let branchB = '';
let ownerA = '';
let technicianA = '';
let customerA = '';
let ownerB = '';
let leadA = '';
let leadB = '';

let leads: LeadsService;

/** A context for one person acting in one organisation. */
function ctxFor(userId: string, role: string, orgId: string, branchId: string): TenantContext {
  return {
    tenantId,
    userId,
    activeRole: role,
    organizationId: orgId,
    organizationIds: [orgId],
    branchId,
    branchIds: [branchId],
    correlationId: `leads-spec-${role}`,
  } as unknown as TenantContext;
}

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, max: 2, connectionTimeoutMillis: 4000 });
    client = await pool.connect();
    await client.query('BEGIN');
    reachable = true;
  } catch {
    await pool?.end().catch(() => undefined);
    pool = null;
    console.warn(
      '[leads.integration] NO DATABASE at ADMIN_URL — this suite is SKIPPED, not ' +
        'passed. GET /leads, its role refusals, its audit trail and its cross-workshop ' +
        'isolation are NOT proven by this run.',
    );
    return;
  }

  const c = client!;
  const tag = Math.random().toString(36).slice(2, 10);

  tenantId = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.tenants (name, slug, status)
       VALUES ('Leads Spec', $1, 'active') RETURNING id`,
      [`leads-spec-${tag}`],
    )
  ).rows[0]!.id;

  const mkOrg = async (name: string) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO identity.organizations (tenant_id, name, org_type, status)
         VALUES ($1, $2, 'individual_workshop', 'active') RETURNING id`,
        [tenantId, name],
      )
    ).rows[0]!.id;

  const mkBranch = async (orgId: string) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO identity.branches (tenant_id, organization_id, name, status)
         VALUES ($1, $2, 'Main branch', 'active') RETURNING id`,
        [tenantId, orgId],
      )
    ).rows[0]!.id;

  orgA = await mkOrg('Leads Spec Motors A');
  orgB = await mkOrg('Leads Spec Motors B');
  branchA = await mkBranch(orgA);
  branchB = await mkBranch(orgB);

  const mkUser = async (subject: string, name: string) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO identity.users (keycloak_subject, email, display_name, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [`${subject}-${tag}`, `${subject}-${tag}@example.test`, name],
      )
    ).rows[0]!.id;

  ownerA = await mkUser('leads-owner-a', 'Olive Owner');
  technicianA = await mkUser('leads-tech-a', 'Tim Technician');
  customerA = await mkUser('leads-customer-a', 'Cara Customer');
  ownerB = await mkUser('leads-owner-b', 'Oscar Owner');

  // ⚠️ THE MEMBERSHIPS ARE SEEDED WITH RAW SQL, INCLUDING THE CUSTOMER'S, and
  // that is honest HERE where it would not be in the value-chain spec. That file
  // exists to prove enrolment can happen at all, so a hand-written membership
  // would beg its question. This file exists to prove REFUSAL, and a fixture
  // that hands the refused party a membership it might not otherwise hold errs
  // in the conservative direction: it makes the refusal harder to achieve, not
  // easier. Since migration 061 the product can create this row anyway.
  const grant = async (userId: string, role: string, orgId: string, branchId: string) =>
    c.query(
      `INSERT INTO identity.memberships
         (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'active',$4)`,
      [tenantId, orgId, branchId, userId, role],
    );
  await grant(ownerA, 'workshop_owner', orgA, branchA);
  await grant(technicianA, 'technician', orgA, branchA);
  await grant(customerA, 'customer', orgA, branchA);
  await grant(ownerB, 'workshop_owner', orgB, branchB);

  const mkLead = async (orgId: string, name: string) =>
    (
      await c.query<{ id: string }>(
        `INSERT INTO crm.leads
           (tenant_id, organization_id, organisation_name, contact_email, location,
            rationale, source_url, status)
         VALUES ($1,$2,$3,$4,'Accra','Runs a fleet of vans',$5,'new') RETURNING id`,
        [tenantId, orgId, name, `${name.replace(/\W+/g, '.')}@example.test`, 'https://example.test/directory'],
      )
    ).rows[0]!.id;

  leadA = await mkLead(orgA, `Alpha Haulage ${tag}`);
  leadB = await mkLead(orgB, `Beta Couriers ${tag}`);

  leads = new LeadsService(new OneTransactionDb(c) as unknown as DatabaseService, new AuditService());
});

afterAll(async () => {
  if (client) {
    // Everything this file wrote is discarded. It writes real leads about
    // fictional businesses and they must not outlive the run.
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  await pool?.end().catch(() => undefined);
});

/**
 * A test that SKIPS (not passes, not fails) when there is no database.
 *
 * 🔴 NOT `it.runIf(reachable)`. That was the first version of this file and it
 * could never have run a single assertion: `runIf` is evaluated while the
 * describe block is being COLLECTED, which happens BEFORE `beforeAll`, so
 * `reachable` is still `false` at that moment for every run — database or no
 * database. The suite reported "9 skipped" against a healthy Postgres and would
 * have gone on reporting it for ever. The skip has to be decided INSIDE the
 * test body, where the connection attempt has already happened.
 *
 * This repository has shipped that defect's twin before: `pnpm e2e` exited 0
 * for two days while executing zero tests. Read the COUNT, never the exit code.
 */
const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

describe('GET /leads — the lead pipeline read model', () => {
  dbIt('lists this workshop’s leads for an agent operator', async () => {
    const rows = await leads.list(ctxFor(ownerA, 'workshop_owner', orgA, branchA));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(leadA);
    // 🔴 THE HALF THAT MATTERS. Asserting only "A is present" would pass with a
    // policy that returns every lead in the database.
    expect(ids).not.toContain(leadB);
  });

  dbIt('returns the source url, which 064 makes NOT NULL', async () => {
    const rows = await leads.list(ctxFor(ownerA, 'workshop_owner', orgA, branchA));
    const row = rows.find((r) => r.id === leadA);
    expect(row?.sourceUrl).toBe('https://example.test/directory');
    expect(row?.status).toBe('new');
  });

  dbIt('filters by status', async () => {
    const none = await leads.list(ctxFor(ownerA, 'workshop_owner', orgA, branchA), {
      status: 'converted',
    });
    expect(none.map((r) => r.id)).not.toContain(leadA);
  });

  dbIt('refuses a technician — staff, but not management', async () => {
    await expect(
      leads.list(ctxFor(technicianA, 'technician', orgA, branchA)),
    ).rejects.toThrow(/workshop owner, a manager or a platform administrator/);
  });

  dbIt('refuses a customer — since 061 that is any stranger', async () => {
    await expect(leads.list(ctxFor(customerA, 'customer', orgA, branchA))).rejects.toThrow();
  });

  /**
   * 🔴 THE TEST THAT MAKES THE TWO ABOVE MEAN SOMETHING.
   *
   * Both refusals above are thrown by `assertAgentOperator` — the APP layer —
   * before a single query runs. They would pass identically against a table with
   * no RLS at all. `CLAUDE.md` §8 wants both layers, and the second one is the
   * one nobody notices going missing, so it is asserted DIRECTLY here: the same
   * SELECT the service would issue, run as `autoworkshop_app` under a customer's
   * session settings, with the app layer bypassed entirely.
   *
   * It must return ZERO rows while the owner's identical read returns the lead —
   * asserted in the same test, because "0 rows" on its own is also what a broken
   * fixture looks like.
   */
  dbIt('migration 064 refuses a customer in the DATABASE, not only in the service', async () => {
    const raw = async (ctx: TenantContext) => {
      await client!.query('SAVEPOINT rls');
      try {
        for (const stmt of tenantSessionStatements(ctx)) {
          await client!.query(stmt.text, stmt.values);
        }
        await client!.query(`SET LOCAL ROLE ${APP_ROLE}`);
        const res = await client!.query<{ id: string }>(
          'SELECT id FROM crm.leads WHERE id = $1',
          [leadA],
        );
        await client!.query('RESET ROLE');
        await client!.query('RELEASE SAVEPOINT rls');
        return res.rows;
      } catch (err) {
        await client!.query('ROLLBACK TO SAVEPOINT rls').catch(() => undefined);
        await client!.query('RESET ROLE').catch(() => undefined);
        throw err;
      }
    };

    const asOwner = await raw(ctxFor(ownerA, 'workshop_owner', orgA, branchA));
    const asCustomer = await raw(ctxFor(customerA, 'customer', orgA, branchA));

    // The control: the row IS reachable, so zero below is a refusal and not an
    // empty table.
    expect(asOwner).toHaveLength(1);
    expect(asCustomer).toHaveLength(0);
  });
});

describe('PATCH /leads/:id — moving a lead along the pipeline', () => {
  dbIt('applies the status and audits the transition', async () => {
    const ctx = ctxFor(ownerA, 'workshop_owner', orgA, branchA);
    const updated = await leads.setStatus(ctx, leadA, 'qualified');
    expect(updated.status).toBe('qualified');
    expect(updated.updatedAt).not.toBeNull();

    // ⚠️ `occurred_at`, NOT `created_at` — `audit.events` (migration 001) names
    // it for when the thing HAPPENED, not when the row was written. Read on the
    // fixture's own connection, which is inside the same uncommitted
    // transaction the write went into; a pooled connection could not see it.
    const events = await client!.query<{ detail: unknown }>(
      `SELECT detail FROM audit.events
        WHERE resource_id = $1 AND action = 'crm.lead.status_changed'
        ORDER BY occurred_at DESC LIMIT 1`,
      [leadA],
    );
    // The audit row is what makes a reversible pipeline safe: the column holds
    // only the latest value, so the sequence has to live somewhere else.
    expect(events.rows[0]?.detail).toMatchObject({ from: 'new', to: 'qualified' });
  });

  dbIt('allows a lead to be moved BACK, so a mis-click is not a one-way door', async () => {
    const ctx = ctxFor(ownerA, 'workshop_owner', orgA, branchA);
    await leads.setStatus(ctx, leadA, 'rejected');
    const back = await leads.setStatus(ctx, leadA, 'qualified');
    expect(back.status).toBe('qualified');
  });

  dbIt('refuses another workshop’s lead as NOT FOUND, not forbidden', async () => {
    // Not-found rather than forbidden on purpose: answering "forbidden" would
    // confirm the id exists, which is itself a disclosure about another workshop.
    await expect(
      leads.setStatus(ctxFor(ownerA, 'workshop_owner', orgA, branchA), leadB, 'contacted'),
    ).rejects.toThrow(/not found/i);
  });

  dbIt('refuses a customer trying to move a lead', async () => {
    await expect(
      leads.setStatus(ctxFor(customerA, 'customer', orgA, branchA), leadA, 'converted'),
    ).rejects.toThrow();
  });
});
