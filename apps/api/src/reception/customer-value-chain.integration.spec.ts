import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { DatabaseService } from '../database/database.service';
import { CustomerEnrolmentService } from '../identity/customer-enrolment.service';
import { MembershipRepository } from '../identity/membership.repository';
import { NotificationsService } from '../notifications/notifications.service';
import type { MailTransport } from '../notifications/mail-transport';
import { VehicleService } from '../core/vehicle.service';
import { JobCardService } from '../repair/job-card.service';
import type { ServiceRequestTriageAgent } from '../agents/service-request-triage.agent';
import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';
import { ServiceRequestService } from './service-request.service';

/**
 * THE CUSTOMER VALUE CHAIN, DRIVEN END TO END AGAINST A REAL DATABASE.
 *
 * Owner, 2026-08-08: *"setup the customer request in the workshop and assign
 * technicians get job started."*
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS FILE EXISTS, AND WHY EVERY EARLIER "PROOF" OF THIS CHAIN WAS
 * WORTHLESS.
 *
 * Two shapes of proof existed before today and neither could see the defect
 * that shipped:
 *
 *   1. HTTP-LAYER PROOFS. They asserted the routes exist and 401 without a
 *      token. A route that answers 401 to everyone alive answers 401 correctly.
 *   2. SERVICE PROOFS AGAINST A SEEDED CUSTOMER. `customer-records.integration
 *      .spec.ts` and every sibling build their `customer` membership with a raw
 *      INSERT, the same way `scripts/seed-dev-identity.sh` does. **NO
 *      PRODUCTION CODE PATH CAN CREATE THAT ROW.** Until migration 061 the
 *      product's only two writers of `identity.memberships` were
 *      `register_workshop` (grants `workshop_owner`) and the admin-only
 *      `MembershipService.grant()`. So a real Keycloak sign-up produced an
 *      account with no membership, `TenantGuard` threw `user holds no active
 *      membership`, and the Request for Service form POSTed into a 401 —
 *      while every test in this repository stayed green against a fixture the
 *      product cannot produce.
 *
 * SO THE CUSTOMER IN THIS FILE IS ENROLLED BY `CustomerEnrolmentService.enrol()`
 * — the real route's real service — and by nothing else. No raw membership
 * INSERT appears anywhere below. If enrolment regresses, step 1 fails and every
 * step after it fails with it, which is the correct shape for a chain.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT DRIVES, IN ORDER ──────────────────────────────────────────────
 *
 *   1. a stranger with a Keycloak subject and NO membership is enrolled at a
 *      workshop that PUBLISHED itself in `catalogue.mechanic_directory`;
 *   2. that customer files a service request (`ServiceRequestService.create`);
 *   3. the workshop's staff are told, in the SAME transaction (migration 060) —
 *      and the customer is NOT told about their own request;
 *   4. reception reads the inbox; a customer is REFUSED that same inbox;
 *   5. reception accepts, registers the car, and converts to a job card;
 *   6. a technician is assigned at conversion — 🔴 THIS DID NOT WORK WHEN THE
 *      FILE WAS WRITTEN; see the gap recorded in full at step 6;
 *   7. the customer reads their OWN job card and CANNOT read another's.
 *
 * ── ⚠️ TWO CUSTOMERS, ON PURPOSE ──────────────────────────────────────────
 *
 * Step 7's only interesting failure is "customer B reaching customer A's card".
 * A one-customer fixture cannot express that and would pass vacuously for ever,
 * so B exists, B has a car and a job card of their own, and the assertion is
 * that B's list contains B's card and NOT A's — never merely that B's list is
 * empty, which would also be true if the whole query were broken.
 *
 * ── ⚠️ BUILD AS OWNER, ASSERT AS THE APP ──────────────────────────────────
 *
 * The fixture is built by the OWNER connection because migration 038 shut the
 * bootstrap door to everyone except the owner of `register_workshop`. But the
 * LOCAL owner is a superuser (`rolsuper = t`, `rolbypassrls = t`, measured), so
 * it BYPASSES RLS and an assertion made under it says nothing whatsoever. Every
 * assertion below therefore runs under `SET LOCAL ROLE autoworkshop_app` — the
 * role the application really connects as and which RLS genuinely applies to.
 *
 * ── ⚠️ NO DATABASE IS A *SKIP*, NOT A PASS AND NOT A FAILURE ──────────────
 *
 * With no Postgres the suite prints a loud notice naming what was not proven
 * and every test reports SKIPPED. Three states, never two.
 *
 * 🔴 AND `reachable` IS NOT ASSERTED IN A TEST. Doing that turned `Release` RED
 * on 2026-08-08: CI has no Postgres, so a correct instinct — a silent skip is
 * indistinguishable from a pass — became a failure for an ENVIRONMENTAL reason,
 * which is the one thing guaranteed to teach people to ignore red. The three
 * states are kept by SAYING SO on stderr and skipping.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

/** The role the application connects as — the one RLS applies to. */
const APP_ROLE = process.env.APP_DB_ROLE ?? 'autoworkshop_app';

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;

/**
 * A `DatabaseService` stand-in that runs every call in ONE transaction which is
 * rolled back at the end, so nothing this file writes survives.
 *
 * 🔴 THE SAME CLIENT THROUGHOUT. Handing each call a fresh pooled connection
 * would leave the fixture in an uncommitted transaction on one connection and
 * the reads on another, where they cannot see it — the suite would then fail for
 * a reason with nothing to do with the code under test.
 */
class OneTransactionDb {
  constructor(private readonly c: PoolClient) {}

  async withTenant<T>(ctx: TenantContext, work: (c: PoolClient) => Promise<T>): Promise<T> {
    // A SAVEPOINT rather than a transaction: a REFUSAL is a result this file
    // asserts, and an aborted transaction would take the fixture with it.
    await this.c.query('SAVEPOINT s');
    try {
      for (const stmt of tenantSessionStatements(ctx)) {
        await this.c.query(stmt.text, stmt.values);
      }
      // 🔴 DROP TO THE APPLICATION ROLE FOR THE ACTUAL WORK. Without this every
      // assertion runs as the superuser owner, RLS applies to nothing, and the
      // suite reports success about the one thing it exists to check.
      await this.c.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const out = await work(this.c);
      await this.c.query('RESET ROLE');
      await this.c.query('RELEASE SAVEPOINT s');
      return out;
    } catch (err) {
      await this.c.query('ROLLBACK TO SAVEPOINT s').catch(() => undefined);
      // The savepoint rollback restores the role too, but say so explicitly
      // rather than rely on it — a fixture step running as the wrong role fails
      // in a way that looks exactly like a product defect.
      await this.c.query('RESET ROLE').catch(() => undefined);
      throw err;
    }
  }

  /**
   * The real one is `pool.query` — a FRESH connection with no tenant GUCs set
   * at all. That is faithfully reproduced here by CLEARING the five settings
   * rather than merely not setting them: a leftover `app.tenant_id` from the
   * previous `withTenant` call would let a query succeed here that fails in
   * production, which is the false-pass this whole file exists to avoid.
   *
   * Still the app role, because `enrol_as_customer` and
   * `memberships_for_subject` are SECURITY DEFINER functions whose entire point
   * is to be reachable by a caller RLS would otherwise refuse. Calling them as
   * the bypassing owner would prove they can be called, not that they work.
   */
  async queryWithoutTenant<T>(text: string, values: unknown[] = []): Promise<T[]> {
    await this.c.query('SAVEPOINT q');
    try {
      for (const key of [
        'app.tenant_id',
        'app.user_id',
        'app.current_role',
        'app.organization_ids',
        'app.branch_ids',
      ]) {
        await this.c.query('SELECT set_config($1, $2, true)', [key, '']);
      }
      await this.c.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const res = await this.c.query(text, values as never[]);
      await this.c.query('RESET ROLE');
      await this.c.query('RELEASE SAVEPOINT q');
      return res.rows as T[];
    } catch (err) {
      await this.c.query('ROLLBACK TO SAVEPOINT q').catch(() => undefined);
      await this.c.query('RESET ROLE').catch(() => undefined);
      throw err;
    }
  }
}

// ── fixture ids, filled by beforeAll and by the chain itself ────────────────
let tenantId = '';
let orgId = '';
let branchId: string | null = null;
let makeId = '';

// Staff. Their memberships ARE seeded with raw SQL, and that is honest: staff
// arrive through `register_workshop` (the owner) and `MembershipService.grant()`
// (everyone else), both of which are proven elsewhere and neither of which is
// what today's defect was about. THE CUSTOMER'S MEMBERSHIP IS NOT SEEDED.
let receptionUserId = '';
let ownerUserId = '';
let technicianUserId = '';

/**
 * The two strangers.
 *
 * ⚠️ THE SUBJECTS CARRY A PER-RUN TAG, filled by `beforeAll`. `identity.users
 * .keycloak_subject` is UNIQUE and this file rolls back rather than cleaning up,
 * so a fixed subject would collide with any row a previous run left behind after
 * a crash — a failure that looks like a product defect and is not one.
 */
let subjectA = '';
let subjectB = '';
let userA = '';
let userB = '';
let emailA = '';
let emailB = '';
let customerA = '';
let customerB = '';

// Produced by the chain.
let vehicleA = '';
let vehicleB = '';
let requestId = '';
let jobCardId = '';
let jobNumber = '';
let requestB = '';
let cardOfB = '';

/** Every call the triage agent received — see step 2. */
const triageCalls: Array<{ requestId: string; complaint: string }> = [];

let db: DatabaseService;
let enrolment: CustomerEnrolmentService;
let memberships: MembershipRepository;
let requests: ServiceRequestService;
let jobCards: JobCardService;
let vehicles: VehicleService;
let notifications: NotificationsService;

const ctxFor = (userId: string, role: string): TenantContext => ({
  tenantId,
  organizationId: orgId,
  branchId,
  userId,
  activeRole: role,
  correlationId: 'customer-value-chain',
});

/** Raw SQL under the SAME binding and the SAME role the services get. */
const asApp = async <T>(
  ctx: TenantContext,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> =>
  db.withTenant(ctx, async (c) => (await c.query(sql, values as never[])).rows as T[]);

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
      '[customer-value-chain.integration] NO DATABASE at ADMIN_URL — this suite is ' +
        'SKIPPED, not passed. The customer value chain (enrolment → service request → ' +
        'notification → inbox → decision → job card → technician → customer read) is ' +
        'NOT proven by this run.',
    );
    return;
  }

  const c = client!;
  const tag = Math.random().toString(36).slice(2, 10);

  // ── the workshop ────────────────────────────────────────────────────────
  tenantId = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.tenants (name, slug, status)
       VALUES ('Value Chain Spec', $1, 'active') RETURNING id`,
      [`value-chain-${tag}`],
    )
  ).rows[0]!.id;

  orgId = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.organizations (tenant_id, name, org_type, status)
       VALUES ($1, 'Value Chain Motors', 'individual_workshop', 'active') RETURNING id`,
      [tenantId],
    )
  ).rows[0]!.id;

  branchId = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.branches (tenant_id, organization_id, name, status)
       VALUES ($1, $2, 'Main branch', 'active') RETURNING id`,
      [tenantId, orgId],
    )
  ).rows[0]!.id;

  // 🔴 THE WORKSHOP'S CONSENT. Migration 061 constraint 2: enrolment is refused
  // unless the workshop has published itself. Publishing IS the opt-in to being
  // found — and joined — by strangers.
  await c.query(
    `INSERT INTO catalogue.mechanic_directory
       (organization_id, trading_name, city, country, is_published)
     VALUES ($1, 'Value Chain Motors', 'Accra', 'GH', TRUE)
     ON CONFLICT (organization_id) DO UPDATE SET is_published = TRUE`,
    [orgId],
  );

  // ── the people ──────────────────────────────────────────────────────────
  const mkUser = async (subject: string, email: string, name: string) =>
    (
      await c.query<{ id: string }>(
        // `keycloak_subject` is NOT NULL — every application user is an identity
        // the IdP issued. There is no user this product invents for itself.
        `INSERT INTO identity.users (keycloak_subject, email, display_name, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [`${subject}-${tag}`, email, name],
      )
    ).rows[0]!.id;

  receptionUserId = await mkUser('cvc-reception', `cvc-reception-${tag}@example.test`, 'Rita Reception');
  ownerUserId = await mkUser('cvc-owner', `cvc-owner-${tag}@example.test`, 'Otto Owner');
  technicianUserId = await mkUser('cvc-tech', `cvc-tech-${tag}@example.test`, 'Tina Technician');

  const grant = async (userId: string, role: string) =>
    c.query(
      `INSERT INTO identity.memberships
         (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'active',$4)`,
      [tenantId, orgId, branchId, userId, role],
    );
  await grant(receptionUserId, 'reception_staff');
  await grant(ownerUserId, 'workshop_owner');
  await grant(technicianUserId, 'technician');

  // The two strangers: an identity and NOTHING ELSE. No membership, no customer
  // record. That is exactly the state a real Keycloak sign-up leaves a person in
  // — `provision_user_from_subject` creates the user and grants nothing.
  subjectA = `cvc-stranger-a-${tag}`;
  subjectB = `cvc-stranger-b-${tag}`;
  emailA = `cvc-a-${tag}@example.test`;
  emailB = `cvc-b-${tag}@example.test`;
  userA = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.users (keycloak_subject, email, display_name, status)
       VALUES ($1, $2, 'Ada Stranger', 'active') RETURNING id`,
      [subjectA, emailA],
    )
  ).rows[0]!.id;
  userB = (
    await c.query<{ id: string }>(
      `INSERT INTO identity.users (keycloak_subject, email, display_name, status)
       VALUES ($1, $2, 'Ben Stranger', 'active') RETURNING id`,
      [subjectB, emailB],
    )
  ).rows[0]!.id;

  // Shared reference data with no tenant dimension.
  makeId =
    (await c.query<{ id: string }>('SELECT id FROM core.vehicle_makes LIMIT 1')).rows[0]?.id ??
    (
      await c.query<{ id: string }>(
        `INSERT INTO core.vehicle_makes (name) VALUES ($1) RETURNING id`,
        [`value-chain-make-${tag}`],
      )
    ).rows[0]!.id;

  // ── the services, wired exactly as `ReceptionModule` wires them ─────────
  db = new OneTransactionDb(c) as unknown as DatabaseService;
  const audit = new AuditService();

  // The mail transport is a stub because this file never drains the outbox.
  // ⚠️ THAT IS NOT A HOLE IN THE PROOF: migration 060 writes the notification in
  // the business transaction and DELIVERS separately, so what step 3 must show
  // is that the row was WRITTEN — which needs no transport at all.
  const mail = {
    isConfigured: () => false,
    describe: () => 'stub transport — this spec never drains',
  } as unknown as MailTransport;

  // The triage agent is a recorder. It genuinely runs AFTER the request commits
  // and OUTSIDE its transaction (see its own docstring), so driving the real one
  // here would either need a live Ollama or would attach a floating promise to a
  // client this file is about to ROLL BACK. What is worth proving is the WIRING —
  // that the agent is handed the request at all — and the recorder proves that.
  const triage = {
    triageInBackground: (
      _ctx: TenantContext,
      id: string,
      input: { complaint: string },
    ): void => {
      triageCalls.push({ requestId: id, complaint: input.complaint });
    },
  } as unknown as ServiceRequestTriageAgent;

  memberships = new MembershipRepository(db);
  enrolment = new CustomerEnrolmentService(memberships, db);
  vehicles = new VehicleService(db, audit);
  jobCards = new JobCardService(db, audit);
  notifications = new NotificationsService(db, audit, mail);
  requests = new ServiceRequestService(db, jobCards, notifications, triage);
});

afterAll(async () => {
  // ⚠️ ROLLBACK, never COMMIT. Nothing this file wrote survives the run.
  await client?.query('ROLLBACK').catch(() => undefined);
  client?.release();
  await pool?.end().catch(() => undefined);
});

/** A test that SKIPS (not passes, not fails) when there is no database. */
const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

describe('the customer value chain, end to end, through the real services', () => {
  // ══ STEP 0 — THE ASSERTIONS BELOW MUST NOT BE VACUOUS ════════════════════

  dbIt('step 0 — every assertion below really runs as the application role', async () => {
    // 🔴 THIS IS THE TEST THAT MAKES THE OTHER TWENTY-NINE MEAN ANYTHING.
    //
    // The fixture is built by the local owner, which is `rolsuper = t,
    // rolbypassrls = t` — it bypasses RLS entirely, FORCE or not. If
    // `SET LOCAL ROLE` in `OneTransactionDb` ever stopped taking effect, every
    // isolation assertion in this file would pass while proving nothing, and
    // nothing else here would notice. This repository has paid for that trap in
    // both directions (036 passed 9/9 against a live-only defect; 045 reported a
    // correct schema as broken), so the role is checked rather than assumed.
    const rows = await asApp<{ who: string; bypass: boolean }>(
      ctxFor(receptionUserId, 'reception_staff'),
      `SELECT current_user::text AS who,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
    );
    expect(rows[0]!.who).toBe(APP_ROLE);
    expect(
      rows[0]!.bypass,
      'the role these tests run as BYPASSES RLS — every isolation assertion in this file is vacuous',
    ).toBe(false);
  });

  // ══ STEP 1 — A STRANGER BECOMES A CUSTOMER ═══════════════════════════════

  dbIt('step 1 — before enrolment the stranger holds NO membership at all', async () => {
    // The EXACT lookup `TenantGuard` makes, through the same repository, as the
    // app role. Zero memberships here is the whole 2026-08-08 defect: the person
    // exists, signs in successfully, and `resolveTenantContext` then throws
    // `user holds no active membership` at every customer route.
    const found = await memberships.findByKeycloakSubject(subjectA);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe(userA);
    expect(
      found!.memberships,
      'the stranger already holds a membership — the fixture seeded one, which is exactly the mistake this file exists to avoid',
    ).toHaveLength(0);
  });

  dbIt('step 1 — CustomerEnrolmentService.enrol() enrols the stranger', async () => {
    const result = await enrolment.enrol(subjectA, orgId, 'Ada Stranger', emailA);
    expect(result.roleName).toBe('customer');
    expect(result.created).toBe(true);
    expect(result.organizationId).toBe(orgId);
    expect(result.customerId).toBeTruthy();
    customerA = result.customerId;
  });

  dbIt('step 1 — BOTH halves landed: a `customer` membership AND a linked customer record', async () => {
    // Read back independently of the return value, under the APP role. The
    // question is what is IN the database for a caller RLS applies to, not what
    // the method said.
    const ctx = ctxFor(userA, 'customer');

    const m = await asApp<{ role_name: string; status: string }>(
      ctx,
      `SELECT role_name, status FROM identity.memberships
        WHERE user_id = $1 AND organization_id = $2`,
      [userA, orgId],
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.role_name).toBe('customer');
    expect(m[0]!.status).toBe('active');

    // 🔴 THE HALF NOTHING IN THE PRODUCT HAD EVER WRITTEN. Every customer-scoped
    // read in this API is `AND ($n::uuid IS NULL OR c.user_id = $n::uuid)` —
    // about forty of them — and they all resolve through this column. A
    // membership without it produces an account that reaches the workshop's
    // shared surfaces and NONE of its own records.
    const cust = await asApp<{ id: string; user_id: string }>(
      ctx,
      `SELECT id, user_id FROM core.customers WHERE organization_id = $1 AND user_id = $2`,
      [orgId, userA],
    );
    expect(
      cust.length,
      'no core.customers row linked to the enrolled user — the customer would reach the workshop’s shared surfaces and none of their own records',
    ).toBe(1);
    expect(cust[0]!.id).toBe(customerA);
  });

  dbIt('step 1 — a SECOND customer is enrolled the same way (step 7 needs a wall)', async () => {
    const result = await enrolment.enrol(subjectB, orgId, 'Ben Stranger', emailB);
    expect(result.created).toBe(true);
    customerB = result.customerId;
    expect(customerB).not.toBe(customerA);
  });

  // ══ STEP 2 — THE CUSTOMER ASKS FOR SERVICE ═══════════════════════════════

  dbIt('step 2 — the customer files a service request at the workshop they chose', async () => {
    const created = await requests.create(ctxFor(userA, 'customer'), {
      organizationId: orgId,
      vehicleDescription: '2015 Toyota Corolla',
      registrationNumber: 'GR-4411-15',
      complaint: 'Knocking from the front right when going over a bump.',
    });
    requestId = created.id;

    expect(created.status).toBe('new');
    expect(created.organizationId).toBe(orgId);
    expect(created.complaint).toContain('Knocking');
  });

  dbIt('step 2 — `requested_by` is the CUSTOMER, and the row really is in reception.service_requests', async () => {
    const rows = await asApp<{ requested_by: string; organization_id: string; status: string }>(
      ctxFor(userA, 'customer'),
      `SELECT requested_by, organization_id, status
         FROM reception.service_requests WHERE id = $1`,
      [requestId],
    );
    expect(rows).toHaveLength(1);
    // The author is never taken from the body — `CreateServiceRequestBody` is
    // `.strict()` and has no author field at all, so there is nothing to forget
    // to ignore. This asserts the service honoured that.
    expect(rows[0]!.requested_by).toBe(userA);
    expect(rows[0]!.organization_id).toBe(orgId);
    expect(rows[0]!.status).toBe('new');
  });

  dbIt('step 2 — the AI agent RECEIVED the request (owner: "AI agent must receive the request")', async () => {
    // Fire-and-forget by design: the proposal is an opinion and must not share a
    // failure mode with the customer's POST. What is asserted is that the agent
    // was handed the request AND the customer's own words.
    expect(triageCalls.map((t) => t.requestId)).toContain(requestId);
    expect(triageCalls.find((t) => t.requestId === requestId)!.complaint).toContain('Knocking');
  });

  // ══ STEP 3 — RECEPTION IS TOLD, IN THE SAME TRANSACTION ══════════════════

  dbIt('step 3 — reception and the workshop owner were both notified', async () => {
    // Read through `listMine`, which RLS pins to the signed-in person. Reading
    // the table as the owner connection would prove rows exist and prove nothing
    // about who can reach them.
    for (const [userId, role] of [
      [receptionUserId, 'reception_staff'],
      [ownerUserId, 'workshop_owner'],
    ] as const) {
      const mine = await notifications.listMine(ctxFor(userId, role));
      const forThis = mine.filter((n) => n.resource_id === requestId);
      expect(forThis.length, `${role} was not told about the intake`).toBeGreaterThan(0);
      expect(forThis[0]!.event_key).toBe('service_request.created');
    }
  });

  dbIt('step 3 — BOTH channels were queued for each staff recipient', async () => {
    // `comms.notify_workshop_staff` writes an `in_app` row AND an `email` row per
    // recipient. `listMine` shows only `in_app`, so the email half is invisible
    // there — and an email that was never enqueued is exactly the shape of "the
    // emailing system dont work". Counted under the recipient's own context, so
    // RLS is doing the scoping.
    const rows = await asApp<{ channel: string; status: string }>(
      ctxFor(receptionUserId, 'reception_staff'),
      `SELECT channel, status FROM comms.notifications
        WHERE resource_id = $1 ORDER BY channel`,
      [requestId],
    );
    expect(rows.map((r) => r.channel)).toEqual(['email', 'in_app']);
    // An in-app notification has no transport, so it is DELIVERED the moment it
    // is written and must not sit in the drain's backlog for ever.
    expect(rows.find((r) => r.channel === 'in_app')!.status).toBe('sent');
    expect(rows.find((r) => r.channel === 'email')!.status).toBe('pending');
  });

  dbIt('step 3 — NOBODY told the customer about their own request', async () => {
    // 🔴 `customer` IS A REAL MEMBERSHIP ROLE IN THE WORKSHOP'S OWN ORGANISATION
    // — the fact behind every ungated-read defect in this codebase. An
    // "everybody in the org" recipient query would email the workshop's intake
    // back to the customers who filed it.
    const mine = await notifications.listMine(ctxFor(userA, 'customer'));
    expect(mine.filter((n) => n.resource_id === requestId)).toHaveLength(0);
  });

  dbIt('step 3 — and the technician was not told either', async () => {
    // Migration 060 lists exactly three roles. A technician hearing about every
    // walk-in enquiry is noise, not a feature.
    const mine = await notifications.listMine(ctxFor(technicianUserId, 'technician'));
    expect(mine.filter((n) => n.resource_id === requestId)).toHaveLength(0);
  });

  // ══ STEP 4 — RECEPTION SEES IT ═══════════════════════════════════════════

  dbIt('step 4 — reception finds it in the workshop inbox', async () => {
    const inbox = await requests.listForWorkshop(ctxFor(receptionUserId, 'reception_staff'), 'new');
    expect(inbox.map((r) => r.id)).toContain(requestId);
  });

  dbIt('step 4 — a CUSTOMER is REFUSED that same inbox', async () => {
    // An organisation predicate alone would hand a customer every other
    // customer's request, because a customer holds a real membership in this
    // organisation. That is the 45-screen leak one layer down.
    await expect(requests.listForWorkshop(ctxFor(userA, 'customer'))).rejects.toThrow(
      /customer cannot read a workshop inbox/i,
    );
  });

  dbIt('step 4 — the customer CAN still see their own request (the refusal is not a wall)', async () => {
    // A rule whose escape hatch does not exist is a wall, and walls are the most
    // expensive defect class recorded in this repository.
    const mine = await requests.listMine(ctxFor(userA, 'customer'));
    expect(mine.map((r) => r.id)).toContain(requestId);
  });

  // ══ STEP 5 — ACCEPT, REGISTER THE CAR, CONVERT ═══════════════════════════

  dbIt('step 5 — reception accepts the request', async () => {
    const decided = await requests.decide(ctxFor(receptionUserId, 'reception_staff'), requestId, {
      status: 'accepted',
    });
    expect(decided.status).toBe('accepted');
    expect(decided.decidedAt).not.toBeNull();
  });

  dbIt('step 5 — and NOW the customer is told, because the decision is theirs to hear', async () => {
    const mine = await notifications.listMine(ctxFor(userA, 'customer'));
    const decided = mine.filter(
      (n) => n.resource_id === requestId && n.event_key === 'service_request.decided',
    );
    expect(decided.length).toBeGreaterThan(0);
    expect(decided[0]!.subject).toMatch(/accepted/i);
  });

  dbIt('step 5 — reception registers the car the customer described', async () => {
    // ⚠️ NOT AUTOMATION THAT WAS SKIPPED — a limit `ConvertServiceRequestBody`
    // states deliberately. The customer typed "2015 Toyota Corolla" as free text
    // at a workshop that has never seen the car; `VehicleService.create` needs a
    // structured `makeId`, and guessing a make from prose would file wrong
    // vehicle records under a real person's name. Reception names the vehicle.
    const v = await vehicles.create(ctxFor(receptionUserId, 'reception_staff'), {
      customerId: customerA,
      registrationNumber: 'GR-4411-15',
      makeId,
      modelYear: 2015,
    });
    vehicleA = v.id;
    expect(vehicleA).toBeTruthy();
  });

  dbIt('step 5 — reception converts the accepted request into a job card', async () => {
    const out = await requests.convert(ctxFor(receptionUserId, 'reception_staff'), requestId, {
      vehicleId: vehicleA,
      priority: 'high',
    });
    jobCardId = out.jobCardId;
    jobNumber = out.jobNumber;
    expect(jobCardId).toBeTruthy();
    expect(jobNumber).toBeTruthy();
    expect(out.requestId).toBe(requestId);
  });

  dbIt('step 5 — the request is `converted` and LINKED to the card it produced', async () => {
    const rows = await asApp<{ status: string; converted_job_card_id: string }>(
      ctxFor(receptionUserId, 'reception_staff'),
      `SELECT status, converted_job_card_id FROM reception.service_requests WHERE id = $1`,
      [requestId],
    );
    expect(rows[0]!.status).toBe('converted');
    // `ck_service_request_converted` makes this pair inseparable, but the
    // constraint proves the row is well-formed, not that `convert` linked the
    // card it actually opened.
    expect(rows[0]!.converted_job_card_id).toBe(jobCardId);
  });

  dbIt('step 5 — the job card carries the customer’s OWN words, not reception’s', async () => {
    const card = await jobCards.findById(ctxFor(receptionUserId, 'reception_staff'), jobCardId);
    expect(card.complaint).toContain('Knocking from the front right');
    expect(card.jobNumber).toBe(jobNumber);
    expect(card.customerId).toBe(customerA);
    expect(card.vehicleId).toBe(vehicleA);
    // The lifecycle starts where `1.txt` §322 says it does.
    expect(card.stage).toBe('complaint_received');
  });

  // ══ STEP 6 — ASSIGNING A TECHNICIAN ══════════════════════════════════════
  //
  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 THE GAP THIS FILE FOUND, AND WHAT CLOSED IT.
  //
  // Owner: "setup the customer request in the workshop and ASSIGN TECHNICIANS
  // get job started." When this spec was first written, the second half of that
  // sentence had no implementation:
  //
  //   · `ConvertServiceRequestBody` was `.strict()` with exactly two fields,
  //     `vehicleId` and `priority`, so the HTTP layer could not carry a
  //     technician at all;
  //   · `convert()` called `jobCards.create(ctx, { vehicleId, complaint,
  //     priority })` and silently dropped the optional `assignedTechnicianId`
  //     that `JobCardService.create` has always accepted and validated;
  //   · and `repair.job_cards.assigned_technician_id` has exactly ONE writer in
  //     the whole API — the INSERT in `JobCardService.create`. Grepped, not
  //     assumed: no UPDATE sets it and there is no assign or reassign route.
  //     (`RepairPlanService.addTask`'s `assignedTechnicianId` is a different
  //     column on a different table, much later in the lifecycle.)
  //
  // The three facts compose into the real defect: a card that opened unassigned
  // could NEVER be assigned afterwards, so every job born from a customer's
  // request was permanently unassignable and appeared on no technician's "My
  // Assigned Work". The triage agent meanwhile proposes a technician, and its
  // own header cited `convert → JobCardService.create({ assignedTechnicianId })`
  // as the place a receptionist would act on that proposal — a call that did not
  // exist. A confident comment describing a rule the code does not implement is
  // the failure this repository has recorded five times, and it is why the gap
  // was invisible: the comment stops the next reader from checking.
  //
  // ⚠️ IT WAS CLOSED WHILE THIS SPEC WAS BEING WRITTEN — the field was added to
  // `ConvertServiceRequestBody` and passed through in `convert()`. The tests
  // below are therefore the POSITIVE proof rather than a record of the gap, and
  // they deliberately cover the failure path the fix introduces: a bad
  // technician id now throws from INSIDE `convert`, AFTER the request has been
  // claimed `accepted -> converting`. If the claim were not released the request
  // would strand in `converting`, which no screen offers a way out of — trading
  // a missing feature for a stuck one. That release is asserted, not assumed.
  // ══════════════════════════════════════════════════════════════════════════

  dbIt('step 6 — a conversion that names NO technician leaves the card unassigned', async () => {
    // Unassigned stays an expressible, valid state: reception often takes a car
    // in before deciding who works on it. This is the card from step 5, which
    // named nobody.
    const card = await jobCards.findById(ctxFor(receptionUserId, 'reception_staff'), jobCardId);
    expect(card.assignedTechnicianId).toBeNull();
    expect(card.assignedTechnicianName).toBeNull();
  });

  dbIt('step 6 — customer B files a request too, and reception accepts it', async () => {
    // B goes through the WHOLE chain rather than getting a job card handed to
    // them, so the assignment below is proved on the real path and step 7's wall
    // is built from two genuinely comparable customers.
    const created = await requests.create(ctxFor(userB, 'customer'), {
      organizationId: orgId,
      vehicleDescription: '2019 Toyota Hilux',
      registrationNumber: 'GT-9002-19',
      complaint: 'Air conditioning blows warm after twenty minutes.',
    });
    requestB = created.id;
    const decided = await requests.decide(
      ctxFor(receptionUserId, 'reception_staff'),
      requestB,
      { status: 'accepted' },
    );
    expect(decided.status).toBe('accepted');

    const v = await vehicles.create(ctxFor(receptionUserId, 'reception_staff'), {
      customerId: customerB,
      registrationNumber: 'GT-9002-19',
      makeId,
      modelYear: 2019,
    });
    vehicleB = v.id;
  });

  dbIt('step 6 — naming a NON-technician is refused AND the claim is released', async () => {
    // `userA` is an active member of this organisation — as a CUSTOMER.
    // Membership alone would let a card be given to a cashier or a customer,
    // where it appears on no technician's list and is simply never picked up.
    await expect(
      requests.convert(ctxFor(receptionUserId, 'reception_staff'), requestB, {
        vehicleId: vehicleB,
        assignedTechnicianId: userA,
      }),
    ).rejects.toThrow(/not an active technician/i);

    // 🔴 THE HALF THAT IS EASY TO GET WRONG. The refusal happens after the
    // `accepted -> converting` claim, so without the release in `convert`'s
    // catch the request would sit in `converting` for ever with no screen
    // offering a way out — a stuck request traded for a missing feature.
    const rows = await asApp<{ status: string }>(
      ctxFor(receptionUserId, 'reception_staff'),
      `SELECT status FROM reception.service_requests WHERE id = $1`,
      [requestB],
    );
    expect(
      rows[0]!.status,
      'the request is stranded — convert() claimed it and did not release the claim when the job card failed',
    ).toBe('accepted');
  });

  dbIt('step 6 — and converting WITH a real technician produces an ASSIGNED card', async () => {
    // The owner's sentence, end to end: request → accepted → job card → a named
    // technician, in one reception action.
    const out = await requests.convert(ctxFor(receptionUserId, 'reception_staff'), requestB, {
      vehicleId: vehicleB,
      assignedTechnicianId: technicianUserId,
    });
    cardOfB = out.jobCardId;

    const card = await jobCards.findById(ctxFor(receptionUserId, 'reception_staff'), cardOfB);
    expect(card.assignedTechnicianId).toBe(technicianUserId);
    expect(card.assignedTechnicianName).toBe('Tina Technician');
    expect(card.complaint).toContain('Air conditioning');
  });

  dbIt('step 6 — a customer may not assign a technician to their own job', async () => {
    // Assignment is the workshop's decision (`07.txt` pt2 §47 puts it under the
    // manager). Checked at the job-card layer, which is where every path —
    // conversion included — funnels through.
    await expect(
      jobCards.create(ctxFor(userA, 'customer'), {
        vehicleId: vehicleA,
        complaint: 'Customer trying to pick their own mechanic.',
        assignedTechnicianId: technicianUserId,
      }),
    ).rejects.toThrow(/may not assign a technician/i);
  });

  // ══ STEP 7 — THE CUSTOMER READS THEIR OWN WORK, AND ONLY THEIRS ══════════

  dbIt('🔴 step 6 — a card that opened UNASSIGNED can now be assigned afterwards', async () => {
    // ══════════════════════════════════════════════════════════════════════
    // Until `PATCH /job-cards/:id/assignment` existed,
    // `assigned_technician_id` was WRITE-ONCE. Grepped, not assumed: every
    // other reference to that column in the API is a READ, and its only writer
    // was the INSERT in `JobCardService.create`.
    //
    // So "Leave unassigned" — the DEFAULT, and a state the product deliberately
    // allows — was a ONE-WAY DOOR. The card from step 5 named nobody and could
    // never be given to anybody. A technician who left could never be replaced
    // either. Closing the conversion-time hole did not create a way to assign
    // LATER, which is most of what a workshop floor actually does.
    // ══════════════════════════════════════════════════════════════════════
    const before = await jobCards.findById(ctxFor(receptionUserId, 'reception_staff'), jobCardId);
    expect(before.assignedTechnicianId, 'step 5 card should still be unassigned').toBeNull();

    const after = await jobCards.reassign(
      ctxFor(receptionUserId, 'reception_staff'),
      jobCardId,
      technicianUserId,
    );
    expect(after.assignedTechnicianId).toBe(technicianUserId);
    expect(after.assignedTechnicianName).toBe('Tina Technician');
  });

  dbIt('step 6 — and it can be handed back to the queue', async () => {
    // `null` is the UNASSIGN. A floor that can take a job but never hand it
    // back has half a control — the technician goes off sick and the card is
    // stuck on their name.
    const back = await jobCards.reassign(
      ctxFor(receptionUserId, 'reception_staff'),
      jobCardId,
      null,
    );
    expect(back.assignedTechnicianId).toBeNull();

    // ⚠️ AND IT IS LEFT UNASSIGNED, DELIBERATELY. Step 7 asserts the technician
    // sees the card assigned to them and NOT the one that is not — leaving this
    // card on their name would give them two and silently destroy that wall.
    // A fixture that quietly changes what a later test is measuring is the same
    // class of defect as a check that walks through its own gap.
  });

  dbIt('step 6 — reassigning to a NON-technician is refused', async () => {
    // The same check as `create`, from the same constant — because a card
    // assigned to a non-technician appears on NO technician's list and simply
    // never gets picked up. It fails silently, which is why one definition
    // matters more here than tidiness.
    await expect(
      jobCards.reassign(ctxFor(receptionUserId, 'reception_staff'), jobCardId, userA),
    ).rejects.toThrow(/not an active technician/i);
  });

  dbIt('step 6 — a customer may not reassign their own job', async () => {
    await expect(
      jobCards.reassign(ctxFor(userA, 'customer'), jobCardId, technicianUserId),
    ).rejects.toThrow(/customer may not assign/i);
  });

  dbIt('step 7 — customer A reads their OWN job card', async () => {
    const list = await jobCards.list(ctxFor(userA, 'customer'));
    expect(list.map((c) => c.id)).toContain(jobCardId);
    const one = await jobCards.findById(ctxFor(userA, 'customer'), jobCardId);
    expect(one.id).toBe(jobCardId);
    expect(one.jobNumber).toBe(jobNumber);
  });

  dbIt('step 7 — customer B sees B’s card and NOT A’s', async () => {
    // 🔴 RLS CANNOT DO THIS. Both customers sit in ONE organisation, so no
    // policy can separate them — the narrowing is the service's `c.user_id`
    // predicate, and this is the only thing that would notice it regressing.
    const list = await jobCards.list(ctxFor(userB, 'customer'));
    const ids = list.map((c) => c.id);
    expect(ids, 'customer B sees nothing at all — this assertion would pass vacuously').toContain(
      cardOfB,
    );
    expect(ids).not.toContain(jobCardId);
  });

  dbIt('step 7 — customer B cannot open A’s card by id either', async () => {
    // 404 rather than 403, deliberately: a different answer would make this
    // endpoint an existence oracle for cards the caller may not read.
    await expect(jobCards.findById(ctxFor(userB, 'customer'), jobCardId)).rejects.toThrow(
      /not found/i,
    );
  });

  dbIt('step 7 — the technician sees the card assigned to them and not the one that is not', async () => {
    // The other half of step 6's assignment: `assigned_technician_id` is not a
    // label, it is what scopes a technician's whole workspace.
    const list = await jobCards.list(ctxFor(technicianUserId, 'technician'));
    const ids = list.map((c) => c.id);
    expect(ids, 'the technician cannot see the card they were assigned').toContain(cardOfB);
    // Step 5's card named nobody, so it must NOT be on this technician's list —
    // "My Assigned Work" is scoped by `assigned_technician_id` and an unassigned
    // card belongs on no technician's screen.
    expect(ids).not.toContain(jobCardId);
  });

  dbIt('step 7 — and reception still sees every card in the workshop', async () => {
    // A refusal that also refuses the people who need the data is not a fix, it
    // is an outage.
    const ids = (await jobCards.list(ctxFor(receptionUserId, 'reception_staff'))).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([jobCardId, cardOfB]));
  });
});
