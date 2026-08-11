import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JobCardService } from './job-card.service';
import {
  BOARD_COLUMNS,
  ROLE_TARGET_STAGES,
  STAGES,
  STAGE_TRANSITIONS,
  type Stage,
} from './job-card-stages';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Stage transitions — `02.txt` §29 and `1.txt` §394.
 *
 * §394 is the requirement this file exists for: "The repair staging board shall
 * enforce transition rules. A technician must not manually bypass required
 * approval, payment, parts or quality-control states without an authorized,
 * logged override."
 *
 * ⚠️ EVERY BYPASS TEST SATISFIES THE OTHER RULE, DELIBERATELY. `changeStage`
 * makes two independent checks — may this ROLE produce this stage
 * (`ROLE_TARGET_STAGES`), and may the CARD go there from where it is
 * (`STAGE_TRANSITIONS`). A test that violated both would still pass if either
 * check were deleted, and would therefore guard neither. So the role tests use
 * a LEGAL transition, and the lifecycle tests use a role that IS allowed the
 * target stage. Each test can only be satisfied by the rule it names.
 *
 * Local fakes rather than shared ones: `core.spec.ts`, `identity.spec.ts` and
 * `repair.spec.ts` each carry their own, and a stage test needs the client to
 * answer by QUERY rather than return one fixed set of rows.
 */

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'workshop_manager',
  hasPlatformGrant: false,
  correlationId: 'corr-1',
  ...over,
});

const CARD_ID = '99999999-8888-7777-6666-555555555555';

/** The row the final re-read returns. Only its shape matters here. */
const readBack = {
  id: CARD_ID,
  job_number: 'JC-000001',
  customer_id: 'c1',
  customer_name: 'Kwame Mensah',
  vehicle_id: 'v1',
  registration_number: 'GR 4821-22',
  make: 'Toyota',
  model: null,
  model_year: 2018,
  complaint: 'Brakes squealing.',
  stage: 'initial_inspection',
  priority: 'high',
  assigned_technician_id: null,
  technician_name: null,
  expected_completion_on: null,
  mileage_at_intake: 84500,
  opened_at: new Date('2026-07-28T00:00:00Z'),
  stage_changed_at: new Date('2026-07-28T00:00:00Z'),
  closed_at: null,
  resume_stage: null,
};

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

/**
 * A client that answers the three queries `changeStage` makes: the locked read,
 * the on-hold history lookup, and the re-read at the end.
 *
 * `heldFrom` is the stage the history says the card was at before a hold —
 * `undefined` means no history at all, which is the case the resume logic must
 * refuse rather than treat as "anywhere".
 */
function stageDb(stage: string, heldFrom?: string) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (/FOR UPDATE OF j/.test(text)) {
        return { rows: [{ id: CARD_ID, stage, job_number: 'JC-000001' }] };
      }
      // ⚠️ MUST match the history SELECT and NOT the main read. Once the read
      // gained its LATERAL join, a loose `/FROM repair.job_card_stage_events/`
      // matched BOTH — so the final re-read was answered with `{to_stage}` and
      // every successful move died in `toDomain`. Anchored on the projection,
      // which only the history query has.
      if (/SELECT to_stage\s+FROM repair\.job_card_stage_events/.test(text)) {
        return { rows: heldFrom ? [{ to_stage: heldFrom }] : [] };
      }
      return { rows: [{ ...readBack, stage }] };
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

const changed = (queries: Array<{ text: string }>) =>
  queries.some((q) => /UPDATE repair\.job_cards/.test(q.text));

describe('changeStage — the happy path still works', () => {
  it('moves a card along a legal transition and logs it as ordinary', async () => {
    const { db, queries } = stageDb('vehicle_received');
    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
      toStage: 'initial_inspection',
    });

    const update = queries.find((q) => /UPDATE repair\.job_cards/.test(q.text));
    expect(update?.values?.[0]).toBe('initial_inspection');

    // The history row is written in the SAME transaction as the move, so a
    // stage can never change without leaving a record that it did.
    const event = queries.find((q) => /INSERT INTO repair\.job_card_stage_events/.test(q.text));
    expect(event?.values?.[3]).toBe('vehicle_received'); // from
    expect(event?.values?.[4]).toBe('initial_inspection'); // to
    expect(event?.values?.[5]).toBe(false); // is_override
    expect(event?.values?.[6]).toBeNull(); // no reason, because no override
  });

  it('takes the row lock BEFORE judging the transition', async () => {
    // Without FOR UPDATE, a supervisor passing QC and a technician sending the
    // job back both read `testing`, both find their move legal, and the second
    // write wins silently — leaving a history with two exits from one stage.
    const { db, queries } = stageDb('testing');
    await new JobCardService(db, fakeAudit()).changeStage(
      ctx({ activeRole: 'workshop_supervisor' }),
      CARD_ID,
      { toStage: 'quality_control' },
    );
    expect(queries[0]?.text).toMatch(/FOR UPDATE OF j/);
  });

  it('closes the card when it reaches completed, and clears it otherwise', async () => {
    const { db, queries } = stageDb('ready_for_collection');
    await new JobCardService(db, fakeAudit()).changeStage(
      ctx({ activeRole: 'reception_staff' }),
      CARD_ID,
      { toStage: 'completed' },
    );
    const update = queries.find((q) => /UPDATE repair\.job_cards/.test(q.text));
    expect(update?.text).toMatch(/WHEN \$1 = 'completed'\s+THEN COALESCE\(closed_at, now\(\)\)/);
  });

  it('KEEPS the completion date when the card moves to warranty follow-up', async () => {
    // Supervisor finding on this slice. `warranty_follow_up` is the only stage
    // reachable from `completed`, so an `ELSE NULL` branch meant the normal next
    // move erased the completion date and returned a finished job to the open
    // work list. Codex did not flag this one.
    const { db, queries } = stageDb('completed');
    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
      toStage: 'warranty_follow_up',
    });
    const update = queries.find((q) => /UPDATE repair\.job_cards/.test(q.text));
    expect(update?.text).toMatch(/WHEN \$1 = 'warranty_follow_up' THEN closed_at/);
    expect(update?.values?.[0]).toBe('warranty_follow_up');
  });
});

describe('changeStage — the four states §394 forbids a technician to bypass', () => {
  for (const [from, to, what] of [
    ['quotation_preparation', 'authorized_to_start', 'customer approval'],
    ['awaiting_deposit', 'repair_in_progress', 'payment'],
    ['awaiting_parts', 'repair_in_progress', 'parts'],
    ['testing', 'ready_for_collection', 'quality control'],
  ] as const) {
    it(`refuses a technician bypassing ${what}`, async () => {
      const { db, queries } = stageDb(from);
      await expect(
        new JobCardService(db, fakeAudit()).changeStage(
          ctx({ activeRole: 'technician', userId: 'tech-9' }),
          CARD_ID,
          { toStage: to },
        ),
      ).rejects.toThrow();
      expect(changed(queries)).toBe(false);
    });
  }

  it('refuses a technician quality_control even from testing, its LEGAL predecessor', async () => {
    // Isolates the ROLE check: `testing -> quality_control` is a legal
    // transition, so only `ROLE_TARGET_STAGES` can refuse this. Delete that
    // check and this test fails while every lifecycle test still passes.
    const { db } = stageDb('testing');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(ctx({ activeRole: 'technician' }), CARD_ID, {
        toStage: 'quality_control',
      }),
    ).rejects.toThrow(/may not move a job card to 'quality_control'/);
  });

  it('refuses a MANAGER an illegal transition, though the role allows that stage', async () => {
    // Isolates the LIFECYCLE check, the same argument in reverse: a manager may
    // produce `ready_for_collection`, just not from `vehicle_received`.
    const { db } = stageDb('vehicle_received');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
        toStage: 'ready_for_collection',
      }),
    ).rejects.toThrow(/requires 'overrideReason'/);
  });
});

describe('changeStage — the override is authorized AND logged', () => {
  it('lets an owner skip the sequence when a reason is given, and marks it', async () => {
    const { db, queries } = stageDb('vehicle_received');
    await new JobCardService(db, fakeAudit()).changeStage(
      ctx({ activeRole: 'workshop_owner' }),
      CARD_ID,
      {
        toStage: 'ready_for_collection',
        overrideReason: 'Customer collected the vehicle unrepaired; job abandoned.',
      },
    );
    const event = queries.find((q) => /INSERT INTO repair\.job_card_stage_events/.test(q.text));
    expect(event?.values?.[5]).toBe(true);
    expect(event?.values?.[6]).toMatch(/abandoned/);
  });

  it('refuses an override with NO reason — the log is the whole point', async () => {
    const { db, queries } = stageDb('vehicle_received');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'workshop_owner' }),
        CARD_ID,
        { toStage: 'completed' },
      ),
    ).rejects.toThrow(/requires 'overrideReason'/);
    expect(changed(queries)).toBe(false);
  });

  it('refuses an override to a role that does not hold the authority', async () => {
    // §394 says "AUTHORIZED, logged override" — a supervisor runs the technical
    // workflow but cannot declare that a gate did not need to happen.
    const { db, queries } = stageDb('repair_in_progress');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'workshop_supervisor' }),
        CARD_ID,
        { toStage: 'quality_control', overrideReason: 'looks fine to me' },
      ),
    ).rejects.toThrow(/Only a workshop owner or manager may override/);
    expect(changed(queries)).toBe(false);
  });

  it('does NOT let an override widen what the ROLE may produce', async () => {
    // Ordering matters: the role check runs first, so an override can relax the
    // lifecycle and never §50's role summary.
    const { db } = stageDb('quality_control');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'workshop_supervisor' }),
        CARD_ID,
        { toStage: 'ready_for_collection', overrideReason: 'signed off verbally' },
      ),
    ).rejects.toThrow(/may not move a job card to/);
  });

  it('names an override distinctly in the audit trail', async () => {
    const { db } = stageDb('vehicle_received');
    const audit = fakeAudit();
    await new JobCardService(db, audit).changeStage(ctx({ activeRole: 'workshop_owner' }), CARD_ID, {
      toStage: 'completed',
      overrideReason: 'Vehicle written off by the insurer.',
    });
    const detail = (audit as unknown as { write: { mock: { calls: unknown[][] } } }).write.mock
      .calls[0]?.[2] as { action: string };
    // A reviewer hunting for skipped gates filters on this action.
    expect(detail.action).toBe('job_card.stage_overridden');
  });
});

describe('changeStage — who may not touch a stage at all', () => {
  it('refuses a CUSTOMER before the database is touched', async () => {
    const { db, queries } = stageDb('complaint_received');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'customer', userId: 'cust-9' }),
        CARD_ID,
        { toStage: 'vehicle_received' },
      ),
    ).rejects.toThrow(/may not change a job card stage/);
    expect(queries).toHaveLength(0);
  });

  it('404s a technician moving a card not assigned to them', async () => {
    // The scoped SELECT returns nothing. 404 and not 403, so this endpoint is
    // not an existence oracle for the cards a technician cannot see.
    const queries: Array<{ text: string }> = [];
    const db = {
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work({
          query: vi.fn(async (text: string) => {
            queries.push({ text });
            return { rows: [] };
          }),
        }),
      ),
    } as never;
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'technician', userId: 'tech-9' }),
        CARD_ID,
        { toStage: 'initial_inspection' },
      ),
    ).rejects.toThrow(/job card not found/);
    expect(changed(queries)).toBe(false);
  });

  it('rejects a no-op instead of resetting the stage clock', async () => {
    const { db, queries } = stageDb('testing');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, { toStage: 'testing' }),
    ).rejects.toThrow(/already at 'testing'/);
    // Accepting it would reset `stage_changed_at` and hide a stalled card behind
    // a fresh timestamp — exactly what migration 007 exists to prevent.
    expect(changed(queries)).toBe(false);
  });

  it('rejects a stage outside the CHECK constraint', async () => {
    const { db } = stageDb('testing');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, { toStage: 'road_tested' }),
    ).rejects.toThrow(/toStage must be one of/);
  });
});

describe('changeStage — a hold cannot launder a card past a gate', () => {
  it('resumes a held card to the stage it was held at', async () => {
    const { db, queries } = stageDb('on_hold', 'diagnosis_in_progress');
    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
      toStage: 'diagnosis_in_progress',
    });
    expect(queries.find((q) => /UPDATE repair\.job_cards/.test(q.text))?.values?.[0]).toBe(
      'diagnosis_in_progress',
    );
  });

  it('lets a resumed card continue forward from where it paused', async () => {
    // A hold costs time; it does not undo the work already done.
    const { db, queries } = stageDb('on_hold', 'diagnosis_in_progress');
    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
      toStage: 'solution_preparation',
    });
    expect(changed(queries)).toBe(true);
  });

  it('WILL NOT let a hold carry a card past quality control', async () => {
    // THE REASON THE HISTORY TABLE EXISTS. If `on_hold` simply listed every
    // stage as a legal exit, this is the bypass: park a job on hold during
    // repair, resume it straight into `ready_for_collection`, and quality
    // control never happened — without ever tripping the override §394 requires.
    const { db, queries } = stageDb('on_hold', 'repair_in_progress');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'quality_control_inspector' }),
        CARD_ID,
        { toStage: 'ready_for_collection' },
      ),
    ).rejects.toThrow(/Permitted:/);
    expect(changed(queries)).toBe(false);
  });

  it('survives a history row carrying an unrecognised stage', async () => {
    // Codex MEDIUM, accepted. Before migration 009 the stage columns were plain
    // TEXT, so one bad row made `...STAGE_TRANSITIONS[resumeStage]` a spread of
    // `undefined` — a THROW, which is a 500 on the staging board for every
    // viewer until someone found the row. It must refuse, not crash.
    // A NON-overriding role, so the refusal is the lifecycle's ("Permitted:
    // none") rather than the override prompt a manager would get. The manager
    // path is correct too — it offers an override — but it would not show that
    // the unrecognised stage collapsed the options to nothing.
    const { db, queries } = stageDb('on_hold', 'road_tested');
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'workshop_supervisor' }),
        CARD_ID,
        { toStage: 'testing' },
      ),
    ).rejects.toThrow(/Permitted: none/);
    expect(changed(queries)).toBe(false);
  });

  it('permits NOTHING from a held card with no history, rather than everything', async () => {
    const { db } = stageDb('on_hold', undefined);
    await expect(
      new JobCardService(db, fakeAudit()).changeStage(
        ctx({ activeRole: 'workshop_supervisor' }),
        CARD_ID,
        { toStage: 'testing' },
      ),
    ).rejects.toThrow(/Permitted: none/);
  });
});

describe('the rule tables themselves', () => {
  it('transcribes EXACTLY the stages the CHECK constraint allows', async () => {
    // Migration 006 is the authority and this module is a transcription of it.
    // A transcription that has drifted is worse than no list at all: it would
    // reject a legal stage, or offer one the database will refuse.
    // Walk up from the working directory rather than resolving a fixed number
    // of `..` segments: this suite is run both from `apps/api` and from the
    // repo root, and a path that is right in one is silently wrong in the other.
    // `import.meta.url` is not an option — the API compiles to CommonJS and tsc
    // rejects it (TS1343).
    let dir = resolve(process.cwd());
    let sqlPath = '';
    for (;;) {
      const candidate = join(dir, 'infrastructure/migrations/006_repair_job_cards.sql');
      if (existsSync(candidate)) {
        sqlPath = candidate;
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fail loudly. A silent skip here would let the two lists drift apart while
    // the suite still reported green — the exact failure this test prevents.
    expect(sqlPath, 'could not locate migration 006 to compare against').not.toBe('');

    const sql = readFileSync(sqlPath, 'utf8');
    const check = /CHECK \(stage IN \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? '';
    const inMigration = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inMigration.length).toBe(20);
    expect([...STAGES].sort()).toEqual(inMigration);
  });

  it('gives every stage a place on the board', () => {
    // A stage with no column is live work that vanishes from the staging board.
    const onBoard = new Set<string>(BOARD_COLUMNS.flatMap((c) => c.stages));
    expect([...STAGES].filter((s) => !onBoard.has(s))).toEqual([]);
  });

  it('never lets a role target something that is not a real stage', () => {
    const real = new Set<string>(STAGES);
    for (const [role, stages] of Object.entries(ROLE_TARGET_STAGES)) {
      expect({ role, bad: stages.filter((s) => !real.has(s)) }).toEqual({ role, bad: [] });
    }
  });

  it('keeps ready_for_collection reachable ONLY through quality control', () => {
    // The structural form of "a car cannot be handed back without passing QC".
    const sources = Object.entries(STAGE_TRANSITIONS)
      .filter(([, tos]) => (tos as readonly Stage[]).includes('ready_for_collection'))
      .map(([from]) => from);
    expect(sources).toEqual(['quality_control']);
  });

  it('keeps repair work reachable only after authorization or a rejection', () => {
    const sources = Object.entries(STAGE_TRANSITIONS)
      .filter(([, tos]) => (tos as readonly Stage[]).includes('repair_in_progress'))
      .map(([from]) => from)
      .sort();
    // Authorization, a QC rejection, testing sending it back, a specialist's
    // advice. Never from a quotation or from a waiting state.
    expect(sources).toEqual([
      'authorized_to_start',
      'quality_control',
      'specialist_consultation',
      'testing',
    ]);
  });

  it('denies a technician every one of the gated states', () => {
    const tech = new Set<string>(ROLE_TARGET_STAGES.technician);
    for (const gated of [
      'awaiting_customer_approval',
      'awaiting_deposit',
      'awaiting_parts',
      'authorized_to_start',
      'quality_control',
      'ready_for_collection',
      'completed',
    ]) {
      expect({ gated, allowed: tech.has(gated) }).toEqual({ gated, allowed: false });
    }
  });

  it('leaves warranty_follow_up terminal — a new claim opens a new card', () => {
    expect(STAGE_TRANSITIONS.warranty_follow_up).toEqual([]);
  });
});
