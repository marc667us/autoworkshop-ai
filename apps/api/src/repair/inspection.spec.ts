import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InspectionService } from './inspection.service';
import {
  CAN_READ_INSPECTION,
  CAN_RECORD_INSPECTION,
  INSPECTION_CHECKPOINTS,
  INSPECTION_RESULTS,
  checkpointLabel,
  isCheckpointCode,
} from './inspection-checklist';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Inspection records — Phase 5, slice 3a.
 *
 * UNIT tests over a fake client, the shape `repair.spec.ts` established. They
 * assert what the database cannot: who may record an inspection, that a sheet is
 * only started on a card whose vehicle is present, and that a submitted sheet is
 * refused BEFORE the trigger has to refuse it.
 *
 * ⚠️ The trigger is proven separately, against real Postgres, by attempting a
 * real UPDATE and DELETE. These tests cover the service's own judgement — a fake
 * client cannot enforce a constraint, so a test here passing proves nothing about
 * the database, and the reverse is equally true. Both are required.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const INSPECTION_ID = '99999999-8888-7777-6666-555555555555';
const TECH_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

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
  stage: 'initial_inspection',
  mileage_at_intake: 84500,
  ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: INSPECTION_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  registration_number: 'GR 4821-22',
  attempt_no: 1,
  status: 'in_progress',
  mileage_reading: 84500,
  summary: null,
  started_at: new Date('2026-07-29T09:00:00Z'),
  submitted_at: null,
  started_by_name: 'A. Technician',
  submitted_by_name: null,
  ...over,
});

/**
 * The SQL fragments that identify each query this service issues.
 *
 * ⚠️ EACH ONE MUST BE UNIQUE TO ITS QUERY. `assertWritable` and the header read
 * both begin `FROM repair.inspections i JOIN repair.job_cards j`, so a prefix
 * regex matches whichever is listed first and silently feeds a row of the wrong
 * shape to the other. That is a test harness reporting a service defect that
 * does not exist — the mirror image of slice 2's suite reporting success while
 * running nothing. Anchored on the distinctive line of each statement instead.
 */
const Q = {
  /** The scoped job-card lookup. */
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  /** `assertWritable` — the only statement that locks the inspection row. */
  writable: /FOR UPDATE OF i/,
  /** The header read — the only one that joins `identity.users` twice. */
  header: /LEFT JOIN identity\.users sb/,
  items: /FROM repair\.inspection_items\s+WHERE inspection_id = ANY/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  openCheck: /SELECT id FROM repair\.inspections/,
  unanswered: /result IS NULL/,
  /**
   * ⚠️ `findingCount` MUST BE MATCHED BEFORE `itemCount`. Both statements select
   * `count(*)::int AS n` from `inspection_items`; only the findings one carries
   * `result = ANY`. Listing the loose regex first would feed the findings count to
   * the total-count check and vice versa — the same collision that made an earlier
   * version of this harness report service defects that did not exist.
   */
  findingCount: /result = ANY/,
  /** The "does this sheet have any checkpoints at all" guard. */
  itemCount: /count\(\*\)::int/,
  itemUpdate: /UPDATE repair\.inspection_items/,
  headerUpdate: /UPDATE repair\.inspections/,
  headerInsert: /INSERT INTO repair\.inspections/,
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
 * The single sheet a read returned.
 *
 * `noUncheckedIndexedAccess` makes `rows[0]` possibly undefined, and a `!` here
 * would turn a genuinely empty result into "cannot read properties of
 * undefined" three lines later. This fails with the reason instead.
 */
function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected exactly one row, received ${rows.length}`);
  return first;
}

/** An in-progress sheet, on a card this viewer can see. */
const openRow = (over: Record<string, unknown> = {}) => ({
  id: INSPECTION_ID,
  status: 'in_progress',
  attempt_no: 1,
  job_number: 'JC-000003',
  ...over,
});

/** The handler set for a healthy in-progress sheet on a visible card. */
const openSheet = (over: { card?: Record<string, unknown>; header?: Record<string, unknown> } = {}) =>
  [
    [Q.card, [cardRow(over.card)]],
    [Q.writable, [openRow()]],
    [Q.attempt, [{ n: 1 }]],
    // No inspection already in progress — `start`'s conflict check.
    [Q.openCheck, []],
    [Q.headerInsert, [{ id: INSPECTION_ID }]],
    // rowCount 1: the checkpoint row exists, as it does after `start` writes the
    // sheet. The zero-row case has its own test — it must not be the default, or
    // every write test would be silently asserting a failure path.
    [Q.itemUpdate, [{ ok: true }]],
    [Q.header, [headerRow(over.header)]],
    [Q.items, []],
  ] as Array<[RegExp, unknown[]]>;

describe('who may record an inspection — 07 pt2 §50', () => {
  it('refuses RECEPTION, who books the car in but does not assess it', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.start(ctx({ activeRole: 'reception_staff' }), CARD_ID)).rejects.toThrow(
      /may not record an inspection/,
    );
  });

  it('refuses the QUALITY-CONTROL INSPECTOR, who must stay independent', async () => {
    // `2.txt` §563 requires the post-repair check to be INDEPENDENT. A QC
    // inspector who recorded the initial sheet would later be checking their own
    // findings.
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(
      svc.start(ctx({ activeRole: 'quality_control_inspector' }), CARD_ID),
    ).rejects.toThrow(/may not record an inspection/);
    // ...but they may READ it.
    expect(CAN_READ_INSPECTION.has('quality_control_inspector')).toBe(true);
  });

  it('refuses a CUSTOMER both writing and reading the raw sheet', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.start(ctx({ activeRole: 'customer' }), CARD_ID)).rejects.toThrow(
      /may not record an inspection/,
    );
    await expect(
      svc.listForJobCard(ctx({ activeRole: 'customer' }), CARD_ID),
    ).rejects.toThrow(/may not read inspections/);
  });

  it('allows the assigned TECHNICIAN — §50 gives them assigned-job inspection', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.start(ctx({ activeRole: 'technician' }), CARD_ID)).resolves.toBeTruthy();
  });
});

describe('the technician scope reaches the inspection, not just the card', () => {
  it('narrows the sheet read by assignment for a TECHNICIAN', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.findById(ctx({ activeRole: 'technician', userId: TECH_ID }), INSPECTION_ID);
    const read = queries.find((q) => /SELECT i\.id, i\.job_card_id/.test(q.text));
    // ⚠️ THE POINT OF THIS TEST. Without this predicate an inspection id would
    // read out a card the technician is not assigned to — the card would be
    // unreachable and its inspection sheet would not, which is the same leak by
    // a different door.
    expect(read?.text).toMatch(/assigned_technician_id = \$5/);
    expect(read?.values?.[4]).toBe(TECH_ID);
  });

  it('does NOT narrow a manager, who sees the organisation', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.findById(ctx({ activeRole: 'workshop_manager' }), INSPECTION_ID);
    const read = queries.find((q) => /SELECT i\.id, i\.job_card_id/.test(q.text));
    expect(read?.values?.[4]).toBeNull();
  });

  it('scopes every read to tenant AND organization, never tenant alone', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.findById(ctx({ organizationId: 'org-7', activeRole: 'workshop_manager' }), INSPECTION_ID);
    const read = queries.find((q) => /SELECT i\.id, i\.job_card_id/.test(q.text));
    expect(read?.text).toMatch(/i\.organization_id = \$2/);
    expect(read?.values?.[1]).toBe('org-7');
  });

  it('404s on a card this viewer cannot see, before reading any inspection', async () => {
    // The card lookup returns nothing — a technician probing someone else's job.
    const { db, queries } = fakeDb([[/FROM repair\.job_cards j\s+JOIN core\.customers/, []]]);
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.listForJobCard(ctx(), CARD_ID)).rejects.toThrow(/job card not found/);
    // NOT FOUND, not FORBIDDEN, and no inspection query ran at all — otherwise an
    // empty list would mean both "none yet" and "not your card".
    expect(queries.some((q) => /FROM repair\.inspections/.test(q.text))).toBe(false);
  });
});

describe('an inspection is only started on a vehicle that is present', () => {
  it('refuses a card still at complaint_received', async () => {
    const { db } = fakeDb(openSheet({ card: { stage: 'complaint_received' } }));
    const svc = new InspectionService(db, fakeAudit());
    // A signed statement about the condition of a car nobody has seen.
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(
      /may only be started while the job card is at 'initial_inspection'/,
    );
  });

  it('refuses a card already in repair', async () => {
    const { db } = fakeDb(openSheet({ card: { stage: 'repair_in_progress' } }));
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/this card is at 'repair_in_progress'/);
  });

  it('refuses a SECOND open sheet on the same card', async () => {
    const { db } = fakeDb([
      // FIRST in the list, so it wins over `openSheet`'s empty answer: the
      // handlers are searched in order, and an override appended at the end would
      // never be reached.
      [Q.openCheck, [{ id: 'other' }]],
      ...openSheet(),
    ]);
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.start(ctx(), CARD_ID)).rejects.toThrow(/already has an inspection in progress/);
  });

  it('locks the card while starting, so two Start presses cannot both win', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.start(ctx(), CARD_ID);
    const cardRead = queries.find((q) => /FROM repair\.job_cards j\s+JOIN core\.customers/.test(q.text));
    expect(cardRead?.text).toMatch(/FOR UPDATE OF j/);
  });

  it('writes the whole checklist, defaulting mileage to the intake reading', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.start(ctx(), CARD_ID);

    const header = queries.find((q) => /INSERT INTO repair\.inspections/.test(q.text));
    // The intake figure reception copied at the door, not null.
    expect(header?.values?.[4]).toBe(84500);

    const items = queries.find((q) => /INSERT INTO repair\.inspection_items/.test(q.text));
    const codes = items?.values?.[3] as string[];
    const positions = items?.values?.[4] as number[];
    // ⚠️ ALL 19 ROWS UP FRONT. The sheet is a record of what was ASKED as well as
    // what was answered; creating rows only on first answer would let a later
    // template edit silently rewrite the meaning of a historical inspection.
    expect(codes).toHaveLength(19);
    expect(codes).toEqual(INSPECTION_CHECKPOINTS.map((c) => c.code));
    expect(positions).toEqual(INSPECTION_CHECKPOINTS.map((_, i) => i + 1));
  });
});

describe('recording results', () => {
  it('rejects a checkpoint that is not on the checklist, before writing anything', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(
      svc.recordItems(ctx(), INSPECTION_ID, {
        items: [
          { checkpointCode: 'brakes', result: 'pass' },
          { checkpointCode: 'flux_capacitor', result: 'fail' },
        ],
      }),
    ).rejects.toThrow(/is not a checkpoint on this checklist/);
    // NOTHING was written — a half-applied sheet leaves the technician guessing
    // which of their answers landed.
    expect(queries.some((q) => /UPDATE repair\.inspection_items/.test(q.text))).toBe(false);
  });

  it('rejects a result outside the four §2968 answers', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(
      svc.recordItems(ctx(), INSPECTION_ID, {
        items: [{ checkpointCode: 'brakes', result: 'probably_fine' }],
      }),
    ).rejects.toThrow(/items\[0\]\.result/);
  });

  it('rejects the same checkpoint answered twice in one request', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(
      svc.recordItems(ctx(), INSPECTION_ID, {
        items: [
          { checkpointCode: 'brakes', result: 'pass' },
          { checkpointCode: 'brakes', result: 'fail' },
        ],
      }),
    ).rejects.toThrow(/appears more than once/);
  });

  it('rejects an empty request rather than reporting a successful no-op', async () => {
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.recordItems(ctx(), INSPECTION_ID, {})).rejects.toThrow(/nothing to record/);
  });

  it('refuses to write to a SUBMITTED sheet — 409, not 403', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow({ status: 'submitted' })]],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    // The caller HOLDS the right to record inspections; what refuses them is the
    // state of this one. "Forbidden" would send them hunting a permission
    // problem that does not exist.
    await expect(
      svc.recordItems(ctx(), INSPECTION_ID, {
        items: [{ checkpointCode: 'brakes', result: 'pass' }],
      }),
    ).rejects.toThrow(/submitted and cannot be changed/);
  });

  it('locks the sheet while writing', async () => {
    const { db, queries } = fakeDb(openSheet());
    const svc = new InspectionService(db, fakeAudit());
    await svc.recordItems(ctx(), INSPECTION_ID, {
      items: [{ checkpointCode: 'brakes', result: 'pass' }],
    });
    const read = queries.find((q) => /FROM repair\.inspections i\s+JOIN repair\.job_cards j/.test(q.text));
    expect(read?.text).toMatch(/FOR UPDATE OF i/);
  });

  it('reports a checkpoint the UPDATE did not match instead of silently skipping it', async () => {
    // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look
    // successful. Handlers return rowCount 0 for the item update here.
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow()]],
      [Q.itemUpdate, []],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    await expect(
      svc.recordItems(ctx(), INSPECTION_ID, {
        items: [{ checkpointCode: 'brakes', result: 'pass' }],
      }),
    ).rejects.toThrow(/is not on this inspection sheet/);
  });

  it('keeps the note out of the audit detail, and the codes in', async () => {
    const audit = spyAudit();
    const { db } = fakeDb(openSheet());
    const svc = new InspectionService(db, audit as never);
    await svc.recordItems(ctx(), INSPECTION_ID, {
      items: [{ checkpointCode: 'brakes', result: 'fail', note: 'Customer mentioned a divorce.' }],
    });
    const event = only(audit.write.mock.calls)[2];
    expect(JSON.stringify(event.detail)).not.toMatch(/divorce/);
    expect(event.detail?.checkpoints).toEqual(['brakes']);
  });
});

describe('submission is what makes the checklist a checklist', () => {
  it('refuses to submit while any checkpoint is unanswered, and NAMES them', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow()]],
      [Q.itemCount, [{ n: 19 }]],
      [Q.unanswered, [{ checkpoint_code: 'brakes' }, { checkpoint_code: 'tyres' }]],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    // A sheet submittable with 14 of 19 answered is a sheet where the five
    // nobody looked at are indistinguishable from the ones that passed.
    await expect(svc.submit(ctx(), INSPECTION_ID)).rejects.toThrow(
      /2 checkpoint\(s\) unanswered: Brakes, Tyres/,
    );
    // And it says how to legitimately pass one by.
    await expect(svc.submit(ctx(), INSPECTION_ID)).rejects.toThrow(/not applicable/);
  });

  it('submits when every checkpoint is answered', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow()]],
      [Q.itemCount, [{ n: 19 }]],
      [Q.unanswered, []],
      [Q.findingCount, [{ n: 3 }]],
      [Q.header, [headerRow({ status: 'submitted', submitted_at: new Date('2026-07-29T11:00:00Z') })]],
      [Q.items, []],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    const result = await svc.submit(ctx(), INSPECTION_ID);
    expect(result.status).toBe('submitted');
    const update = queries.find((q) => Q.headerUpdate.test(q.text));
    expect(update?.text).toMatch(/status = 'submitted'/);
    expect(update?.text).toMatch(/submitted_by = \$1/);
  });

  it('refuses to submit a sheet with NO checkpoints at all', async () => {
    // Supervisor pass on this slice; Codex did not flag it. "Is any checkpoint
    // unanswered" is FALSE for an empty sheet, so without the count an empty
    // inspection submits cleanly and becomes a finding of record saying a vehicle
    // was inspected against nothing — a vacuous truth in the one gate this slice
    // exists to provide.
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow()]],
      [Q.itemCount, [{ n: 0 }]],
      [Q.unanswered, []],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.submit(ctx(), INSPECTION_ID)).rejects.toThrow(
      /no checklist and cannot be submitted/,
    );
  });

  it('refuses to submit an already-submitted sheet', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.writable, [openRow({ status: 'submitted' })]],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    await expect(svc.submit(ctx(), INSPECTION_ID)).rejects.toThrow(/start a new inspection/);
  });
});

describe('derived counts, which are never stored', () => {
  it('counts answers and findings from the sheet itself', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.header, [headerRow()]],
      [
        Q.items,
        [
          { id: 'i1', inspection_id: INSPECTION_ID, checkpoint_code: 'brakes', position: 10, result: 'fail', note: null, recorded_at: new Date('2026-07-29T10:00:00Z') },
          { id: 'i2', inspection_id: INSPECTION_ID, checkpoint_code: 'tyres', position: 13, result: 'requires_testing', note: null, recorded_at: new Date('2026-07-29T10:01:00Z') },
          { id: 'i3', inspection_id: INSPECTION_ID, checkpoint_code: 'exhaust', position: 17, result: 'pass', note: null, recorded_at: new Date('2026-07-29T10:02:00Z') },
          { id: 'i4', inspection_id: INSPECTION_ID, checkpoint_code: 'lighting', position: 14, result: null, note: null, recorded_at: null },
        ],
      ],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    const sheet = only(await svc.listForJobCard(ctx({ activeRole: 'workshop_manager' }), CARD_ID));
    expect(sheet.answeredCount).toBe(3);
    // `2.txt` §557: what drives the diagnostic report and the preliminary
    // quotation is the failures — fail AND requires_testing, not pass.
    expect(sheet.findingCount).toBe(2);
    expect(sheet.items.map((i) => i.label)).toContain('Brakes');
  });

  it('marks a submitted sheet as not editable even for a role that may record', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.header, [headerRow({ status: 'submitted', submitted_at: new Date('2026-07-29T11:00:00Z') })]],
      [Q.items, []],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    const sheet = only(await svc.listForJobCard(ctx({ activeRole: 'workshop_manager' }), CARD_ID));
    expect(sheet.editable).toBe(false);
  });

  it('marks an open sheet as not editable for a role that may only READ', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.header, [headerRow()]],
      [Q.items, []],
    ]);
    const svc = new InspectionService(db, fakeAudit());
    const sheet = only(await svc.listForJobCard(ctx({ activeRole: 'storekeeper' }), CARD_ID));
    expect(sheet.editable).toBe(false);
  });
});

describe('the checklist table itself', () => {
  it('transcribes all 19 §2930-§2966 checkpoints, in specification order', () => {
    // The order is part of the transcription: it is the order a technician walks
    // around a vehicle. Re-sorting it for tidiness would disagree with the paper
    // process every workshop already runs.
    expect(INSPECTION_CHECKPOINTS.map((c) => c.code)).toEqual([
      'vehicle_identification',
      'mileage',
      'engine_condition',
      'fluid_levels',
      'leaks',
      'battery_condition',
      'charging_condition',
      'starting_condition',
      'warning_lights',
      'brakes',
      'steering',
      'suspension',
      'tyres',
      'lighting',
      'electrical_accessories',
      'air_conditioning',
      'exhaust',
      'body_condition',
      'roadworthiness_concerns',
    ]);
  });

  it('carries exactly the four §2968 answers', () => {
    expect([...INSPECTION_RESULTS]).toEqual(['pass', 'fail', 'requires_testing', 'not_applicable']);
  });

  it('matches the CHECK constraint migration 010 actually applied', () => {
    // Migration 010 is the authority on which results are storable; this module
    // is a transcription. A drifted transcription either rejects a legal answer
    // or offers one the database will refuse. Same walk-up-the-tree lookup as
    // `job-card-stages.spec.ts`, and the same reason: the suite runs both from
    // `apps/api` and from the repo root.
    let dir = resolve(process.cwd());
    let sqlPath = '';
    for (;;) {
      const candidate = join(dir, 'infrastructure/migrations/010_repair_inspections.sql');
      if (existsSync(candidate)) {
        sqlPath = candidate;
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fail loudly rather than skip: a silent skip lets the two drift while the
    // suite still reports green, which is the failure this test exists to stop.
    expect(sqlPath, 'could not locate migration 010 to compare against').not.toBe('');

    const sql = readFileSync(sqlPath, 'utf8');
    const check = /result IN\s*\(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? '';
    const inMigration = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inMigration).toEqual([...INSPECTION_RESULTS].sort());
  });

  it('never lets a role record without also being able to read', () => {
    // A role that may write and not read could record a finding it can never see
    // again — and the screen would show an empty sheet after a successful save.
    for (const role of CAN_RECORD_INSPECTION) {
      expect({ role, canRead: CAN_READ_INSPECTION.has(role) }).toEqual({ role, canRead: true });
    }
  });

  it('keeps the initial inspection away from the independent checker', () => {
    // `2.txt` §563 — the post-repair inspection must be independent of the work.
    expect(CAN_RECORD_INSPECTION.has('quality_control_inspector')).toBe(false);
  });

  it('recognises its own codes and rejects anything else', () => {
    expect(isCheckpointCode('brakes')).toBe(true);
    expect(isCheckpointCode('flux_capacitor')).toBe(false);
  });

  it('falls back to the raw code for a retired checkpoint rather than hiding it', () => {
    // A submitted sheet keeps rows for the checkpoints it actually asked. If a
    // future template retires one, the row must still render — ugly and truthful
    // beats a silently shortened inspection sheet.
    expect(checkpointLabel('brakes')).toBe('Brakes');
    expect(checkpointLabel('some_retired_code')).toBe('some_retired_code');
  });
});
