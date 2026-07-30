import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionService } from './execution.service';
import {
  CAN_EXECUTE_REPAIR,
  CAN_READ_EXECUTION,
  EVIDENCE_KINDS,
  EXECUTION_STATUSES,
  EXECUTION_TASK_STATUSES,
  READINESS_CHECKS,
  TIME_ENTRY_KINDS,
  evidenceKindLabel,
  timeEntryKindLabel,
} from './execution-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Repair execution — Phase 5, slice 7.
 *
 * UNIT tests over a fake client. They assert the role boundaries, the mandatory
 * reasons, and the completion gates — the rules a database cannot express.
 *
 * ⚠️ THE CLOCK IS NOT PROVEN HERE. Durations are arithmetic over real timestamps, and
 * a fake client can return whatever it likes; `probe-execution.mjs` measures them
 * against real Postgres. That probe also caught a defect this file could never have
 * seen: `CASE WHEN $3 THEN $4 ELSE NULL END` made Postgres infer the parameter as TEXT,
 * so every task status change 500'd on a `uuid` column. Both layers are required.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const EXEC_ID = 'dddddddd-eeee-ffff-0000-111111111111';
const TASK_ID = '31313131-4242-5353-6464-757575757575';
const PROPOSAL_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

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
  stage: 'authorized_to_start',
  ...over,
});

const openRow = (over: Record<string, unknown> = {}) => ({
  id: EXEC_ID,
  status: 'in_progress',
  attempt_no: 1,
  service_bay: 'Bay 2',
  job_number: 'JC-000003',
  stage: 'repair_in_progress',
  ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: EXEC_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  registration_number: 'GR 4821-22',
  proposal_id: PROPOSAL_ID,
  proposal_version_no: 1,
  attempt_no: 1,
  status: 'in_progress',
  customer_approval_confirmed: false,
  parts_available_confirmed: false,
  tools_available_confirmed: false,
  bay_available_confirmed: false,
  safety_confirmed: false,
  readiness_note: null,
  service_bay: 'Bay 2',
  started_at: new Date('2026-07-30T09:00:00Z'),
  completed_at: null,
  completion_note: null,
  unexpected_findings: null,
  started_by_name: 'A. Technician',
  completed_by_name: null,
  ...over,
});

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  execution_id: EXEC_ID,
  position: 1,
  repair_plan_task_id: 'plan-task-1',
  status: 'pending',
  status_note: null,
  completed_at: null,
  title: 'Replace ignition coil',
  // ⚠️ STRINGS — `pg` returns numeric as text.
  estimated_labour_hours: '1.50',
  finding_description: 'Cylinder 1 misfire',
  completed_by_name: null,
  worked_seconds: '0',
  ...over,
});

const timeRow = (over: Record<string, unknown> = {}) => ({
  id: 'time-1',
  execution_id: EXEC_ID,
  execution_task_id: TASK_ID,
  entry_kind: 'productive',
  service_bay: 'Bay 2',
  repair_stage: 'repair_in_progress',
  started_at: new Date('2026-07-30T09:00:00Z'),
  ended_at: new Date('2026-07-30T10:30:00Z'),
  note: null,
  technician_name: 'A. Technician',
  seconds: '5400',
  ...over,
});

const Q = {
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  open: /FOR UPDATE OF e/,
  header: /LEFT JOIN identity\.users cb ON cb\.id = e\.completed_by/,
  tasks: /FROM repair\.execution_tasks et/,
  times: /FROM repair\.execution_time_entries te/,
  parts: /FROM repair\.execution_parts_used p/,
  evidence: /FROM repair\.execution_evidence ev/,
  openCheck: /status = 'in_progress'\s+ORDER BY attempt_no DESC/,
  approvedProposal: /FROM repair\.repair_proposals pr/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  execInsert: /INSERT INTO repair\.repair_executions/,
  taskSeed: /INSERT INTO repair\.execution_tasks/,
  taskUpdate: /UPDATE repair\.execution_tasks/,
  timeInsert: /INSERT INTO repair\.execution_time_entries/,
  timeClose: /UPDATE repair\.execution_time_entries/,
  execUpdate: /UPDATE repair\.repair_executions/,
  taskOwns: /SELECT 1 FROM repair\.execution_tasks/,
  position: /COALESCE\(max\(position\)/,
  partInsert: /INSERT INTO repair\.execution_parts_used/,
  evidenceInsert: /INSERT INTO repair\.execution_evidence/,
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
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work(client),
      ),
    } as never,
  };
}

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

const readHandlers = (
  over: { header?: unknown[]; tasks?: unknown[]; times?: unknown[] } = {},
): Array<[RegExp, unknown[]]> => [
  [Q.header, over.header ?? [headerRow()]],
  [Q.tasks, over.tasks ?? []],
  [Q.times, over.times ?? []],
  [Q.parts, []],
  [Q.evidence, []],
];

function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected one row, received ${rows.length}`);
  return first;
}

// ── roles ──────────────────────────────────────────────────────────────────

describe('execution roles — 07.txt pt2 §50', () => {
  it('refuses reception and the QC inspector, and admits the technician', async () => {
    const service = () => new ExecutionService(fakeDb([]).db, fakeAudit());
    await expect(service().start(ctx({ activeRole: 'reception_staff' }), CARD_ID)).rejects.toThrow(
      /may not carry out a repair/,
    );
    // ⚠️ §563's independence, structural: somebody who carried out the repair cannot be
    // the independent check on it, and slice 9 depends on that separation being real.
    await expect(
      service().start(ctx({ activeRole: 'quality_control_inspector' }), CARD_ID),
    ).rejects.toThrow(/may not carry out a repair/);
    expect(CAN_EXECUTE_REPAIR.has('technician')).toBe(true);
    // ...but the QC inspector READS it — that is what they inspect.
    expect(CAN_READ_EXECUTION.has('quality_control_inspector')).toBe(true);
  });

  it('narrows a technician to their own assigned cards', async () => {
    const { db, queries } = fakeDb(readHandlers());
    await new ExecutionService(db, fakeAudit()).list(ctx({ userId: 't9' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
  });
});

// ── starting ───────────────────────────────────────────────────────────────

describe('start — §7 and §32', () => {
  it('refuses a card that has not reached the authorised stage', async () => {
    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'awaiting_customer_approval' })]]]);
    await expect(new ExecutionService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /may only be started while the job card is at/,
    );
  });

  it('⚠️ refuses when the customer has approved nothing, naming a reachable route', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedProposal, []],
    ]);
    // §7 — "repair work shall not start until the required approval is received."
    await expect(new ExecutionService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /customer has approved a proposal.*Customer\s+Proposals screen/s,
    );
  });

  it('seeds one task per APPROVED plan task, from the plan the customer agreed to', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedProposal, [{ id: PROPOSAL_ID, version_no: 1, repair_plan_id: PLAN_ID }]],
      [Q.attempt, [{ n: 1 }]],
      [Q.execInsert, [{ id: EXEC_ID }]],
      [Q.taskSeed, [{ id: 't1' }, { id: 't2' }]],
      ...readHandlers(),
    ]);
    await new ExecutionService(db, fakeAudit()).start(ctx(), CARD_ID);
    // §5 has the technician follow the APPROVED procedure — the work list is not
    // something a caller composes, so it is seeded from the plan by id.
    const seed = queries.find((q) => Q.taskSeed.test(q.text));
    expect(seed?.values?.[4]).toBe(PLAN_ID);
    expect(queries.find((q) => Q.execInsert.test(q.text))?.values?.[3]).toBe(PROPOSAL_ID);
  });

  it('refuses a second repair while one is open', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, [{ id: EXEC_ID, status: 'in_progress' }]],
    ]);
    await expect(new ExecutionService(db, fakeAudit()).start(ctx(), CARD_ID)).rejects.toThrow(
      /already has a repair in progress/,
    );
  });
});

// ── tasks ──────────────────────────────────────────────────────────────────

describe('task status — §6', () => {
  it('requires a reason for blocked and for not-required, with different wording', async () => {
    const service = () => new ExecutionService(fakeDb([[Q.open, [openRow()]]]).db, fakeAudit());
    await expect(
      service().setTaskStatus(ctx(), EXEC_ID, TASK_ID, { status: 'blocked' }),
    ).rejects.toThrow(/cannot be unblocked by anyone else/);
    // Different sentence, because the two lead to different conversations: one is
    // somebody else's to fix, the other is work the customer paid for and is not
    // getting.
    await expect(
      service().setTaskStatus(ctx(), EXEC_ID, TASK_ID, { status: 'skipped' }),
    ).rejects.toThrow(/the customer approved it/);
  });

  it('⚠️ casts the completer to uuid — the defect the live probe caught', async () => {
    const { db, queries } = fakeDb([
      [Q.open, [openRow()]],
      [Q.taskUpdate, [{ id: TASK_ID }]],
      ...readHandlers(),
    ]);
    await new ExecutionService(db, fakeAudit()).setTaskStatus(ctx(), EXEC_ID, TASK_ID, {
      status: 'completed',
    });
    const sql = queries.find((q) => Q.taskUpdate.test(q.text))?.text ?? '';
    // Inside a CASE whose other branch is a bare NULL, Postgres infers the parameter as
    // TEXT and the assignment to a uuid column fails at RUNTIME — a 500 on every task
    // update that typecheck, lint and a fake client all accept. This assertion is the
    // only thing in the unit suite that would notice the cast being removed.
    expect(sql).toMatch(/completed_by = CASE WHEN \$3 THEN \$4::uuid ELSE NULL END/);
  });

  it('reports a status change that matched nothing', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      [Q.taskUpdate, []],
    ]);
    await expect(
      new ExecutionService(db, fakeAudit()).setTaskStatus(ctx(), EXEC_ID, TASK_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(/task not found on this repair/);
  });

  it('refuses every write once the repair is finished', async () => {
    const { db } = fakeDb([[Q.open, [openRow({ status: 'completed' })]]]);
    await expect(
      new ExecutionService(db, fakeAudit()).setTaskStatus(ctx(), EXEC_ID, TASK_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(/is completed and its record cannot be changed/);
  });
});

// ── the clock ──────────────────────────────────────────────────────────────

describe('time recording — §33', () => {
  it('requires a note for non-productive time', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    await expect(
      new ExecutionService(db, fakeAudit()).startTimeEntry(ctx(), EXEC_ID, {
        entryKind: 'waiting_for_parts',
      }),
    ).rejects.toThrow(/cannot be chased/);
  });

  it('⚠️ closes whatever this technician had running before opening a new entry', async () => {
    const { db, queries } = fakeDb([
      [Q.open, [openRow()]],
      [Q.timeClose, [{ id: 'x' }]],
      [Q.timeInsert, []],
      ...readHandlers(),
    ]);
    await new ExecutionService(db, fakeAudit()).startTimeEntry(ctx(), EXEC_ID, {
      entryKind: 'productive',
    });
    // Otherwise pressing "waiting for parts" while the clock runs books the same
    // minutes twice — and 019's partial unique index would refuse it as a 500.
    const close = queries.findIndex((q) => Q.timeClose.test(q.text));
    const insert = queries.findIndex((q) => Q.timeInsert.test(q.text));
    expect(close).toBeGreaterThanOrEqual(0);
    expect(close).toBeLessThan(insert);
  });

  it('copies the job stage onto the entry — §33 links time to the repair stage', async () => {
    const { db, queries } = fakeDb([
      [Q.open, [openRow({ stage: 'repair_in_progress' })]],
      [Q.timeClose, []],
      [Q.timeInsert, []],
      ...readHandlers(),
    ]);
    await new ExecutionService(db, fakeAudit()).startTimeEntry(ctx(), EXEC_ID, {
      entryKind: 'productive',
    });
    // A COPY on purpose: the stage moves on, and "what stage was this booked against"
    // cannot be answered later from a value that has since changed.
    expect(queries.find((q) => Q.timeInsert.test(q.text))?.values?.[7]).toBe('repair_in_progress');
  });

  it('says so when a Pause pauses nothing', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      [Q.timeClose, []],
    ]);
    // A Pause reported as success leaves the technician believing the clock stopped.
    await expect(
      new ExecutionService(db, fakeAudit()).stopTimeEntry(ctx(), EXEC_ID),
    ).rejects.toThrow(/no running time entry/);
  });

  it('counts productive and non-productive separately, and leaves a running entry undated', async () => {
    const { db } = fakeDb(
      readHandlers({
        times: [
          timeRow(),
          timeRow({ id: 't2', entry_kind: 'waiting_for_parts', seconds: '1800', note: 'coil' }),
          timeRow({ id: 't3', ended_at: null, seconds: null }),
        ],
      }),
    );
    const e = only(await new ExecutionService(db, fakeAudit()).list(ctx()));
    expect(e.productiveHours).toBe(1.5);
    expect(e.nonProductiveHours).toBe(0.5);
    // A duration for an unfinished interval is a number that changes every time
    // somebody looks at it.
    expect(e.timeEntries.find((t) => t.id === 't3')?.hours).toBeNull();
    expect(e.runningEntryCount).toBe(1);
  });
});

// ── completion ─────────────────────────────────────────────────────────────

describe('complete — §13', () => {
  it('refuses while approved tasks are unfinished, and NAMES them', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({ tasks: [taskRow({ status: 'pending', title: 'Bleed the brakes' })] }),
    ]);
    await expect(new ExecutionService(db, fakeAudit()).complete(ctx(), EXEC_ID, {})).rejects.toThrow(
      /Bleed the brakes/,
    );
  });

  it('permits a task marked not required — it carries a mandatory reason', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({ tasks: [taskRow({ status: 'skipped', status_note: 'not needed' })] }),
      [Q.execUpdate, []],
    ]);
    await expect(
      new ExecutionService(db, fakeAudit()).complete(ctx(), EXEC_ID, {}),
    ).resolves.toBeTruthy();
  });

  it('⚠️ refuses while somebody is still clocked on', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({
        tasks: [taskRow({ status: 'completed' })],
        times: [timeRow({ ended_at: null, seconds: null })],
      }),
    ]);
    // Completing underneath a running clock loses the end of somebody's shift.
    await expect(new ExecutionService(db, fakeAudit()).complete(ctx(), EXEC_ID, {})).rejects.toThrow(
      /still running/,
    );
  });

  it('does NOT compare booked time to the estimate — §33 forbids depending on it', async () => {
    const { db } = fakeDb([
      [Q.open, [openRow()]],
      ...readHandlers({
        // Ten minutes booked against a 1.5 hour estimate. Completion must still succeed:
        // §33 says the system shall not depend entirely on manual time records, and a
        // repair refused because somebody forgot to press Pause teaches everyone to stop
        // using the clock.
        tasks: [taskRow({ status: 'completed', worked_seconds: '600' })],
        times: [timeRow({ seconds: '600' })],
      }),
      [Q.execUpdate, []],
    ]);
    await expect(
      new ExecutionService(db, fakeAudit()).complete(ctx(), EXEC_ID, {}),
    ).resolves.toBeTruthy();
  });
});

// ── evidence ───────────────────────────────────────────────────────────────

describe('evidence — §8-§9', () => {
  it('refuses a measurement with no reading', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    // A measurement with no value is an observation, and calling it a measurement makes
    // the record claim a precision nobody has.
    await expect(
      new ExecutionService(db, fakeAudit()).recordEvidence(ctx(), EXEC_ID, {
        evidenceKind: 'measurement', description: 'coil resistance',
      }),
    ).rejects.toThrow(/an observation/);
  });

  it('requires a quantity on a part, never defaulting it', async () => {
    const { db } = fakeDb([[Q.open, [openRow()]]]);
    await expect(
      new ExecutionService(db, fakeAudit()).recordPartUsed(ctx(), EXEC_ID, { description: 'coil' }),
    ).rejects.toThrow(/quantity is required/);
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('execution-rules matches what migration 019 applied', () => {
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
  const SQL = () => migration('019_repair_execution.sql');

  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the three execution statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...EXECUTION_STATUSES].sort());
  });

  it('carries exactly the five task statuses', () => {
    // `status` matches the header's CHECK first, so the task list is read from its own.
    const sql = SQL();
    const body = /CHECK \(status IN \('pending'([\s\S]*?)\)\)/.exec(sql)?.[0] ?? '';
    const values = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
    expect(values).toEqual([...EXECUTION_TASK_STATUSES].sort());
  });

  it('carries exactly §33s time categories, and labels each', () => {
    expect(checkValues(SQL(), 'entry_kind')).toEqual([...TIME_ENTRY_KINDS].sort());
    for (const k of TIME_ENTRY_KINDS) {
      expect({ k, label: timeEntryKindLabel(k) }).not.toEqual({ k, label: k });
    }
  });

  it('carries exactly §8-§9s evidence kinds, and labels each', () => {
    expect(checkValues(SQL(), 'evidence_kind')).toEqual([...EVIDENCE_KINDS].sort());
    for (const k of EVIDENCE_KINDS) {
      expect({ k, label: evidenceKindLabel(k) }).not.toEqual({ k, label: k });
    }
  });

  it('declares a column for each of §32s five confirmations', () => {
    const sql = SQL();
    expect(READINESS_CHECKS).toHaveLength(5);
    for (const c of READINESS_CHECKS) {
      expect(sql).toMatch(new RegExp(`${c.column}\\s+boolean NOT NULL DEFAULT false`));
    }
  });

  it('⚠️ enforces ONE RUNNING TIME ENTRY per technician per job, in the database', () => {
    // A partial unique index rather than a service check: declarative, atomic under
    // concurrency, and two people pressing Start on the same phone twice is exactly the
    // race a service-layer check loses.
    expect(SQL()).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?uq_one_running_entry_per_technician[\s\S]*?WHERE ended_at IS NULL/,
    );
  });

  it('refuses time that runs backwards', () => {
    expect(SQL()).toMatch(/CONSTRAINT time_entry_ends_after_start CHECK/);
  });

  it('makes the authorisation structural, not a checkbox', () => {
    const sql = SQL();
    // §7 as a foreign key plus a trigger. The five confirmations are recorded as well,
    // but they are an acknowledgement — modelling only them would make unauthorised work
    // a data-entry mistake rather than an impossibility.
    expect(sql).toMatch(/proposal_id\s+uuid NOT NULL/);
    expect(sql).toMatch(/assert_execution_is_authorised/);
    expect(sql).toMatch(/rather than approved by the customer/);
  });

  it('grants DELETE on the children and withholds it on the header', () => {
    const sql = SQL();
    for (const t of ['execution_tasks', 'execution_time_entries', 'execution_parts_used', 'execution_evidence']) {
      expect(sql).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON repair\\.${t}`));
    }
    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_executions/);
  });

  it('FORCEs row-level security on all five tables', () => {
    const sql = SQL();
    for (const t of [
      'repair_executions', 'execution_tasks', 'execution_time_entries',
      'execution_parts_used', 'execution_evidence',
    ]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t}\\s+FORCE\\s+ROW LEVEL SECURITY`));
    }
  });
});
