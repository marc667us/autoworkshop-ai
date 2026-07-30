import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosisService } from './diagnosis.service';
import {
  AFFECTED_SYSTEMS,
  CAN_READ_DIAGNOSIS,
  CAN_RECORD_DIAGNOSIS,
  CAN_REVIEW_DIAGNOSIS,
  DIAGNOSIS_STATUSES,
  FINDING_SOURCES,
  FINDING_STATUSES,
  affectedSystemLabel,
} from './diagnosis-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Diagnosis records — Phase 5, slice 3b.
 *
 * UNIT tests over a fake client, the shape `inspection.spec.ts` established. They
 * assert what the database cannot: who may record a diagnosis, who may review one,
 * that a reviewer is not the submitter, that a diagnosis with no findings is
 * refused BEFORE a supervisor is asked to approve silence, and that the
 * confirmation signature moves with the status in BOTH directions.
 *
 * ⚠️ The triggers, the RLS and the DELETE grant are proven separately against real
 * Postgres by `infrastructure/migrations/verify/013_finding_removal.sql`, which
 * attempts real writes as `autoworkshop_app` and rolls back. A fake client cannot
 * enforce a constraint, so a test here passing proves nothing about the database —
 * and the reverse is equally true. Both are required.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const DIAGNOSIS_ID = '99999999-8888-7777-6666-555555555555';
const FINDING_ID = '44444444-3333-2222-1111-000000000000';
const TECH_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const OTHER_ID = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

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
  id: CARD_ID,
  job_number: 'JC-000003',
  stage: 'diagnosis_in_progress',
  ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: DIAGNOSIS_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  registration_number: 'GR 4821-22',
  attempt_no: 1,
  status: 'in_progress',
  summary: null,
  started_at: new Date('2026-07-30T09:00:00Z'),
  submitted_at: null,
  reviewed_at: null,
  review_note: null,
  submitted_by: null,
  started_by_name: 'A. Technician',
  submitted_by_name: null,
  reviewed_by_name: null,
  ...over,
});

/**
 * The SQL fragments that identify each query this service issues.
 *
 * ⚠️ EACH ONE MUST BE UNIQUE TO ITS QUERY, and the ORDER of this object matters
 * because `fakeDb` takes the FIRST regex that matches. `assertWritable`, the review
 * lookup and the header read all begin `FROM repair.diagnoses d JOIN
 * repair.job_cards j`, so a loose prefix would silently feed a row of the wrong
 * shape to two of the three — a harness reporting a service defect that does not
 * exist, which cost slice 3a real time. Anchored on the distinctive line of each
 * statement instead.
 */
const Q = {
  /** The scoped job-card lookup — the only one that joins `core.customers`. */
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  /** `review`'s lookup — the only one selecting `d.submitted_by` beside the lock. */
  reviewLookup: /d\.submitted_by, j\.job_number/,
  /** `assertWritable` — the only other statement that locks the diagnosis row. */
  writable: /FOR UPDATE OF d/,
  /** The header read — the only one joining `identity.users` three times. */
  header: /LEFT JOIN identity\.users rv/,
  findings: /FROM repair\.diagnostic_findings f/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  position: /COALESCE\(max\(position\)/,
  /**
   * `start`'s unsettled-attempt check.
   *
   * ⚠️ ANCHORED ON `status IN`, not on `SELECT id`. It used to select only `id`;
   * when the fix for Codex's HIGH finding added `status` to the projection, a regex
   * matching the old text stopped matching, the handler fell through to `[]`, and
   * the "refuses a second open diagnosis" test PASSED A NEW ATTEMPT instead of
   * refusing it. The regex has to name something the rule cannot be expressed
   * without.
   */
  openCheck: /status IN \('in_progress', 'submitted'\)/,
  headerInsert: /INSERT INTO repair\.diagnoses/,
  findingInsert: /INSERT INTO repair\.diagnostic_findings/,
  findingUpdate: /UPDATE repair\.diagnostic_findings/,
  findingDelete: /DELETE FROM repair\.diagnostic_findings/,
  /**
   * ⚠️ `statusCounts` MUST BE MATCHED BEFORE `findingCount`. Both select from
   * `diagnostic_findings` with a `count(*)::int`; only the breakdown carries
   * `GROUP BY`. Listing the loose regex first would feed the total to the
   * breakdown and vice versa — the same collision slice 3a's harness paid for.
   */
  statusCounts: /GROUP BY finding_status/,
  /** The "does this diagnosis say anything at all" gate. */
  findingCount: /count\(\*\)::int/,
  headerUpdate: /UPDATE repair\.diagnoses/,
} as const;

/**
 * Routes each query to a canned result by matching its SQL.
 *
 * Matching on text rather than call order, because the service's internals are
 * allowed to change: a test that asserts "the third query" breaks when a lock is
 * added and tells you nothing about the rule it was supposed to protect.
 */
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
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work(client),
      ),
    } as never,
  };
}

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

/**
 * An audit spy whose PARAMETERS are typed, so a test can read back what was
 * recorded. `vi.fn(async () => undefined)` gives an empty argument tuple, and
 * indexing it is a compile error rather than a runtime surprise.
 */
const spyAudit = () => ({
  write: vi.fn(
    async (
      _client: unknown,
      _ctx: TenantContext,
      _event: { action: string; detail?: Record<string, unknown> },
    ) => undefined,
  ),
});

/**
 * The single record a read returned.
 *
 * `noUncheckedIndexedAccess` makes `rows[0]` possibly undefined, and a `!` here
 * would turn a genuinely empty result into "cannot read properties of undefined"
 * three lines later. This fails with the reason instead.
 */
function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected exactly one row, received ${rows.length}`);
  return first;
}

const openRow = (over: Record<string, unknown> = {}) => ({
  id: DIAGNOSIS_ID,
  status: 'in_progress',
  attempt_no: 1,
  job_number: 'JC-000003',
  ...over,
});

/** A finding row as the read query returns it. */
const findingRow = (over: Record<string, unknown> = {}) => ({
  id: FINDING_ID,
  diagnosis_id: DIAGNOSIS_ID,
  position: 1,
  fault_code: 'P0301',
  fault_description: 'Cylinder 1 misfire',
  affected_system: 'electrical',
  observed_symptom: 'Rough idle',
  test_performed: 'Coil primary resistance',
  expected_result: '0.4-0.6 ohm',
  actual_result: 'open circuit',
  interpretation: 'Coil pack failed open',
  finding_status: 'suspected',
  source: 'technician',
  confirmed_at: null,
  confirmed_by_name: null,
  additional_inspection_required: false,
  recorded_at: new Date('2026-07-30T10:00:00Z'),
  recorded_by_name: 'A. Technician',
  ...over,
});

/** The handler set for a healthy in-progress diagnosis on a visible card. */
const openDiagnosis = (
  over: {
    card?: Record<string, unknown>;
    header?: Record<string, unknown>;
    findings?: unknown[];
  } = {},
) =>
  [
    [Q.card, [cardRow(over.card)]],
    [Q.reviewLookup, [openRow()]],
    [Q.writable, [openRow()]],
    [Q.attempt, [{ n: 1 }]],
    [Q.position, [{ n: 0 }]],
    // No diagnosis already in progress — `start`'s conflict check.
    [Q.openCheck, []],
    [Q.headerInsert, [{ id: DIAGNOSIS_ID }]],
    // rowCount 1: the finding row exists, as it does after `addFinding`. The
    // zero-row case has its own test — it must not be the default, or every write
    // test would silently be asserting a failure path.
    [Q.findingUpdate, [{ ok: true }]],
    [Q.findingDelete, [{ ok: true }]],
    [Q.statusCounts, [{ finding_status: 'confirmed', n: 1 }]],
    // At least one finding, so `submit`'s completeness gate passes by default and
    // the zero case is asserted deliberately rather than by accident.
    [Q.findingCount, [{ n: 1 }]],
    [Q.header, [headerRow(over.header)]],
    [Q.findings, over.findings ?? []],
  ] as Array<[RegExp, unknown[]]>;

// ── who may do what ────────────────────────────────────────────────────────

describe('who may record a diagnosis — 07 pt2 §50', () => {
  it('refuses RECEPTION, who takes the complaint but does not diagnose', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx({ activeRole: 'reception_staff' }), CARD_ID)).rejects.toThrow(
      /may not record a diagnosis/,
    );
  });

  it('refuses the QUALITY-CONTROL INSPECTOR, who must stay independent', async () => {
    // `2.txt` §563 — the post-repair check must be independent of the work. A QC
    // inspector who wrote the diagnosis would later be checking their own reasoning.
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.start(ctx({ activeRole: 'quality_control_inspector' }), CARD_ID),
    ).rejects.toThrow(/may not record a diagnosis/);
  });

  it('refuses the CUSTOMER even from the read path', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.findById(ctx({ activeRole: 'customer' }), DIAGNOSIS_ID)).rejects.toThrow(
      /may not read diagnoses/,
    );
  });

  it('lets the STOREKEEPER read but never record', async () => {
    // They need the confirmed faults to order parts; they do not diagnose.
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    // Reads through, and the row it gets back is NOT editable — the storekeeper's
    // view is the confirmed faults, never a form.
    const seen = await svc.list(ctx({ activeRole: 'storekeeper' }));
    expect(only(seen).editable).toBe(false);
    await expect(
      svc.addFinding(ctx({ activeRole: 'storekeeper' }), DIAGNOSIS_ID, {
        faultDescription: 'x',
        affectedSystem: 'other',
      }),
    ).rejects.toThrow(/may not record a diagnosis/);
  });

  it('never lets a role record or review without also being able to read', () => {
    // A role that may write and not read could record a finding it can never see
    // again — the screen would show an empty sheet after a successful save.
    for (const role of [...CAN_RECORD_DIAGNOSIS, ...CAN_REVIEW_DIAGNOSIS]) {
      expect({ role, canRead: CAN_READ_DIAGNOSIS.has(role) }).toEqual({ role, canRead: true });
    }
  });
});

describe('§1292 supervisor review — who, and independence', () => {
  it('refuses a TECHNICIAN outright: §1292 asks for a SUPERVISOR review', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'technician' }), DIAGNOSIS_ID, { decision: 'approved' }),
    ).rejects.toThrow(/may not review a diagnosis/);
  });

  it('refuses the SUBMITTER even when their role may review — §563', async () => {
    // The narrower of the two rules. A supervisor who recorded the diagnosis
    // themselves holds the reviewing role and must still be refused, or the
    // independent check is one person agreeing with themselves.
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'submitted', submitted_by: TECH_ID })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_supervisor', userId: TECH_ID }), DIAGNOSIS_ID, {
        decision: 'approved',
      }),
    ).rejects.toThrow(/cannot also review it/);
  });

  it('allows a DIFFERENT supervisor to approve', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'submitted', submitted_by: TECH_ID })]],
      ...openDiagnosis({ header: { status: 'approved', submitted_by: TECH_ID } }),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    const result = await svc.review(
      ctx({ activeRole: 'workshop_supervisor', userId: OTHER_ID }),
      DIAGNOSIS_ID,
      { decision: 'approved' },
    );
    expect(result.status).toBe('approved');
  });

  it('refuses a rejection with no reason — a technician told only "rejected" cannot act', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'submitted', submitted_by: TECH_ID })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_manager', userId: OTHER_ID }), DIAGNOSIS_ID, {
        decision: 'rejected',
      }),
    ).rejects.toThrow(/must give a reason/);
  });

  it('accepts an approval with no note — "it is correct" adds nothing', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'submitted', submitted_by: TECH_ID })]],
      ...openDiagnosis({ header: { status: 'approved' } }),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_owner', userId: OTHER_ID }), DIAGNOSIS_ID, {
        decision: 'approved',
      }),
    ).resolves.toMatchObject({ status: 'approved' });
  });

  it('refuses to review a diagnosis that was never submitted', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'in_progress' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_supervisor', userId: OTHER_ID }), DIAGNOSIS_ID, {
        decision: 'approved',
      }),
    ).rejects.toThrow(/has not been submitted/);
  });

  it('refuses to review one that was already answered — a further opinion is a new attempt', async () => {
    // §1292's review happens once. Re-reviewing would overwrite the reviewer and
    // the reason, erasing the disagreement the record exists to keep.
    const { db } = fakeDb([
      [Q.reviewLookup, [openRow({ status: 'rejected', submitted_by: TECH_ID })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_supervisor', userId: OTHER_ID }), DIAGNOSIS_ID, {
        decision: 'approved',
      }),
    ).rejects.toThrow(/already rejected/);
  });

  it('answers 404 for a diagnosis outside the viewer, not 403', async () => {
    // The non-oracle rule: probing an id must not confirm it exists.
    const { db } = fakeDb([[Q.reviewLookup, []]]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.review(ctx({ activeRole: 'workshop_supervisor' }), DIAGNOSIS_ID, {
        decision: 'approved',
      }),
    ).rejects.toThrow(/diagnosis not found/);
  });
});

// ── starting ───────────────────────────────────────────────────────────────

describe('a diagnosis is only started once the car has been examined', () => {
  it('refuses a card that has not reached diagnosis', async () => {
    const { db } = fakeDb(openDiagnosis({ card: { stage: 'complaint_received' } }));
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(
      /only be started while the job card is at 'diagnosis_in_progress'/,
    );
  });

  it('names the stage the card is ACTUALLY at, so the message is actionable', async () => {
    const { db } = fakeDb(openDiagnosis({ card: { stage: 'vehicle_received' } }));
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/this card is at 'vehicle_received'/);
  });

  it('refuses a SECOND open diagnosis on the same card', async () => {
    const { db } = fakeDb([
      [Q.openCheck, [{ id: DIAGNOSIS_ID, status: 'in_progress' }]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/already has a diagnosis in progress/);
  });

  it('REFUSES A NEW ATTEMPT WHILE THE LAST ONE AWAITS REVIEW', async () => {
    // Codex HIGH, accepted. Allowing it bypassed §1292's review without deleting
    // anything: submit attempt 1, start attempt 2, and because every queue orders by
    // `attempt_no DESC` the in-progress attempt 2 becomes "the current record" while
    // the submitted attempt 1 stops being surfaced. The awaiting-review count falls
    // to zero with a diagnosis still unreviewed — worse than a lost row, because
    // nothing looks wrong.
    const { db } = fakeDb([
      [Q.openCheck, [{ id: DIAGNOSIS_ID, status: 'submitted' }]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/awaiting supervisor review/);
  });

  it('gives the two blocked cases DIFFERENT sentences', async () => {
    // The caller's next action is not the same — submit the open one, versus wait for
    // a supervisor — so one shared "already has a diagnosis" would leave a technician
    // pressing a button that cannot work.
    const { db } = fakeDb([
      [Q.openCheck, [{ id: DIAGNOSIS_ID, status: 'submitted' }]],
      ...openDiagnosis(),
    ]);
    await expect(new DiagnosisService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /approved or rejected/,
    );
  });

  it('ALLOWS a new attempt once the last one was settled', async () => {
    // The other half of the same rule — the queue's "Start a new diagnosis" button
    // exists for exactly this, and a refusal here would make the rejection reason
    // unactionable.
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).resolves.toMatchObject({ id: DIAGNOSIS_ID });
  });

  it('locks the job card while allocating the attempt number', async () => {
    // Two technicians pressing Start together would otherwise both read
    // "highest attempt = 1" and both write attempt 2.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.start(ctx(), CARD_ID);
    expect(queries.some((q) => /FOR UPDATE OF j/.test(q.text))).toBe(true);
  });

  it('answers 404 for a card the technician is not assigned to', async () => {
    const { db } = fakeDb([[Q.card, []]]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/job card not found/);
  });

  it('narrows the card lookup by technician id, and only for a technician', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.start(ctx({ activeRole: 'technician', userId: TECH_ID }), CARD_ID);
    const card = queries.find((q) => Q.card.test(q.text));
    expect(card?.values?.[3]).toBe(TECH_ID);

    const { db: db2, queries: q2 } = fakeDb(openDiagnosis());
    await new DiagnosisService(db2, fakeAudit()).start(
      ctx({ activeRole: 'workshop_manager', userId: TECH_ID }),
      CARD_ID,
    );
    expect(q2.find((q) => Q.card.test(q.text))?.values?.[3]).toBeNull();
  });
});

// ── findings ───────────────────────────────────────────────────────────────

describe('recording a finding — §3026-§3046', () => {
  it('requires a fault DESCRIPTION: a finding with none is not a finding', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.addFinding(ctx(), DIAGNOSIS_ID, { affectedSystem: 'electrical' }),
    ).rejects.toThrow(/faultDescription/);
  });

  it('requires an affected system from §9s vocabulary, not free text', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.addFinding(ctx(), DIAGNOSIS_ID, {
        faultDescription: 'Misfire',
        affectedSystem: 'gremlins',
      }),
    ).rejects.toThrow(/affectedSystem must be one of/);
  });

  it('accepts a finding with NO fault code — a wheel bearing sets no DTC', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx(), DIAGNOSIS_ID, {
      faultDescription: 'Front near-side wheel bearing noise',
      affectedSystem: 'mechanical',
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    expect(insert?.values?.[4]).toBeNull();
  });

  it('defaults the standing to SUSPECTED — the honest default mid-diagnosis', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx(), DIAGNOSIS_ID, {
      faultDescription: 'Misfire',
      affectedSystem: 'electrical',
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    expect(insert?.values?.[12]).toBe('suspected');
  });

  it('NEVER takes `source` from the caller — §1294', async () => {
    // The distinction between an AI suggestion and a technician's finding is only
    // preserved if a caller cannot name its own source. `source` is a literal in
    // the INSERT, so this asserts the SQL rather than a parameter.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx(), DIAGNOSIS_ID, {
      faultDescription: 'Misfire',
      affectedSystem: 'electrical',
      // A caller trying to file a machine's guess as a technician's finding, or
      // vice versa. The extra property is ignored by the service's own input type.
      ...({ source: 'ai_suggestion' } as Record<string, unknown>),
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    expect(insert?.values).not.toContain('ai_suggestion');
    expect(insert?.text).toContain("'technician'");
  });

  it('stamps the confirmer when a finding is recorded as CONFIRMED — §1294', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx({ userId: TECH_ID }), DIAGNOSIS_ID, {
      faultDescription: 'Coil pack open circuit',
      affectedSystem: 'electrical',
      findingStatus: 'confirmed',
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    // confirmed_by, then confirmed_at — a confirmed fault can always answer
    // "who says so".
    expect(insert?.values?.[13]).toBe(TECH_ID);
    expect(insert?.values?.[14]).toBeInstanceOf(Date);
  });

  it('leaves the confirmer unset for a SUSPECTED finding', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx(), DIAGNOSIS_ID, {
      faultDescription: 'Misfire',
      affectedSystem: 'electrical',
      findingStatus: 'suspected',
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    expect(insert?.values?.[13]).toBeNull();
    expect(insert?.values?.[14]).toBeNull();
  });

  it('assigns the position server-side, from what is already recorded', async () => {
    // Two findings claiming position 2 have no defined order, and the order is how
    // a reader follows the reasoning.
    const { db, queries } = fakeDb([[Q.position, [{ n: 3 }]], ...openDiagnosis()]);
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.addFinding(ctx(), DIAGNOSIS_ID, {
      faultDescription: 'Misfire',
      affectedSystem: 'electrical',
    });
    const insert = queries.find((q) => Q.findingInsert.test(q.text));
    expect(insert?.values?.[3]).toBe(3);
  });

  it('refuses to add a finding to a SUBMITTED diagnosis, before the trigger has to', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow({ status: 'submitted' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.addFinding(ctx(), DIAGNOSIS_ID, {
        faultDescription: 'Misfire',
        affectedSystem: 'electrical',
      }),
    ).rejects.toThrow(/is submitted and cannot be changed/);
  });

  it('names the reachable way forward when it refuses', async () => {
    // A refusal that names an alternative must have a reachable one — slice 3a's
    // lesson. The queue screen offers "Start a new diagnosis" for exactly this.
    const { db } = fakeDb([
      [Q.writable, [openRow({ status: 'approved' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.addFinding(ctx(), DIAGNOSIS_ID, {
        faultDescription: 'Misfire',
        affectedSystem: 'electrical',
      }),
    ).rejects.toThrow(/start a new diagnosis to record a further opinion/);
  });
});

describe('correcting a finding', () => {
  it('rejects an update that changes nothing', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {})).rejects.toThrow(
      /nothing to update/,
    );
  });

  it('reports a finding that is not on this diagnosis rather than succeeding silently', async () => {
    // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look
    // successful — the `'ApiFailure' in 'describeApiFailure'` lesson in SQL form.
    const { db } = fakeDb([[Q.findingUpdate, []], ...openDiagnosis()]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { findingStatus: 'confirmed' }),
    ).rejects.toThrow(/finding not found on this diagnosis/);
  });

  it('CLEARS the confirmation signature when a finding stops being confirmed', async () => {
    // The half that is easy to forget. The CHECK constraint only constrains rows
    // that ARE confirmed, so a downgrade that kept `confirmed_by` would leave a
    // suspected fault naming somebody who had signed for it.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { findingStatus: 'suspected' });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.text).toContain('confirmed_by = NULL');
    expect(update?.text).toContain('confirmed_at = NULL');
  });

  it('STAMPS the confirmer on promotion, without displacing an existing one', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx({ userId: TECH_ID }), DIAGNOSIS_ID, FINDING_ID, {
      findingStatus: 'confirmed',
    });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    // COALESCE, so re-saving an already-confirmed finding does not move the
    // signature to whoever last edited it. The first person to confirm says so.
    expect(update?.text).toMatch(/confirmed_by = COALESCE\(confirmed_by, \$\d+\)/);
    expect(update?.text).toMatch(/confirmed_at = COALESCE\(confirmed_at, now\(\)\)/);
    expect(update?.values).toContain(TECH_ID);
  });

  it('LEAVES the signature alone when the status is not being changed', async () => {
    // Fixing a typo must not rewrite WHEN a fault was confirmed.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { faultCode: 'P0302' });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.text).not.toContain('confirmed_by');
    expect(update?.text).not.toContain('confirmed_at');
  });

  it('does not touch a column the caller never mentioned', async () => {
    // The whole reason the SET list is assembled rather than a fixed row of
    // COALESCEs. A statement that always writes every column cannot tell "clear
    // this" from "not mentioned".
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { faultCode: 'P0302' });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.text).toContain('fault_code =');
    expect(update?.text).not.toContain('interpretation =');
    expect(update?.text).not.toContain('observed_symptom =');
  });
});

describe('clearing an optional field — Codex MEDIUM', () => {
  /**
   * The capability that did not exist in the first version.
   *
   * `COALESCE($n, column)` collapses "clear this" and "not mentioned" into one
   * request, so a fault code typed against a fault that turns out to have no DTC
   * could be overwritten with a DIFFERENT wrong code but never removed. The only way
   * out was deleting the finding and retyping the reasoning — destroying the record
   * around a field to fix that field.
   */
  it('CLEARS a nullable field when the caller sends null', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {
      faultCode: null as unknown as string,
    });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.text).toContain('fault_code =');
    expect(update?.values?.[0]).toBeNull();
  });

  it('treats an EMPTY STRING as a clear, not as a blank code', async () => {
    // What a cleared text input actually submits. Storing '' would make "there is no
    // code" and "somebody blanked the box" two different values meaning one thing.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { faultCode: '' });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.values?.[0]).toBeNull();
  });

  it('clears the evidence fields too, not only the code', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {
      observedSymptom: '',
      testPerformed: '',
      interpretation: '',
    });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    for (const column of ['observed_symptom', 'test_performed', 'interpretation']) {
      expect(update?.text).toContain(`${column} =`);
    }
    expect(update?.values?.slice(0, 3)).toEqual([null, null, null]);
  });

  it('REFUSES to clear fault_description — 012 declares it NOT NULL and non-blank', async () => {
    // A 400 naming the field, never a 23502 from Postgres surfacing as a 500.
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { faultDescription: '' }),
    ).rejects.toThrow(/faultDescription/);
  });

  it('REFUSES to clear affected_system', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {
        affectedSystem: null as unknown as string,
      }),
    ).rejects.toThrow(/affectedSystem must be one of/);
  });

  it('REFUSES to clear finding_status', async () => {
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {
        findingStatus: null as unknown as string,
      }),
    ).rejects.toThrow(/findingStatus must be one of/);
  });

  it('never lets a caller-supplied string reach the SQL TEXT', async () => {
    // The SET list is assembled, so this is worth asserting rather than assuming:
    // column names come from literals in the service and every value is bound.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, {
      faultCode: "P0301'; DROP TABLE repair.diagnoses; --",
    });
    const update = queries.find((q) => Q.findingUpdate.test(q.text));
    expect(update?.text).not.toContain('DROP TABLE');
    expect(update?.values).toContain("P0301'; DROP TABLE repair.diagnoses; --");
  });

  it('refuses an update once the diagnosis is submitted', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow({ status: 'submitted' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(
      svc.updateFinding(ctx(), DIAGNOSIS_ID, FINDING_ID, { findingStatus: 'confirmed' }),
    ).rejects.toThrow(/cannot be changed/);
  });
});

describe('removing a finding entered in error', () => {
  it('removes it while the diagnosis is open', async () => {
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.removeFinding(ctx(), DIAGNOSIS_ID, FINDING_ID);
    expect(queries.some((q) => Q.findingDelete.test(q.text))).toBe(true);
  });

  it('audits the removal — the only remaining trace that the row existed', async () => {
    const audit = spyAudit();
    const { db } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, audit as never);
    await svc.removeFinding(ctx(), DIAGNOSIS_ID, FINDING_ID);
    expect(audit.write.mock.calls[0]?.[2]).toMatchObject({
      action: 'diagnosis.finding_removed',
      detail: { findingId: FINDING_ID },
    });
  });

  it('reports a miss rather than succeeding silently', async () => {
    const { db } = fakeDb([[Q.findingDelete, []], ...openDiagnosis()]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.removeFinding(ctx(), DIAGNOSIS_ID, FINDING_ID)).rejects.toThrow(
      /finding not found on this diagnosis/,
    );
  });

  it('refuses once the diagnosis is submitted', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow({ status: 'submitted' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.removeFinding(ctx(), DIAGNOSIS_ID, FINDING_ID)).rejects.toThrow(
      /cannot be changed/,
    );
  });
});

// ── submission ─────────────────────────────────────────────────────────────

describe('submitting for review — §1292', () => {
  it('REFUSES A DIAGNOSIS WITH NO FINDINGS', async () => {
    // The gate this slice exists to provide. Slice 3a shipped the mirror image —
    // "is any checkpoint unanswered" is false for zero checkpoints — and the
    // Supervisor caught it. Here the hole is wider, because a diagnosis
    // legitimately starts empty: there is no template to pre-create.
    const { db } = fakeDb([[Q.findingCount, [{ n: 0 }]], ...openDiagnosis()]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.submit(ctx(), DIAGNOSIS_ID)).rejects.toThrow(/no findings recorded/);
  });

  it('tells the technician that a fault RULED OUT is also a finding', async () => {
    // §1290's `excluded`. Without saying so, the refusal reads as "you must find
    // something wrong", which invents faults.
    const { db } = fakeDb([[Q.findingCount, [{ n: 0 }]], ...openDiagnosis()]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.submit(ctx(), DIAGNOSIS_ID)).rejects.toThrow(/excluded/);
  });

  it('accepts a diagnosis whose findings are all SUSPECTED', async () => {
    // §1290 explicitly allows suspected faults — that is what further testing is
    // for. Requiring a confirmed one would push technicians into confirming
    // guesses.
    const { db } = fakeDb(
      openDiagnosis({ header: { status: 'submitted' }, findings: [findingRow()] }),
    );
    const svc = new DiagnosisService(db, fakeAudit());
    const result = await svc.submit(ctx(), DIAGNOSIS_ID);
    expect(result.status).toBe('submitted');
  });

  it('records the status breakdown in the audit trail, never the descriptions', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.statusCounts, [{ finding_status: 'confirmed', n: 2 }, { finding_status: 'excluded', n: 1 }]],
      ...openDiagnosis({ header: { status: 'submitted' } }),
    ]);
    const svc = new DiagnosisService(db, audit as never);
    await svc.submit(ctx(), DIAGNOSIS_ID);
    const event = audit.write.mock.calls[0]?.[2];
    expect(event).toMatchObject({
      action: 'diagnosis.submitted',
      detail: { jobNumber: 'JC-000003', confirmed: 2, suspected: 0, excluded: 1 },
    });
    expect(JSON.stringify(event?.detail)).not.toContain('misfire');
  });

  it('refuses to submit one that is already submitted', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow({ status: 'submitted' })]],
      ...openDiagnosis(),
    ]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.submit(ctx(), DIAGNOSIS_ID)).rejects.toThrow(/cannot be changed/);
  });
});

// ── reads ──────────────────────────────────────────────────────────────────

describe('reading a diagnosis', () => {
  it('derives the counts rather than trusting a stored copy', async () => {
    const { db } = fakeDb(
      openDiagnosis({
        findings: [
          findingRow({ id: 'f1', finding_status: 'confirmed' }),
          findingRow({ id: 'f2', finding_status: 'suspected' }),
          findingRow({ id: 'f3', finding_status: 'excluded' }),
          findingRow({ id: 'f4', finding_status: 'suspected', additional_inspection_required: true }),
        ],
      }),
    );
    const svc = new DiagnosisService(db, fakeAudit());
    const result = await svc.findById(ctx(), DIAGNOSIS_ID);
    expect({
      confirmed: result.confirmedCount,
      suspected: result.suspectedCount,
      excluded: result.excludedCount,
      additional: result.additionalInspectionCount,
    }).toEqual({ confirmed: 1, suspected: 2, excluded: 1, additional: 1 });
  });

  it('narrows a technician to their own assigned cards on READ-BY-ID too', async () => {
    // Without this a diagnosis id would read out a card the technician cannot
    // reach — the card unreachable and its diagnosis not.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.findById(ctx({ activeRole: 'technician', userId: TECH_ID }), DIAGNOSIS_ID);
    const header = queries.find((q) => Q.header.test(q.text));
    expect(header?.values?.[4]).toBe(TECH_ID);
  });

  it('carries NO dead core.customers join in the read path', async () => {
    // Slice 3a shipped one that was never referenced in the WHERE clause. Harmless
    // in effect, dangerous in reading: the next person adding an owner-scoped role
    // would assume the narrowing was already done.
    const { db, queries } = fakeDb(openDiagnosis());
    const svc = new DiagnosisService(db, fakeAudit());
    await svc.findById(ctx(), DIAGNOSIS_ID);
    const header = queries.find((q) => Q.header.test(q.text));
    expect(header?.text).not.toMatch(/JOIN core\.customers/);
  });

  it('checks the card is visible BEFORE listing its diagnoses', async () => {
    // Otherwise an empty list means both "none yet" and "not your card", and the
    // endpoint confirms which cards exist.
    const { db } = fakeDb([[Q.card, []]]);
    const svc = new DiagnosisService(db, fakeAudit());
    await expect(svc.listForJobCard(ctx(), CARD_ID)).rejects.toThrow(/job card not found/);
  });

  it('marks a submitted diagnosis reviewable only for someone who did not submit it', async () => {
    const submitted = { status: 'submitted', submitted_by: TECH_ID };

    const { db } = fakeDb(openDiagnosis({ header: submitted }));
    const mine = await new DiagnosisService(db, fakeAudit()).findById(
      ctx({ activeRole: 'workshop_supervisor', userId: TECH_ID }),
      DIAGNOSIS_ID,
    );
    expect(mine.reviewable).toBe(false);

    const { db: db2 } = fakeDb(openDiagnosis({ header: submitted }));
    const theirs = await new DiagnosisService(db2, fakeAudit()).findById(
      ctx({ activeRole: 'workshop_supervisor', userId: OTHER_ID }),
      DIAGNOSIS_ID,
    );
    expect(theirs.reviewable).toBe(true);
  });

  it('never marks an in-progress diagnosis reviewable', async () => {
    const { db } = fakeDb(openDiagnosis());
    const result = await new DiagnosisService(db, fakeAudit()).findById(
      ctx({ activeRole: 'workshop_supervisor', userId: OTHER_ID }),
      DIAGNOSIS_ID,
    );
    expect(result.reviewable).toBe(false);
  });

  it('marks a submitted diagnosis not editable, whatever the role', async () => {
    const { db } = fakeDb(openDiagnosis({ header: { status: 'submitted' } }));
    const result = await new DiagnosisService(db, fakeAudit()).findById(
      ctx({ activeRole: 'workshop_owner' }),
      DIAGNOSIS_ID,
    );
    expect(result.editable).toBe(false);
  });

  it('resolves the affected-system label and keeps the raw value', async () => {
    const { db } = fakeDb(openDiagnosis({ findings: [findingRow()] }));
    const result = await new DiagnosisService(db, fakeAudit()).findById(ctx(), DIAGNOSIS_ID);
    const finding = only(result.findings);
    expect({ raw: finding.affectedSystem, label: finding.affectedSystemLabel }).toEqual({
      raw: 'electrical',
      label: 'Electrical',
    });
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('diagnosis-rules matches what migration 012 actually applied', () => {
  /**
   * The migration text, found by walking UP the tree.
   *
   * The suite runs both from `apps/api` and from the repo root, so a relative path
   * from `process.cwd()` resolves in only one of them. Same lookup as
   * `job-card-stages.spec.ts` and slice 3a's, for the same reason.
   */
  function migration(name: string): string {
    let dir = resolve(process.cwd());
    let sqlPath = '';
    for (;;) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) {
        sqlPath = candidate;
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fail loudly rather than skip: a silent skip lets the two drift while the
    // suite still reports green, which is the failure these tests exist to stop.
    expect(sqlPath, `could not locate ${name} to compare against`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }

  const SQL = () => migration('012_repair_diagnoses.sql');

  /** Every quoted literal inside the first `IN (...)` after a column name. */
  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the four §1292 diagnosis statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...DIAGNOSIS_STATUSES].sort());
  });

  it('carries exactly §1290s three finding standings', () => {
    expect(checkValues(SQL(), 'finding_status')).toEqual([...FINDING_STATUSES].sort());
  });

  it('carries exactly §1294s two sources', () => {
    expect(checkValues(SQL(), 'source')).toEqual([...FINDING_SOURCES].sort());
  });

  it('carries exactly §9s affected-system categories', () => {
    expect(checkValues(SQL(), 'affected_system')).toEqual([...AFFECTED_SYSTEMS].sort());
  });

  it('labels every category it offers', () => {
    // A category with no label would render as a bare code on the screen — and the
    // fallback exists for RETIRED codes, not for ones the form still offers.
    for (const system of AFFECTED_SYSTEMS) {
      expect({ system, label: affectedSystemLabel(system) }).not.toEqual({
        system,
        label: system,
      });
    }
  });

  it('keeps the review decisions a strict subset of the statuses', () => {
    // A reviewer can only move the record to a state the CHECK constraint allows.
    expect(['approved', 'rejected'].every((d) => DIAGNOSIS_STATUSES.includes(d as never))).toBe(
      true,
    );
  });

  it('grants DELETE on findings and withholds it on the header — migration 013', () => {
    // 012 revoked both. 013 grants the child back, narrowly, because the trigger
    // already refuses a delete once the diagnosis is settled. If a later migration
    // ever re-revokes it, `removeFinding` becomes an unreachable escape hatch again
    // and this test is what says so.
    const sql = migration('013_diagnostic_finding_removal.sql');
    expect(sql).toMatch(/GRANT DELETE ON repair\.diagnostic_findings/);
    expect(sql).toMatch(/REVOKE DELETE ON repair\.diagnoses/);
  });
});
