import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RepairPlanService } from './repair-plan.service';
import {
  CAN_PLAN_REPAIR,
  CAN_READ_REPAIR_PLAN,
  CAN_REVIEW_REPAIR_PLAN,
  PLAN_REVIEW_DECISIONS,
  REPAIR_PLAN_STATUSES,
  RESOURCE_KINDS,
  resourceKindLabel,
} from './repair-plan-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Repair plans — Phase 5, slice 4.
 *
 * UNIT tests over a fake client, the shape `inspection.spec.ts` established and
 * `diagnosis.spec.ts` refined. They assert what the database cannot: who may build a
 * plan, who may review one, that a reviewer is not the submitter, that a plan cannot
 * be started without an APPROVED diagnosis carrying a CONFIRMED fault, that a task
 * may not address a suspected fault, and that a plan with no tasks or an unestimated
 * task is refused BEFORE a supervisor is asked to approve it.
 *
 * ⚠️ The triggers, the RLS and the DELETE grants are proven separately against real
 * Postgres by `infrastructure/migrations/verify/014_repair_plans.sql`, which attempts
 * real writes as `autoworkshop_app` and rolls back. A fake client cannot enforce a
 * constraint, so a test here passing proves nothing about the database — and the
 * reverse is equally true. Both are required.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TASK_ID = '12121212-3434-5656-7878-909090909090';
const RESOURCE_ID = '13131313-2424-3535-4646-575757575757';
const DIAGNOSIS_ID = '99999999-8888-7777-6666-555555555555';
const FINDING_ID = '44444444-3333-2222-1111-000000000000';
const OTHER_USER = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

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
  stage: 'solution_preparation',
  ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  registration_number: 'GR 4821-22',
  diagnosis_id: DIAGNOSIS_ID,
  diagnosis_attempt_no: 1,
  attempt_no: 1,
  status: 'in_progress',
  repair_procedure: null,
  safety_precautions: null,
  post_repair_tests: null,
  notes: null,
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

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  plan_id: PLAN_ID,
  position: 1,
  finding_id: FINDING_ID,
  finding_description: 'Cylinder 1 misfire',
  title: 'Replace ignition coil',
  description: null,
  required_skill: null,
  service_bay: null,
  assigned_technician_id: null,
  assigned_technician_name: null,
  // ⚠️ A STRING, because that is what `pg` returns for `numeric`. A fixture using a
  // JS number would make the conversion test vacuous — it would pass with the
  // conversion deleted.
  estimated_labour_hours: '1.50',
  recorded_by_name: 'A. Technician',
  recorded_at: new Date('2026-07-30T10:00:00Z'),
  updated_at: new Date('2026-07-30T10:00:00Z'),
  ...over,
});

const faultRow = (over: Record<string, unknown> = {}) => ({
  plan_id: PLAN_ID,
  id: FINDING_ID,
  position: 1,
  fault_code: 'P0301',
  fault_description: 'Cylinder 1 misfire',
  affected_system: 'electrical',
  task_count: 1,
  ...over,
});

const openRow = (over: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  status: 'in_progress',
  attempt_no: 1,
  job_number: 'JC-000003',
  ...over,
});

/**
 * The SQL fragments that identify each query this service issues.
 *
 * ⚠️ EACH ONE MUST BE UNIQUE TO ITS QUERY, and where two statements share a prefix
 * the MORE SPECIFIC regex must be listed first in the handler array — `fakeDb` takes
 * the first that matches. `assertWritable` and the review lookup both carry
 * `FOR UPDATE OF p`; the header read, the task read and the fault read all mention
 * `repair_plan`. A loose prefix silently feeds a row of the wrong shape to the wrong
 * consumer, which is a harness reporting a service defect that does not exist — the
 * failure mode that cost slice 3b seven of its eleven "defects".
 */
const Q = {
  /** The scoped job-card lookup — the only one that joins `core.customers`. */
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  /** `review`'s lookup — the only one selecting `p.submitted_by` beside the lock. */
  reviewLookup: /p\.submitted_by, j\.job_number/,
  /** `assertWritable` — the only other statement that locks the plan row. */
  writable: /FOR UPDATE OF p/,
  /** The header read — the only one joining `identity.users` three times. */
  header: /LEFT JOIN identity\.users rv/,
  /** The task read — the only one resolving an assigned technician's name. */
  taskRead: /AS assigned_technician_name/,
  /** The confirmed-fault read — the only one computing `task_count`. */
  faultRead: /AS task_count/,
  /** The resource read. */
  resourceRead: /FROM repair\.repair_plan_resources r/,
  /**
   * `start`'s unsettled-attempt check.
   *
   * ⚠️ ANCHORED ON `status IN`, the lesson slice 3b's harness paid for: it had
   * anchored on `SELECT id`, and when the fix added `status` to the projection the
   * regex stopped matching, the handler fell through to `[]`, and the test that was
   * supposed to REFUSE a second attempt silently allowed one. The regex has to name
   * something the rule cannot be expressed without.
   */
  openCheck: /status IN \('in_progress', 'submitted'\)/,
  /** `start`'s source-diagnosis lookup — the only one FILTERing on confirmed. */
  sourceDiagnosis: /FILTER \(WHERE f\.finding_status = 'confirmed'\)/,
  /** `assertFindingIsPlannable` — the only one selecting a bare `finding_status`. */
  findingCheck: /SELECT f\.finding_status/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  position: /COALESCE\(max\(position\)/,
  /** `addResource`'s "is this task on this plan" check. */
  taskOwns: /SELECT 1 FROM repair\.repair_plan_tasks/,
  /**
   * ⚠️ `unestimatedList` MUST BE MATCHED BEFORE `tally`. Both select from
   * `repair_plan_tasks` and both mention `estimated_labour_hours IS NULL`; only the
   * tally carries the aggregate `FILTER`. Listing the loose one first would feed a
   * count to the naming query and vice versa.
   */
  tally: /count\(\*\) FILTER \(WHERE estimated_labour_hours IS NULL\)/,
  unestimatedList: /SELECT position, title FROM repair\.repair_plan_tasks/,
  /** `submit`'s unaddressed-fault count — the only one using NOT EXISTS. */
  gap: /NOT EXISTS/,
  planInsert: /INSERT INTO repair\.repair_plans/,
  planUpdate: /UPDATE repair\.repair_plans/,
  taskInsert: /INSERT INTO repair\.repair_plan_tasks/,
  taskUpdate: /UPDATE repair\.repair_plan_tasks/,
  taskDelete: /DELETE FROM repair\.repair_plan_tasks/,
  resourceInsert: /INSERT INTO repair\.repair_plan_resources/,
  resourceDelete: /DELETE FROM repair\.repair_plan_resources/,
  /**
   * `moveTask`'s two lookups.
   *
   * ⚠️ THEY OPEN WITH THE SAME SEVEN WORDS, and anchoring both on that prefix cost
   * two failing tests that looked exactly like product defects: the neighbour lookup
   * matched the LOCK's handler, so the service was handed the task itself as its own
   * neighbour — one test then saw a swap that did not move and the other saw a
   * "neighbour" where the fixture said there was none. Fourth instance of this class
   * in this repository, and the reason the harness is now anchored on the WHERE
   * clause: the lock addresses one row by id, the neighbour scans a plan. That
   * difference is what the two queries are FOR, so a regex naming it cannot collide
   * however the handlers are ordered.
   */
  taskLock: /SELECT id, position FROM repair\.repair_plan_tasks\s+WHERE id = \$1/,
  neighbour: /SELECT id, position FROM repair\.repair_plan_tasks\s+WHERE plan_id = \$1/,
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

/** An audit spy whose PARAMETERS are typed, so a test can read back what was recorded. */
const spyAudit = () => ({
  write: vi.fn(
    async (
      _client: unknown,
      _ctx: TenantContext,
      _event: { action: string; detail?: Record<string, unknown> },
    ) => undefined,
  ),
});

/** The handler set a plain read needs, in the order collisions require. */
const readHandlers = (
  over: { header?: unknown[]; tasks?: unknown[]; resources?: unknown[]; faults?: unknown[] } = {},
): Array<[RegExp, unknown[]]> => [
  [Q.header, over.header ?? [headerRow()]],
  [Q.taskRead, over.tasks ?? []],
  [Q.faultRead, over.faults ?? []],
  [Q.resourceRead, over.resources ?? []],
];

function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected exactly one row, received ${rows.length}`);
  return first;
}

// ── who may do what ────────────────────────────────────────────────────────

describe('repair plan role rules — 07.txt pt2 §50', () => {
  it('refuses a role outside CAN_READ_REPAIR_PLAN', async () => {
    const { db } = fakeDb([]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.list(ctx({ activeRole: 'customer' }))).rejects.toThrow(
      /may not read repair plans/,
    );
  });

  it('refuses a role outside CAN_PLAN_REPAIR', async () => {
    const { db } = fakeDb([]);
    const service = new RepairPlanService(db, fakeAudit());
    // A storekeeper supplies the parts a plan asks for; deciding WHICH parts a repair
    // needs is a technical judgement, not a stores one.
    await expect(
      service.start(ctx({ activeRole: 'storekeeper' }), CARD_ID),
    ).rejects.toThrow(/may not build a repair plan/);
  });

  it('refuses a technician the REVIEW — §50 gives the approval to the supervisor', async () => {
    const { db } = fakeDb([]);
    const service = new RepairPlanService(db, fakeAudit());
    // The role half of the independence rule. Without it two technicians could sign
    // each other's plans, and no supervisor would ever see one.
    await expect(
      service.review(ctx({ activeRole: 'technician' }), PLAN_ID, { decision: 'approved' }),
    ).rejects.toThrow(/may not review a repair plan/);
    expect(CAN_REVIEW_REPAIR_PLAN.has('technician')).toBe(false);
    expect(CAN_PLAN_REPAIR.has('technician')).toBe(true);
    expect(CAN_READ_REPAIR_PLAN.has('storekeeper')).toBe(true);
  });

  it('narrows a technician to their own assigned cards on every read', async () => {
    const { db, queries } = fakeDb(readHandlers());
    const service = new RepairPlanService(db, fakeAudit());
    await service.list(ctx({ activeRole: 'technician', userId: 'tech-9' }));

    const header = queries.find((q) => Q.header.test(q.text));
    // The fifth parameter is the assignment predicate. A supervisor sends null there;
    // a technician sends their own id, so a plan on somebody else's card is not merely
    // hidden by the screen — it is not returned.
    expect(header?.values?.[4]).toBe('tech-9');

    const { db: db2, queries: q2 } = fakeDb(readHandlers());
    await new RepairPlanService(db2, fakeAudit()).list(
      ctx({ activeRole: 'workshop_supervisor' }),
    );
    expect(q2.find((q) => Q.header.test(q.text))?.values?.[4]).toBeNull();
  });
});

// ── starting a plan ────────────────────────────────────────────────────────

describe('start — §22-§26', () => {
  it('refuses a card that is not at solution_preparation', async () => {
    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'diagnosis_in_progress' })]]]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(
      /may only be built while the job card is at 'solution_preparation'/,
    );
  });

  it('refuses when the card has no APPROVED diagnosis', async () => {
    // The rule this slice exists to enforce: a plan built on an unreviewed diagnosis
    // is a customer charged for a technician's unchecked opinion.
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.sourceDiagnosis, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(
      /confirmed faults of an APPROVED diagnosis/,
    );
  });

  it('names a REACHABLE route in that refusal', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.sourceDiagnosis, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // Three slices running, a refusal whose named alternative could not be reached has
    // been the most expensive defect class here. Both halves named below are real
    // screens: the diagnosis queue records one and the same queue reviews it.
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(/Diagnosis screen/);
  });

  it('refuses when the approved diagnosis confirmed no faults', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.sourceDiagnosis, [{ id: DIAGNOSIS_ID, attempt_no: 2, confirmed: 0 }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // "We found no fault" is a real and correct outcome. It is simply not something to
    // plan a repair from, and saying so beats an empty planning screen.
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(/confirmed no faults/);
  });

  it('refuses a second plan while one is IN PROGRESS', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, [{ id: PLAN_ID, status: 'in_progress' }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(
      /already has a repair plan in progress/,
    );
  });

  it('refuses a second plan while one is SUBMITTED — the slice 3b review bypass', async () => {
    // ⚠️ THE HIGH FINDING FROM SLICE 3B, APPLIED UP FRONT. Every read here orders by
    // `attempt_no DESC`, so allowing a new attempt while one is submitted would make
    // the submitted plan stop being "the current record": the awaiting-review count
    // falls to zero while a plan is still unreviewed, and §30's review is bypassed
    // without anything being deleted. Worse than a lost row, because nothing looks
    // wrong.
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, [{ id: PLAN_ID, status: 'submitted' }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.start(ctx(), CARD_ID)).rejects.toThrow(
      /awaiting supervisor review/,
    );
  });

  it('records the source diagnosis on the row, not just in the audit trail', async () => {
    const audit = spyAudit();
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.sourceDiagnosis, [{ id: DIAGNOSIS_ID, attempt_no: 2, confirmed: 3 }]],
      [Q.attempt, [{ n: 1 }]],
      [Q.planInsert, [{ id: PLAN_ID }]],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, audit as never);
    await service.start(ctx(), CARD_ID);

    const insert = queries.find((q) => Q.planInsert.test(q.text));
    // A plan whose source is unknown cannot be checked against the faults it claims to
    // address, and "the newest approved one at the time" is not recoverable once a
    // second attempt exists.
    expect(insert?.values?.[3]).toBe(DIAGNOSIS_ID);

    const event = audit.write.mock.calls[0]?.[2];
    expect(event?.action).toBe('repair_plan.started');
    expect(event?.detail).toMatchObject({ diagnosisAttemptNo: 2, confirmedFaults: 3 });
  });
});

// ── tasks ──────────────────────────────────────────────────────────────────

describe('tasks — §27-§29', () => {
  it('refuses a task addressing a SUSPECTED fault', async () => {
    // `02.txt` §1290 draws the confirmed/suspected distinction precisely so downstream
    // work can rely on it. This is the first piece of downstream work that does: a
    // plan line against a suspected fault becomes a quotation line, which is a
    // customer charged for a guess.
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.findingCheck, [{ finding_status: 'suspected' }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(
      service.addTask(ctx(), PLAN_ID, { title: 'Replace coil', findingId: FINDING_ID }),
    ).rejects.toThrow(/may only address a CONFIRMED fault/);
  });

  it("404s a fault that is not on this plan's diagnosis", async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.findingCheck, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // 404 rather than 400: answering differently for "exists elsewhere" would make
    // this an oracle for findings on other jobs.
    await expect(
      service.addTask(ctx(), PLAN_ID, { title: 'x', findingId: FINDING_ID }),
    ).rejects.toThrow(/not one of this plan's diagnosis findings/);
  });

  it('accepts a task with NO fault — a road test addresses no single finding', async () => {
    const { db, queries } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.position, [{ n: 4 }]],
      [Q.taskInsert, []],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await service.addTask(ctx(), PLAN_ID, { title: 'Road test', estimatedLabourHours: 0.5 });
    // The nullability is a decision, so it is asserted rather than assumed: forcing a
    // fault would push technicians into attaching unrelated ones, corrupting exactly
    // the link slice 9 needs to trust.
    expect(queries.some((q) => Q.findingCheck.test(q.text))).toBe(false);
    expect(queries.find((q) => Q.taskInsert.test(q.text))?.values?.[4]).toBeNull();
  });

  it('assigns position server-side, never from the caller', async () => {
    const { db, queries } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.position, [{ n: 7 }]],
      [Q.taskInsert, []],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await service.addTask(ctx(), PLAN_ID, { title: 'Bleed brakes' });
    // §28's SEQUENCE is the plan's content, not a display preference — two tasks
    // claiming position 2 have no defined order.
    expect(queries.find((q) => Q.taskInsert.test(q.text))?.values?.[3]).toBe(7);
  });

  it('refuses a labour estimate the column would silently round', async () => {
    // ⚠️ `numeric(6,2)` ROUNDS 1.005 to 1.01; it does not refuse it. The number the
    // technician sees afterwards would not be the number they entered, and this one is
    // multiplied by a labour rate.
    const { db } = fakeDb([[Q.writable, [openRow()]]]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(
      service.addTask(ctx(), PLAN_ID, { title: 'x', estimatedLabourHours: 1.005 }),
    ).rejects.toThrow(/two decimal places/);
    await expect(
      service.addTask(ctx(), PLAN_ID, { title: 'x', estimatedLabourHours: 0 }),
    ).rejects.toThrow(/greater than zero/);
  });

  it('clears a nullable field with null and REFUSES a wrong type', async () => {
    const { db, queries } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskUpdate, [{ id: TASK_ID }]],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await service.updateTask(ctx(), PLAN_ID, TASK_ID, { serviceBay: null });
    expect(queries.find((q) => Q.taskUpdate.test(q.text))?.text).toMatch(/service_bay = \$1/);

    // ⚠️ THE REGRESSION THE SUPERVISOR CAUGHT ON SLICE 3B'S FIX COMMIT. `optionalText`
    // returns null for anything that is not a string, so a number would reach
    // `set(column, null)` and ERASE the stored value. Under a COALESCE the same bad
    // type was a harmless no-op; giving null a destructive meaning turned a wrong type
    // from "nothing happens" into "the value is gone".
    const { db: db2 } = fakeDb([[Q.writable, [openRow()]]]);
    await expect(
      new RepairPlanService(db2, fakeAudit()).updateTask(ctx(), PLAN_ID, TASK_ID, {
        serviceBay: 12345 as unknown as string,
      }),
    ).rejects.toThrow(/serviceBay must be a string, or null to clear it/);
  });

  it('detaches a task from its fault with findingId: null', async () => {
    const { db, queries } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskUpdate, [{ id: TASK_ID }]],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await service.updateTask(ctx(), PLAN_ID, TASK_ID, { findingId: null });
    // A technician who attached a task to the wrong finding must be able to correct it
    // WITHOUT deleting the task and retyping its description — destroying the record
    // around a field in order to fix that field is the unreachable-alternative trap in
    // another costume.
    const update = queries.find((q) => Q.taskUpdate.test(q.text));
    expect(update?.text).toMatch(/finding_id = \$1/);
    expect(update?.values?.[0]).toBeNull();
    // ...and it must NOT be re-validated as a fault, which would 404 on null.
    expect(queries.some((q) => Q.findingCheck.test(q.text))).toBe(false);
  });

  it('reports a task update that matched nothing rather than reporting success', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskUpdate, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look successful.
    await expect(
      service.updateTask(ctx(), PLAN_ID, TASK_ID, { title: 'renamed' }),
    ).rejects.toThrow(/task not found on this repair plan/);
  });

  it('refuses every write once the plan is submitted', async () => {
    const { db } = fakeDb([[Q.writable, [openRow({ status: 'submitted' })]]]);
    const service = new RepairPlanService(db, fakeAudit());
    // A 409 rather than a 403: the caller holds the right to build plans, and what
    // refuses them is the state of THIS one. The message names the way forward.
    await expect(service.addTask(ctx(), PLAN_ID, { title: 'x' })).rejects.toThrow(
      /is submitted and cannot be changed; start a new repair plan/,
    );
  });
});

// ── the sequence ───────────────────────────────────────────────────────────

describe('moveTask — §28, "the technician defines the task sequence"', () => {
  it('swaps positions with the adjacent task', async () => {
    const { db, queries } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskLock, [{ id: TASK_ID, position: 3 }]],
      [Q.neighbour, [{ id: 'other-task', position: 2 }]],
      [Q.taskUpdate, [{ id: TASK_ID }]],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    await service.moveTask(ctx(), PLAN_ID, TASK_ID, 'up');

    const updates = queries.filter((q) => Q.taskUpdate.test(q.text));
    expect(updates).toHaveLength(2);
    // Positions cross — safe only because 014's unique constraint on
    // (plan_id, position) is DEFERRABLE INITIALLY DEFERRED.
    expect(updates[0]?.values?.[0]).toBe(2);
    expect(updates[1]?.values?.[0]).toBe(3);
  });

  it('says so rather than silently succeeding at the end of the list', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskLock, [{ id: TASK_ID, position: 1 }]],
      [Q.neighbour, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // A move that reports success while moving nothing is how a screen comes to show
    // an order the database does not have.
    await expect(service.moveTask(ctx(), PLAN_ID, TASK_ID, 'up')).rejects.toThrow(
      /already first in the sequence/,
    );
  });

  it('refuses a direction that is not up or down', async () => {
    const { db } = fakeDb([]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(service.moveTask(ctx(), PLAN_ID, TASK_ID, 'sideways')).rejects.toThrow(
      /direction must be one of: up, down/,
    );
  });
});

// ── resources ──────────────────────────────────────────────────────────────

describe('resources — §29', () => {
  it('refuses a task-scoped resource whose task is on another plan', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.taskOwns, []],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // The composite FK checks the tenant and organisation; it does NOT check the plan,
    // because a task and a resource in the same organisation satisfy it while
    // belonging to different jobs.
    await expect(
      service.addResource(ctx(), PLAN_ID, {
        resourceKind: 'part',
        name: 'coil',
        quantity: 1,
        taskId: TASK_ID,
      }),
    ).rejects.toThrow(/task not found on this repair plan/);
  });

  it('requires a quantity rather than defaulting to one', async () => {
    const { db } = fakeDb([[Q.writable, [openRow()]]]);
    const service = new RepairPlanService(db, fakeAudit());
    // Defaulting would be a guess about a number that ends up on a parts order.
    await expect(
      service.addResource(ctx(), PLAN_ID, { resourceKind: 'part', name: 'coil' }),
    ).rejects.toThrow(/quantity is required/);
  });

  it('refuses a resource kind outside §29s vocabulary', async () => {
    const { db } = fakeDb([[Q.writable, [openRow()]]]);
    const service = new RepairPlanService(db, fakeAudit());
    await expect(
      service.addResource(ctx(), PLAN_ID, {
        resourceKind: 'spaceship',
        name: 'x',
        quantity: 1,
      }),
    ).rejects.toThrow(/resourceKind must be one of/);
  });

  it('removes a resource entered in error while the plan is open', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.resourceDelete, [{ id: RESOURCE_ID }]],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, audit as never);
    await service.removeResource(ctx(), PLAN_ID, RESOURCE_ID);
    // A row that is gone leaves no other trace, so this audit entry is the only record
    // that it was ever there.
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('repair_plan.resource_removed');
  });
});

// ── submission ─────────────────────────────────────────────────────────────

describe('submit — §29.10', () => {
  it('refuses a plan with no tasks', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.tally, [{ total: 0, unestimated: 0, hours: 0 }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // Slice 3a shipped the mirror image of this: "is any checkpoint unanswered" is
    // FALSE for a sheet with no checkpoints, so an empty inspection submitted cleanly.
    // An empty plan is a supervisor asked to approve silence.
    await expect(service.submit(ctx(), PLAN_ID)).rejects.toThrow(
      /cannot be submitted with no tasks/,
    );
  });

  it('refuses an unestimated task and NAMES which', async () => {
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.tally, [{ total: 3, unestimated: 1, hours: 2 }]],
      [Q.unestimatedList, [{ position: 2, title: 'Bleed the brakes' }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // "Some tasks are unestimated" on a plan of fifteen is a sentence the technician
    // cannot act on. §29.8's estimate is what slice 5 multiplies by a labour rate, so a
    // missing one is a hole in the quotation.
    await expect(service.submit(ctx(), PLAN_ID)).rejects.toThrow(/2\. Bleed the brakes/);
  });

  it('records the unaddressed confirmed faults at the moment of submission', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.writable, [openRow()]],
      [Q.tally, [{ total: 2, unestimated: 0, hours: 3.5 }]],
      [Q.gap, [{ n: 1 }]],
      [Q.planUpdate, []],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, audit as never);
    await service.submit(ctx(), PLAN_ID);

    const event = audit.write.mock.calls[0]?.[2];
    expect(event?.action).toBe('repair_plan.submitted');
    // ⚠️ REPORTED, NOT REFUSED — and this is the design decision, so it is asserted.
    // A plan legitimately covers a SUBSET (a staged repair, a fault the customer will
    // take elsewhere). Refusing would push a technician into writing a fake task to
    // get past the gate, which manufactures record entries to satisfy a rule. The
    // number is put in front of the reviewer instead, and recorded here so the trail
    // shows what it was when they saw it.
    expect(event?.detail).toMatchObject({
      tasks: 2,
      estimatedLabourHours: 3.5,
      unaddressedConfirmedFaults: 1,
    });
  });
});

// ── review ─────────────────────────────────────────────────────────────────

describe('review — §30-§31 and 2.txt §563 independence', () => {
  it('refuses the SUBMITTER, whatever their role', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [{ ...openRow({ status: 'submitted' }), submitted_by: 'user-1' }]],
    ]);
    const service = new RepairPlanService(db, fakeAudit());
    // ⚠️ THE IDENTITY HALF. Role alone would let a supervisor who built the plan
    // themselves also sign it off; identity alone would let a technician sign a
    // colleague's. Both are needed and neither is sufficient.
    await expect(
      service.review(ctx({ activeRole: 'workshop_supervisor', userId: 'user-1' }), PLAN_ID, {
        decision: 'approved',
      }),
    ).rejects.toThrow(/you submitted this repair plan and cannot also review it/);
  });

  it('allows a different supervisor', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.reviewLookup, [{ ...openRow({ status: 'submitted' }), submitted_by: OTHER_USER }]],
      [Q.planUpdate, []],
      ...readHandlers(),
    ]);
    const service = new RepairPlanService(db, audit as never);
    await service.review(ctx({ activeRole: 'workshop_supervisor', userId: 'user-1' }), PLAN_ID, {
      decision: 'approved',
    });
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('repair_plan.approved');
  });

  it('requires a reason for a rejection', async () => {
    const { db } = fakeDb([]);
    const service = new RepairPlanService(db, fakeAudit());
    // §31's other verbs — "request additional test", "return to technician" — ARE this
    // sentence. A rejection without one loses the whole instruction.
    await expect(
      service.review(ctx({ activeRole: 'workshop_supervisor' }), PLAN_ID, {
        decision: 'rejected',
      }),
    ).rejects.toThrow(/a rejection must give a reason/);
  });

  it('refuses a plan that is not submitted, and one already answered', async () => {
    const { db } = fakeDb([[Q.reviewLookup, [openRow({ status: 'in_progress' })]]]);
    await expect(
      new RepairPlanService(db, fakeAudit()).review(
        ctx({ activeRole: 'workshop_supervisor' }),
        PLAN_ID,
        { decision: 'approved' },
      ),
    ).rejects.toThrow(/has not been submitted yet/);

    const { db: db2 } = fakeDb([[Q.reviewLookup, [openRow({ status: 'approved' })]]]);
    await expect(
      new RepairPlanService(db2, fakeAudit()).review(
        ctx({ activeRole: 'workshop_supervisor' }),
        PLAN_ID,
        { decision: 'rejected', note: 'no' },
      ),
    ).rejects.toThrow(/already approved and cannot be reviewed again/);
  });

  it('404s a plan outside the viewers scope rather than 403ing it', async () => {
    const { db } = fakeDb([[Q.reviewLookup, []]]);
    // The same non-oracle rule as every other read here.
    await expect(
      new RepairPlanService(db, fakeAudit()).review(
        ctx({ activeRole: 'workshop_supervisor' }),
        PLAN_ID,
        { decision: 'approved' },
      ),
    ).rejects.toThrow(/repair plan not found/);
  });
});

// ── what the record says ───────────────────────────────────────────────────

describe('the assembled record', () => {
  it('converts numeric columns to numbers and rounds the total', async () => {
    const { db } = fakeDb(
      readHandlers({
        tasks: [
          taskRow({ estimated_labour_hours: '0.10' }),
          taskRow({ id: 'b', position: 2, estimated_labour_hours: '0.20' }),
          taskRow({ id: 'c', position: 3, estimated_labour_hours: null }),
        ],
        faults: [faultRow(), faultRow({ id: 'f2', position: 2, task_count: 0 })],
      }),
    );
    const service = new RepairPlanService(db, fakeAudit());
    const plan = only(await service.list(ctx({ activeRole: 'workshop_manager' })));

    // ⚠️ `pg` RETURNS `numeric` AS A STRING, deliberately — a JS number cannot hold
    // every numeric value. Left as-is it would serialise as "0.10" and any arithmetic
    // in a screen would be string concatenation.
    expect(plan.tasks[0]?.estimatedLabourHours).toBe(0.1);
    // ...and 0.1 + 0.2 is 0.30000000000000004 in binary floating point. This number is
    // shown to a technician and multiplied by a labour rate in slice 5.
    expect(plan.totalEstimatedLabourHours).toBe(0.3);
    expect(plan.unestimatedTaskCount).toBe(1);
    // Derived, never stored: a stored copy is free to drift the moment a task changes.
    expect(plan.unaddressedFaultCount).toBe(1);
  });

  it('offers review only when BOTH conditions the write path checks hold', async () => {
    const submitted = (submittedBy: string | null) =>
      readHandlers({ header: [headerRow({ status: 'submitted', submitted_by: submittedBy })] });

    const mine = only(
      await new RepairPlanService(fakeDb(submitted('user-1')).db, fakeAudit()).list(
        ctx({ activeRole: 'workshop_supervisor', userId: 'user-1' }),
      ),
    );
    // A `reviewable: true` that the API then refuses is worse than no button.
    expect(mine.reviewable).toBe(false);

    const theirs = only(
      await new RepairPlanService(fakeDb(submitted(OTHER_USER)).db, fakeAudit()).list(
        ctx({ activeRole: 'workshop_supervisor', userId: 'user-1' }),
      ),
    );
    expect(theirs.reviewable).toBe(true);

    const asTech = only(
      await new RepairPlanService(fakeDb(submitted(OTHER_USER)).db, fakeAudit()).list(
        ctx({ activeRole: 'technician', userId: 'user-1' }),
      ),
    );
    expect(asTech.reviewable).toBe(false);
  });

  it('is not editable once it leaves in_progress', async () => {
    const plan = only(
      await new RepairPlanService(
        fakeDb(readHandlers({ header: [headerRow({ status: 'approved' })] })).db,
        fakeAudit(),
      ).list(ctx()),
    );
    expect(plan.editable).toBe(false);
  });

  it('splits materials from equipment for the quotation slice', async () => {
    const resource = (kind: string, id: string) => ({
      id,
      plan_id: PLAN_ID,
      task_id: null,
      position: 1,
      resource_kind: kind,
      name: 'thing',
      reference: null,
      quantity: '2.000',
      unit: 'each',
      note: null,
      recorded_by_name: null,
      recorded_at: new Date('2026-07-30T10:00:00Z'),
    });
    const plan = only(
      await new RepairPlanService(
        fakeDb(
          readHandlers({
            resources: [
              resource('part', '1'),
              resource('consumable', '2'),
              resource('lifting_equipment', '3'),
            ],
          }),
        ).db,
        fakeAudit(),
      ).list(ctx()),
    );
    // `07.txt` §9 prices "Parts" and "Consumables" as separate lines and does not price
    // the lift, so the split is part of the contract rather than a display choice.
    expect(plan.partCount).toBe(2);
    expect(plan.equipmentCount).toBe(1);
    expect(plan.resources[0]?.quantity).toBe(2);
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('repair-plan-rules matches what migration 014 actually applied', () => {
  /**
   * The migration text, found by walking UP the tree.
   *
   * The suite runs from `apps/api`, so a relative path would depend on the working
   * directory a runner happens to choose.
   */
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    // Fail loudly rather than skip: a silent skip lets the two drift while the suite
    // still reports green, which is the failure these tests exist to stop.
    expect(sqlPath, `could not locate ${name} to compare against`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }

  const SQL = () => migration('014_repair_plans.sql');

  /** Every quoted literal inside the first `IN (...)` after a column name. */
  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the four plan statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...REPAIR_PLAN_STATUSES].sort());
  });

  it('carries exactly §29s resource kinds', () => {
    expect(checkValues(SQL(), 'resource_kind')).toEqual([...RESOURCE_KINDS].sort());
  });

  it('labels every resource kind it offers', () => {
    // A kind with no label renders as a bare code on the screen — and the fallback
    // exists for RETIRED codes, not for ones the form still offers.
    for (const kind of RESOURCE_KINDS) {
      expect({ kind, label: resourceKindLabel(kind) }).not.toEqual({ kind, label: kind });
    }
  });

  it('keeps the review decisions a strict subset of the statuses', () => {
    // A reviewer can only move the record to a state the CHECK constraint allows.
    for (const decision of PLAN_REVIEW_DECISIONS) {
      expect(REPAIR_PLAN_STATUSES).toContain(decision);
    }
  });

  it('grants DELETE on both child tables and withholds it on the header', () => {
    const sql = SQL();
    // 013's whole lesson, applied up front. If a later migration ever re-revokes
    // these, `removeTask` and `removeResource` become unreachable escape hatches and
    // this test is what says so.
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON repair\.repair_plan_tasks/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON repair\.repair_plan_resources/);
    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_plans/);
  });

  it('FORCEs row-level security on all three tables, not merely ENABLEs it', () => {
    const sql = SQL();
    // ENABLE alone exempts the table owner, which is the role the app connects as —
    // isolation present and inert. Measured `t|t` after the apply; this stops a later
    // edit dropping the FORCE.
    for (const table of ['repair_plans', 'repair_plan_tasks', 'repair_plan_resources']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${table} FORCE\\s+ROW LEVEL SECURITY`));
    }
  });

  it('freezes the plan identity columns — migration 015, Codex HIGH', () => {
    // ⚠️ THE HOLE 014 LEFT, AND THE REASON IT MATTERED. `GRANT UPDATE` is on the whole
    // row, and 014's trigger only refused writes once the plan was SETTLED — so while a
    // plan was open, `UPDATE repair_plans SET diagnosis_id = <another>` succeeded. The
    // plan then presented diagnosis B's confirmed faults while its tasks referenced
    // diagnosis A's findings, and NO TASK ROW WAS WRITTEN, so neither
    // `assertFindingIsPlannable` nor `assert_task_finding_is_confirmed()` ever ran.
    // Confirmed by experiment against real Postgres before the fix, and proven refused
    // afterwards by verify/015_plan_identity_immutable.sql.
    //
    // The service has no path that writes these columns — `recordDetails` assembles its
    // SET list from four literals. This test guards the DATABASE rule, because "no
    // current caller does that" is exactly the reasoning this codebase rejected when it
    // made §1294 structural.
    const sql = migration('015_repair_plan_identity_immutable.sql');
    for (const column of ['diagnosis_id', 'job_card_id', 'attempt_no']) {
      expect(sql).toMatch(new RegExp(`NEW\\.${column} IS DISTINCT FROM OLD\\.${column}`));
    }
    expect(sql).toMatch(/NEW\.tenant_id IS DISTINCT FROM OLD\.tenant_id/);
    // `IS DISTINCT FROM`, never a column-presence check: an ordinary save that mentions
    // a column with its own value must NOT be refused, or every edit breaks.
    expect(sql).not.toMatch(/TG_ARGV|column_name/);
  });

  it('keeps the task position constraint DEFERRABLE, which moveTask depends on', () => {
    // A plain unique constraint makes the first UPDATE of a swap collide with the
    // neighbour's existing position, so §28's reordering would 500. The dependency is
    // invisible from `moveTask` alone, hence this test.
    expect(SQL()).toMatch(
      /uq_plan_task_position UNIQUE \(plan_id, position\) DEFERRABLE INITIALLY DEFERRED/,
    );
  });
});
