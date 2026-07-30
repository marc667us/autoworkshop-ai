import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TestingService } from './testing.service';
import {
  CAN_APPROVE_CRITICAL_OVERRIDE,
  CAN_READ_TESTS,
  CAN_RECORD_TESTS,
  ROAD_TEST_OUTCOMES,
  TEST_CATEGORIES,
  TEST_OUTCOMES,
  TEST_SESSION_STATUSES,
  roadTestOutcomeLabel,
  testCategoryLabel,
} from './testing-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Post-repair testing — Phase 5, slice 8.
 *
 * UNIT tests over a fake client. §35's rule is enforced in THREE places — the service,
 * a CHECK constraint, and a narrower role set — and this file covers the first and the
 * third. `verify/probe-testing.mjs` proves the constraint against real Postgres.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const SESSION_ID = 'eeeeeeee-ffff-0000-1111-222222222222';
const EXEC_ID = 'dddddddd-eeee-ffff-0000-111111111111';
const RESULT_ID = '41414141-5252-6363-7474-858585858585';

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'technician',
  correlationId: 'corr-1',
  ...over,
});

const cardRow = (over: Record<string, unknown> = {}) => ({
  id: CARD_ID, job_number: 'JC-000003', stage: 'testing', ...over,
});

const openRow = (over: Record<string, unknown> = {}) => ({
  id: SESSION_ID, status: 'in_progress', attempt_no: 1,
  execution_id: EXEC_ID, job_number: 'JC-000003', ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  registration_number: 'GR 4821-22',
  execution_id: EXEC_ID,
  execution_attempt_no: 1,
  attempt_no: 1,
  status: 'in_progress',
  scan_performed: false,
  pre_repair_fault_codes: null,
  codes_cleared: null,
  codes_remaining: null,
  new_codes: null,
  live_data_checks: null,
  system_readiness: null,
  warning_light_status: null,
  critical_faults_remain: false,
  override_approved_at: null,
  override_reason: null,
  road_test_performed: false,
  road_test_driver: null,
  road_test_start_mileage: null,
  road_test_end_mileage: null,
  road_test_route: null,
  road_test_weather: null,
  road_test_road_condition: null,
  road_test_initial_symptom: null,
  road_test_outcome: null,
  road_test_notes: null,
  submitted_at: null,
  override_approved_by_name: null,
  submitted_by_name: null,
  ...over,
});

const resultRow = (over: Record<string, unknown> = {}) => ({
  id: RESULT_ID,
  session_id: SESSION_ID,
  position: 1,
  test_category: 'brake',
  test_name: 'Brake efficiency',
  test_procedure: null,
  test_equipment: null,
  equipment_identifier: null,
  calibration_status: null,
  expected_result: null,
  actual_result: null,
  unit_of_measurement: null,
  outcome: 'pass',
  evidence_id: null,
  comments: null,
  tested_at: new Date('2026-07-30T12:00:00Z'),
  tested_by_name: 'A. Technician',
  ...over,
});

const Q = {
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  open: /FOR UPDATE OF s/,
  header: /LEFT JOIN identity\.users sb ON sb\.id = s\.submitted_by/,
  results: /FROM repair\.repair_test_results r/,
  completedExec: /FROM repair\.repair_executions\s+WHERE job_card_id/,
  openCheck: /status = 'in_progress'\s+LIMIT 1/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  position: /COALESCE\(max\(position\)/,
  sessionInsert: /INSERT INTO repair\.repair_test_sessions/,
  sessionUpdate: /UPDATE repair\.repair_test_sessions/,
  resultInsert: /INSERT INTO repair\.repair_test_results/,
  resultDelete: /DELETE FROM repair\.repair_test_results/,
  evidenceOwns: /FROM repair\.execution_evidence/,
} as const;

function fakeDb(handlers: Array<[RegExp, unknown[]]>) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      const hit = handlers.find(([re]) => re.test(text));
      const rows = hit ? hit[1] : [];
      return { rows, rowCount: rows.length };
    }),
  };
  return {
    queries,
    db: {
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) => work(client)),
    } as never,
  };
}
const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;
const spyAudit = () => ({
  write: vi.fn(
    async (
      _c: unknown,
      _x: TenantContext,
      _e: { action: string; detail?: Record<string, unknown> },
    ) => undefined,
  ),
});

const readHandlers = (over: { header?: unknown[]; results?: unknown[] } = {}): Array<[RegExp, unknown[]]> => [
  [Q.header, over.header ?? [headerRow()]],
  [Q.results, over.results ?? []],
];

function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected one row, received ${rows.length}`);
  return first;
}

// ── roles ──────────────────────────────────────────────────────────────────

describe('testing roles — §50 and §563', () => {
  it('⚠️ excludes the QC inspector from RECORDING, which is what makes slice 9 independent', async () => {
    // An inspector who could write the test results would be inspecting their own
    // evidence. They READ this record — that is the whole of their involvement here.
    expect(CAN_RECORD_TESTS.has('quality_control_inspector')).toBe(false);
    expect(CAN_READ_TESTS.has('quality_control_inspector')).toBe(true);
    const { db } = fakeDb([]);
    await expect(
      new TestingService(db, fakeAudit()).start(ctx({ activeRole: 'quality_control_inspector' }), CARD_ID),
    ).rejects.toThrow(/may not record test results/);
  });

  it('⚠️ holds the §35 override to a NARROWER set than testing', async () => {
    // An approval the technician can give themselves is not an approval.
    expect(CAN_RECORD_TESTS.has('technician')).toBe(true);
    expect(CAN_APPROVE_CRITICAL_OVERRIDE.has('technician')).toBe(false);
    const { db } = fakeDb([]);
    await expect(
      new TestingService(db, fakeAudit()).approveCriticalOverride(ctx(), SESSION_ID, { reason: 'x' }),
    ).rejects.toThrow(/may not approve releasing a vehicle/);
  });

  it('narrows a technician to their own assigned cards', async () => {
    const { db, queries } = fakeDb(readHandlers());
    await new TestingService(db, fakeAudit()).list(ctx({ userId: 't9' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
  });
});

// ── starting ───────────────────────────────────────────────────────────────

describe('start — §34 follows a completed repair', () => {
  it('refuses when no repair has been completed, naming a reachable route', async () => {
    const { db } = fakeDb([[Q.card, [cardRow()]], [Q.completedExec, []]]);
    await expect(new TestingService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /COMPLETED repair.*Repairs in Progress/s,
    );
  });

  it('refuses a second session while one is open', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.completedExec, [{ id: EXEC_ID, attempt_no: 1 }]],
      [Q.openCheck, [{ id: SESSION_ID }]],
    ]);
    await expect(new TestingService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /already has a test session in progress/,
    );
  });
});

// ── §34's results ──────────────────────────────────────────────────────────

describe('results — §34', () => {
  it('⚠️ refuses a failure that says nothing', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    // A bare "fail" cannot be acted on by the inspector who reads it next.
    await expect(
      new TestingService(db, fakeAudit()).recordResult(ctx(), SESSION_ID, {
        testCategory: 'brake', testName: 'Brake efficiency', outcome: 'fail',
      }),
    ).rejects.toThrow(/cannot act on/);
  });

  it('accepts a failure explained by a comment alone', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      [Q.position, [{ n: 1 }]],
      [Q.resultInsert, []],
      ...readHandlers(),
    ]);
    // Either an actual result OR a comment satisfies it — a technician who writes "the
    // gauge would not zero" has explained the failure without a number.
    await expect(
      new TestingService(db, fakeAudit()).recordResult(ctx(), SESSION_ID, {
        testCategory: 'brake', testName: 'x', outcome: 'fail', comments: 'gauge would not zero',
      }),
    ).resolves.toBeTruthy();
  });

  it('refuses a category outside §34s eighteen, and an outcome outside pass/fail', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    const service = new TestingService(db, fakeAudit());
    await expect(
      service.recordResult(ctx(), SESSION_ID, { testCategory: 'vibes', testName: 'x', outcome: 'pass' }),
    ).rejects.toThrow(/testCategory must be one of/);
    await expect(
      service.recordResult(ctx(), SESSION_ID, { testCategory: 'brake', testName: 'x', outcome: 'inconclusive' }),
    ).rejects.toThrow(/outcome must be one of/);
  });

  it('refuses evidence that belongs to another repair', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]], [Q.evidenceOwns, []]]);
    // A photograph of another car proves nothing about this one, and the composite FK
    // checks the tenant — which is not the same question.
    await expect(
      new TestingService(db, fakeAudit()).recordResult(ctx(), SESSION_ID, {
        testCategory: 'photo' in {} ? 'brake' : 'brake',
        testName: 'x',
        outcome: 'pass',
        evidenceId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toThrow(/not on the repair being tested/);
  });

  it('counts passes and failures separately', async () => {
    const { db } = fakeDb(
      readHandlers({ results: [resultRow(), resultRow({ id: 'b', position: 2, outcome: 'fail' })] }),
    );
    const s = only(await new TestingService(db, fakeAudit()).list(ctx()));
    expect(s.passCount).toBe(1);
    expect(s.failCount).toBe(1);
  });

  it('refuses every write once the session is with quality control', async () => {
    const { db } = fakeDb([[Q.open, [openRow({ status: 'submitted' })]]]);
    await expect(
      new TestingService(db, fakeAudit()).recordResult(ctx(), SESSION_ID, {
        testCategory: 'brake', testName: 'x', outcome: 'pass',
      }),
    ).rejects.toThrow(/submitted for quality control/);
  });
});

// ── §36's road test ────────────────────────────────────────────────────────

describe('road test — §36', () => {
  it('refuses an end mileage below the start', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    await expect(
      new TestingService(db, fakeAudit()).recordRoadTest(ctx(), SESSION_ID, {
        roadTestPerformed: true, roadTestStartMileage: 50000, roadTestEndMileage: 49990,
      }),
    ).rejects.toThrow(/lower than the start mileage/);
  });

  it('derives the distance from the odometer pair', async () => {
    const { db } = fakeDb(
      readHandlers({
        header: [headerRow({ road_test_performed: true, road_test_start_mileage: 50000, road_test_end_mileage: 50012 })],
      }),
    );
    const s = only(await new TestingService(db, fakeAudit()).list(ctx()));
    // The pair is what proves the car actually moved.
    expect(s.roadTestDistance).toBe(12);
  });

  it('keeps "improved" as its own outcome', () => {
    // A boolean would lose it, and it is the honest answer more often than either
    // extreme — recording a quieter noise as "resolved" is how a car comes back.
    expect(ROAD_TEST_OUTCOMES).toContain('symptom_improved');
    expect(roadTestOutcomeLabel('symptom_improved')).not.toBe('symptom_improved');
  });
});

// ── §35 — the rule of this slice ───────────────────────────────────────────

describe('§35 — no technical completion with a critical fault, without documented approval', () => {
  it('refuses submission while a critical fault is unapproved, naming the section', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({
        header: [headerRow({ critical_faults_remain: true })],
        results: [resultRow()],
      }),
    ]);
    await expect(new TestingService(db, fakeAudit()).submit(ctx(), SESSION_ID)).rejects.toThrow(
      /§35.*cannot approve your own/s,
    );
  });

  it('allows submission once somebody accountable is named', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({
        header: [headerRow({ critical_faults_remain: true, override_approved_by_name: 'A. Supervisor' })],
        results: [resultRow()],
      }),
      [Q.sessionUpdate, []],
    ]);
    // §35 forbids completing WITHOUT A DOCUMENT, not completing at all — a car whose
    // ABS light is on can legitimately go back to a customer who has been told.
    await expect(new TestingService(db, fakeAudit()).submit(ctx(), SESSION_ID)).resolves.toBeTruthy();
  });

  it('refuses an override nobody needs, so the audit list stays meaningful', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({ header: [headerRow({ critical_faults_remain: false })] }),
    ]);
    // A safety audit reads the override list expecting every row to be a real decision.
    await expect(
      new TestingService(db, fakeAudit()).approveCriticalOverride(
        ctx({ activeRole: 'workshop_supervisor' }), SESSION_ID, { reason: 'just in case' },
      ),
    ).rejects.toThrow(/nothing to approve/);
  });

  it('records the approval as its own audit event', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({ header: [headerRow({ critical_faults_remain: true })] }),
      [Q.sessionUpdate, []],
    ]);
    await new TestingService(db, audit as never).approveCriticalOverride(
      ctx({ activeRole: 'workshop_supervisor' }), SESSION_ID, { reason: 'customer informed' },
    );
    // The one audit entry a safety investigation looks for.
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('repair_test.critical_override_approved');
  });
});

// ── submission ─────────────────────────────────────────────────────────────

describe('submit', () => {
  it('refuses a session with no results at all', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]], ...readHandlers({ results: [] })]);
    // The vacuous-truth hole slice 3a shipped, guarded here as in every slice since.
    await expect(new TestingService(db, fakeAudit()).submit(ctx(), SESSION_ID)).rejects.toThrow(
      /no results recorded/,
    );
  });

  it('refuses half a road test, and names what is missing', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({
        header: [headerRow({ road_test_performed: true, road_test_driver: 'A. Tech', road_test_start_mileage: 50000 })],
        results: [resultRow()],
      }),
    ]);
    await expect(new TestingService(db, fakeAudit()).submit(ctx(), SESSION_ID)).rejects.toThrow(
      /the end mileage/,
    );
  });

  it('does NOT refuse a session whose tests failed', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({ results: [resultRow({ outcome: 'fail', actual_result: '48%' })] }),
      [Q.sessionUpdate, []],
    ]);
    // A failed test is a RESULT, and quality control is who decides what to do about it.
    // Refusing here would push a technician into recording a pass.
    await expect(new TestingService(db, fakeAudit()).submit(ctx(), SESSION_ID)).resolves.toBeTruthy();
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('testing-rules matches what migration 020 applied', () => {
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    expect(sqlPath, `could not locate ${name}`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }
  const SQL = () => migration('020_repair_testing.sql');

  /**
   * The quoted literals of a column's `CHECK ... IN (...)` list.
   *
   * ⚠️ THE COLUMN NAME IS ANCHORED WITH A LOOKBEHIND, and it has to be: `outcome`
   * appears inside `road_test_outcome`, which 020 declares EARLIER — so the unanchored
   * regex every other slice uses read the four road-test outcomes and reported that the
   * pass/fail list had drifted. The harness matching a longer name that merely ENDS with
   * the one asked for, one more time.
   */
  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`(?<![a-z_])${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the two session statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...TEST_SESSION_STATUSES].sort());
  });

  it('carries exactly §34s EIGHTEEN categories, and labels each', () => {
    expect(TEST_CATEGORIES).toHaveLength(18);
    expect(checkValues(SQL(), 'test_category')).toEqual([...TEST_CATEGORIES].sort());
    for (const c of TEST_CATEGORIES) {
      expect({ c, label: testCategoryLabel(c) }).not.toEqual({ c, label: c });
    }
  });

  it('carries exactly pass and fail — §34 says "pass or fail"', () => {
    expect(checkValues(SQL(), 'outcome')).toEqual([...TEST_OUTCOMES].sort());
  });

  it('carries exactly §36s four road-test outcomes', () => {
    expect(checkValues(SQL(), 'road_test_outcome')).toEqual([...ROAD_TEST_OUTCOMES].sort());
  });

  it('⚠️ enforces §35 with a CHECK CONSTRAINT, not only in the service', () => {
    const sql = SQL();
    // The service gives a clean sentence; this is what holds when a later caller writes
    // the row directly. Both are required — "the application never does that" is the
    // reasoning this codebase rejected when it made §1294 structural.
    expect(sql).toMatch(/CONSTRAINT test_session_critical_fault_needs_approval CHECK/);
    expect(sql).toMatch(/override_approved_by IS NOT NULL/);
    expect(sql).toMatch(/override_reason IS NOT NULL/);
  });

  it('refuses a road test that came back with fewer miles', () => {
    expect(SQL()).toMatch(/CONSTRAINT test_session_mileage_increases CHECK/);
  });

  it('insists testing follows a COMPLETED repair', () => {
    const sql = SQL();
    expect(sql).toMatch(/assert_testing_follows_completed_repair/);
    expect(sql).toMatch(/rather than completed/);
  });

  it('grants DELETE on the results and withholds it on the session', () => {
    const sql = SQL();
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON repair\.repair_test_results/);
    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_test_sessions/);
  });

  it('FORCEs row-level security on both tables', () => {
    const sql = SQL();
    for (const t of ['repair_test_sessions', 'repair_test_results']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t}\\s+FORCE\\s+ROW LEVEL SECURITY`));
    }
  });
});
