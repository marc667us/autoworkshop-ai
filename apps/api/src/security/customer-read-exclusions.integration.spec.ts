import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

/**
 * THE TABLES A CUSTOMER MUST NOT READ, CHECKED AGAINST THE LIVE CATALOG.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY A REGISTRY AND NOT A PER-TABLE TEST.
 *
 * The same defect has now shipped four times, in four separate migrations, for
 * the same reason each time: a SELECT policy was written when every membership
 * in a workshop's organisation belonged to a colleague, and migration 061 made
 * `customer` a SELF-SERVICE role, so "member of this organisation" stopped
 * meaning "member of staff".
 *
 *   · 059 → `supplier_requests`: the clause was on INSERT and UPDATE, NOT SELECT
 *     (fixed by 062)
 *   · 045 → `service_categories`, `opening_hours`: no role clause at all
 *     (fixed by 066)
 *   · 045 → the other five settings tables: same (fixed by 067)
 *
 * Every one was found by a human reading policies one at a time. This file is
 * the machine that reads them, so the FIFTH instance fails a test instead of
 * waiting for somebody to look. Adding a table to the list below is how a new
 * staff-only table joins the check.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT ASSERTS THE POLICY TEXT, NOT A QUERY RESULT, and that is a deliberate
 * limitation worth naming. A policy carrying the clause could still be wrong in
 * some other way; what this catches is the ONE failure mode that has actually
 * happened repeatedly — the clause going missing. The behavioural proof lives
 * in `crm/leads.integration.spec.ts` and in each migration's own rehearsal.
 *
 * ⚠️ NO DATABASE IS A SKIP, NOT A PASS. Three states, never two — and
 * `reachable` is not asserted, because that turned `Release` red on 2026-08-08.
 */

const ADMIN_URL =
  process.env.DATABASE_URL_ADMIN ??
  'postgresql://autoworkshop:change_me_locally@localhost:5432/autoworkshop';

/**
 * Every table whose SELECT policy must refuse a customer, with the migration
 * that owns the decision. A table here is one where "belongs to this
 * organisation" is NOT sufficient to read.
 */
const MUST_EXCLUDE_CUSTOMER: ReadonlyArray<{ schema: string; table: string; policy: string; why: string }> = [
  { schema: 'core', table: 'approval_limits', policy: 'org_select', why: '067 — what each role may approve' },
  { schema: 'core', table: 'document_templates', policy: 'org_select', why: '067 — unsent letter drafts' },
  { schema: 'core', table: 'notification_preferences', policy: 'org_select', why: '067 — who is told what' },
  { schema: 'core', table: 'workflow_rules', policy: 'org_select', why: '067 — internal automation' },
  { schema: 'core', table: 'integrations', policy: 'org_select', why: '067 — provider list and errors' },
  { schema: 'core', table: 'service_categories', policy: 'org_select', why: '066 — draft catalogue with prices' },
  { schema: 'core', table: 'opening_hours', policy: 'org_select', why: '066 — unpublished rota' },
  { schema: 'crm', table: 'leads', policy: 'lead_select', why: '064 — the sales pipeline' },
];

let pool: Pool | null = null;
let client: PoolClient | null = null;
let reachable = false;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: ADMIN_URL, max: 1, connectionTimeoutMillis: 4000 });
    client = await pool.connect();
    reachable = true;
  } catch {
    await pool?.end().catch(() => undefined);
    pool = null;
    console.warn(
      '[customer-read-exclusions] NO DATABASE at ADMIN_URL — this suite is SKIPPED, ' +
        'not passed. Whether the staff-only tables still refuse a customer in RLS is ' +
        'NOT proven by this run.',
    );
  }
});

afterAll(async () => {
  client?.release();
  await pool?.end().catch(() => undefined);
});

/** Skips INSIDE the body — `runIf` is evaluated before `beforeAll` and is always false. */
const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

describe('tables a customer must not read', () => {
  for (const t of MUST_EXCLUDE_CUSTOMER) {
    dbIt(`${t.schema}.${t.table}.${t.policy} refuses a customer (${t.why})`, async () => {
      const res = await client!.query<{ qual: string | null }>(
        `SELECT qual FROM pg_policies
          WHERE schemaname = $1 AND tablename = $2 AND policyname = $3`,
        [t.schema, t.table, t.policy],
      );
      // A missing policy is a failure, not a skip. `toHaveLength(1)` rather than
      // reading `rows[0]?.qual` — an absent policy read through `?.` would
      // produce `undefined`, and `expect(undefined).not.toContain` throws a
      // confusing type error instead of saying the policy is gone.
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]!.qual ?? '').toContain(`<> 'customer'`);
    });
  }

  dbIt('the registry itself is not empty — an empty loop proves nothing', async () => {
    expect(MUST_EXCLUDE_CUSTOMER.length).toBeGreaterThanOrEqual(8);
  });
});
