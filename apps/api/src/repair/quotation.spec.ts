import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QuotationService } from './quotation.service';
import {
  CAN_APPROVE_QUOTATION,
  CAN_PREPARE_QUOTATION,
  CAN_READ_QUOTATION,
  LINE_KINDS,
  QUOTATION_REVIEW_DECISIONS,
  QUOTATION_STATUSES,
  RESOURCE_KIND_TO_LINE_KIND,
  lineKindLabel,
} from './quotation-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Quotations — Phase 5, slice 5.
 *
 * UNIT tests over a fake client. They assert what the database cannot: who may price,
 * who may APPROVE (a narrower set), that an approver is not the submitter, and the
 * money gates on submission.
 *
 * ⚠️ THE ARITHMETIC IS NOT PROVEN HERE. `line_total` is a GENERATED column, so a fake
 * client can return any number it likes and this file would agree. That rule is proven
 * against real Postgres by `verify/016_quotations.sql` and end-to-end by
 * `packages/auth/verify/probe-quotation.mjs`, which asserts 3 x 33.33 = 99.99 from the
 * database's own answer. Both layers are required; neither substitutes for the other.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const QUOTE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const LINE_ID = '21212121-3434-5656-7878-909090909090';
const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_USER = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'workshop_manager',
  correlationId: 'corr-1',
  ...over,
});

const cardRow = (over: Record<string, unknown> = {}) => ({
  id: CARD_ID,
  job_number: 'JC-000003',
  stage: 'quotation_preparation',
  ...over,
});

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: QUOTE_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  complaint: 'Rough idle',
  registration_number: 'GR 4821-22',
  customer_name: 'Kwame Mensah',
  repair_plan_id: PLAN_ID,
  plan_attempt_no: 1,
  diagnosis_summary: 'Coil failure confirmed',
  attempt_no: 1,
  status: 'draft',
  currency: 'GHS',
  // ⚠️ STRINGS, because that is what `pg` returns for `numeric`. Fixtures using JS
  // numbers would make the conversion assertions vacuous.
  labour_rate: '120.00',
  tax_name: 'VAT',
  tax_rate_percent: '15.000',
  discount_amount: '0.00',
  discount_reason: null,
  valid_until: null,
  warranty_terms: null,
  completion_conditions: null,
  recommended_repair: null,
  alternative_options: null,
  prepared_at: new Date('2026-07-30T09:00:00Z'),
  submitted_at: null,
  reviewed_at: null,
  review_note: null,
  submitted_by: null,
  prepared_by_name: 'A. Advisor',
  submitted_by_name: null,
  reviewed_by_name: null,
  ...over,
});

const lineRow = (over: Record<string, unknown> = {}) => ({
  id: LINE_ID,
  quotation_id: QUOTE_ID,
  position: 1,
  line_kind: 'labour',
  repair_plan_task_id: null,
  repair_plan_resource_id: null,
  description: 'Replace ignition coil',
  quantity: '1.500',
  unit: 'hours',
  unit_price: '120.00',
  line_total: '180.00',
  is_optional: false,
  ...over,
});

/**
 * ⚠️ ORDER MATTERS — `fakeDb` takes the FIRST regex that matches, and several of these
 * statements share a prefix. The collision that cost slice 4 two phantom failures was
 * exactly this, so each anchor names something its query cannot be written without.
 */
const Q = {
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  reviewLookup: /q\.submitted_by, j\.job_number/,
  writable: /FOR UPDATE OF q/,
  header: /LEFT JOIN identity\.users rb/,
  lines: /FROM repair\.quotation_lines/,
  openCheck: /status IN \('draft', 'submitted'\)/,
  approvedPlan: /FROM repair\.repair_plans p\s+WHERE p\.job_card_id/,
  pricing: /FROM repair\.organization_pricing/,
  attempt: /COALESCE\(max\(attempt_no\)/,
  position: /COALESCE\(max\(position\)/,
  planTasks: /FROM repair\.repair_plan_tasks/,
  planResources: /FROM repair\.repair_plan_resources/,
  quotationInsert: /INSERT INTO repair\.quotations/,
  quotationUpdate: /UPDATE repair\.quotations/,
  lineInsert: /INSERT INTO repair\.quotation_lines/,
  lineUpdate: /UPDATE repair\.quotation_lines/,
  lineDelete: /DELETE FROM repair\.quotation_lines/,
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
const spyAudit = () => ({
  write: vi.fn(
    async (
      _client: unknown,
      _ctx: TenantContext,
      _event: { action: string; detail?: Record<string, unknown> },
    ) => undefined,
  ),
});

const readHandlers = (
  over: { header?: unknown[]; lines?: unknown[] } = {},
): Array<[RegExp, unknown[]]> => [
  [Q.header, over.header ?? [headerRow()]],
  [Q.lines, over.lines ?? [lineRow()]],
];

function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected exactly one row, received ${rows.length}`);
  return first;
}

// ── roles: TWO separations, not one ────────────────────────────────────────

describe('quotation roles — §11, §5 and 07.txt pt2 §50', () => {
  it('refuses a technician the right to price their own work', async () => {
    const { db } = fakeDb([]);
    // The boundary that matters most in this slice. §50 gives the technician planning
    // and execution; a technician who sets the price of their own labour is the
    // separation of duties §11 exists to create.
    await expect(
      new QuotationService(db, fakeAudit()).prepare(ctx({ activeRole: 'technician' }), CARD_ID),
    ).rejects.toThrow(/may not prepare a quotation/);
    expect(CAN_PREPARE_QUOTATION.has('technician')).toBe(false);
    // ...but they may READ one: §31 has them confirm the customer approval before
    // starting work.
    expect(CAN_READ_QUOTATION.has('technician')).toBe(true);
  });

  it('⚠️ holds APPROVAL to a narrower set than preparation', async () => {
    // Reception may draft a price; committing the business to it is somebody else's
    // decision. This is the second separation, and it is the one a single role set
    // would have collapsed.
    expect(CAN_PREPARE_QUOTATION.has('reception_staff')).toBe(true);
    expect(CAN_APPROVE_QUOTATION.has('reception_staff')).toBe(false);

    const { db } = fakeDb([]);
    await expect(
      new QuotationService(db, fakeAudit()).review(
        ctx({ activeRole: 'reception_staff' }), QUOTE_ID, { decision: 'approved' },
      ),
    ).rejects.toThrow(/may not approve a quotation/);
  });

  it('refuses a workshop supervisor the price, though they approve the PLAN', async () => {
    // A deliberate asymmetry with slice 4: §50 gives the supervisor "technical review,
    // repair-plan approval" — technical, not commercial.
    expect(CAN_APPROVE_QUOTATION.has('workshop_supervisor')).toBe(false);
    const { db } = fakeDb([]);
    await expect(
      new QuotationService(db, fakeAudit()).review(
        ctx({ activeRole: 'workshop_supervisor' }), QUOTE_ID, { decision: 'approved' },
      ),
    ).rejects.toThrow(/may not approve/);
  });

  it('narrows a technician to their own assigned cards when reading', async () => {
    const { db, queries } = fakeDb(readHandlers());
    await new QuotationService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
  });
});

// ── preparing ──────────────────────────────────────────────────────────────

describe('prepare — §10 and §3', () => {
  it('refuses a card that is not at quotation_preparation', async () => {
    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'solution_preparation' })]]]);
    await expect(new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /may only be prepared while the job card is at 'quotation_preparation'/,
    );
  });

  it('refuses when there is no APPROVED repair plan, naming a reachable route', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedPlan, []],
    ]);
    // §10 — a price is built from approved work. The refusal points at the Repair Plans
    // screen, which is where a plan is both submitted and approved.
    await expect(new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /APPROVED repair plan.*Repair Plans screen/s,
    );
  });

  it('refuses a second quotation while one is SUBMITTED — the review bypass', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, [{ id: QUOTE_ID, status: 'submitted' }]],
    ]);
    // Slice 3b's HIGH, applied up front: every read orders by `attempt_no DESC`, so a
    // new attempt would make the submitted one stop being the current record and the
    // approval queue would empty while a price still awaited sign-off.
    await expect(new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /awaiting internal approval/,
    );
  });

  it('⚠️ SNAPSHOTS the currency and labour rate onto the quotation', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedPlan, [{ id: PLAN_ID, attempt_no: 2 }]],
      [Q.pricing, [{
        currency: 'GHS', default_labour_rate: '150.00', tax_name: 'VAT',
        tax_rate_percent: '15.000', default_validity_days: 21, default_warranty_terms: null,
      }]],
      [Q.attempt, [{ n: 1 }]],
      [Q.quotationInsert, [{ id: QUOTE_ID }]],
      [Q.planTasks, []],
      [Q.planResources, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID);
    const insert = queries.find((q) => Q.quotationInsert.test(q.text));
    // The decision no later migration can repair: if these were READ at display time,
    // raising the workshop rate tomorrow would silently re-price every historical
    // quotation, including ones a customer has already approved.
    expect(insert?.values?.[5]).toBe('GHS');
    expect(insert?.values?.[6]).toBe(150);
    expect(insert?.values?.[3]).toBe(PLAN_ID);
  });

  it('falls back to documented defaults when a workshop has configured no pricing', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedPlan, [{ id: PLAN_ID, attempt_no: 1 }]],
      [Q.pricing, []],
      [Q.attempt, [{ n: 1 }]],
      [Q.quotationInsert, [{ id: QUOTE_ID }]],
      [Q.planTasks, []],
      [Q.planResources, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID);
    // ADR-015 applied to pricing: a tenant that configures nothing still gets a working
    // app. The rate is 0, so every labour line is unpriced — and submission refuses
    // that, so the fallback cannot quietly quote a customer nothing.
    const insert = queries.find((q) => Q.quotationInsert.test(q.text));
    expect(insert?.values?.[6]).toBe(0);
  });

  it('⚠️ prices labour and parts but NOT the workshop own equipment', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedPlan, [{ id: PLAN_ID, attempt_no: 1 }]],
      [Q.pricing, []],
      [Q.attempt, [{ n: 1 }]],
      [Q.quotationInsert, [{ id: QUOTE_ID }]],
      [Q.planTasks, [{ id: 't1', title: 'Replace coil', estimated_labour_hours: '1.50' }]],
      [Q.planResources, [
        { id: 'r1', resource_kind: 'part', name: 'Coil', reference: 'B-1', quantity: '1.000', unit: 'each' },
        { id: 'r2', resource_kind: 'lifting_equipment', name: 'Two-post lift', reference: null, quantity: '1.000', unit: 'each' },
      ]],
      ...readHandlers(),
    ]);
    await new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID);
    const inserts = queries.filter((q) => Q.lineInsert.test(q.text));
    // A lift is not a customer charge. Auto-pricing it would invent a fee nobody
    // decided on — and it would be invisible, because it looks like every other line.
    expect(inserts).toHaveLength(2);
    expect(RESOURCE_KIND_TO_LINE_KIND['lifting_equipment']).toBeUndefined();
    expect(RESOURCE_KIND_TO_LINE_KIND['part']).toBe('part');
  });

  it('skips an unestimated task rather than pricing it at zero', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.approvedPlan, [{ id: PLAN_ID, attempt_no: 1 }]],
      [Q.pricing, []],
      [Q.attempt, [{ n: 1 }]],
      [Q.quotationInsert, [{ id: QUOTE_ID }]],
      [Q.planTasks, [{ id: 't1', title: 'No estimate', estimated_labour_hours: null }]],
      [Q.planResources, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, fakeAudit()).prepare(ctx(), CARD_ID);
    // A zero-hour labour line reads to a customer as "this work is free".
    expect(queries.filter((q) => Q.lineInsert.test(q.text))).toHaveLength(0);
  });
});

// ── money ──────────────────────────────────────────────────────────────────

describe('the money rules', () => {
  it('refuses a price the column would silently ROUND', async () => {
    const { db } = fakeDb([[Q.writable, [{ id: QUOTE_ID, status: 'draft', attempt_no: 1, job_number: 'JC-1' }]]]);
    // `numeric(14,2)` rounds 10.005 to 10.01; it does not refuse it. On a price, the
    // number typed and the number charged must be the same number.
    await expect(
      new QuotationService(db, fakeAudit()).addLine(ctx(), QUOTE_ID, {
        lineKind: 'part', description: 'x', quantity: 1, unitPrice: 10.005,
      }),
    ).rejects.toThrow(/two decimal places/);
  });

  it('refuses a negative price and a negative quantity', async () => {
    const { db } = fakeDb([[Q.writable, [{ id: QUOTE_ID, status: 'draft', attempt_no: 1, job_number: 'JC-1' }]]]);
    const service = new QuotationService(db, fakeAudit());
    await expect(
      service.addLine(ctx(), QUOTE_ID, { lineKind: 'part', description: 'x', quantity: 1, unitPrice: -1 }),
    ).rejects.toThrow(/zero or more/);
    await expect(
      service.addLine(ctx(), QUOTE_ID, { lineKind: 'part', description: 'x', quantity: 0, unitPrice: 1 }),
    ).rejects.toThrow(/greater than zero/);
  });

  it('converts every pg numeric string to a number', async () => {
    const { db } = fakeDb(readHandlers({
      lines: [lineRow({ quantity: '1.500', unit_price: '120.00', line_total: '180.00' })],
    }));
    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
    // Left as strings, `subtotal` would be string CONCATENATION — "180.00" + "50.00"
    // becomes "180.0050.00" — a wrong customer price no type error catches.
    expect(q.lines[0]?.unitPrice).toBe(120);
    expect(q.lines[0]?.lineTotal).toBe(180);
    expect(q.labourRate).toBe(120);
    expect(typeof q.subtotal).toBe('number');
  });

  it('⚠️ excludes optional lines from the total, and totals the rest exactly', async () => {
    const { db } = fakeDb(readHandlers({
      header: [headerRow({ tax_rate_percent: '10.000', discount_amount: '20.00' })],
      lines: [
        lineRow({ id: 'a', line_total: '100.00' }),
        lineRow({ id: 'b', position: 2, line_total: '50.00' }),
        lineRow({ id: 'c', position: 3, line_total: '999.00', is_optional: true }),
      ],
    }));
    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
    // §4's "alternative options where applicable" are things the customer may decline.
    expect(q.subtotal).toBe(150);
    expect(q.optionalTotal).toBe(999);
    // Tax is charged on the DISCOUNTED amount, which is what a tax authority expects.
    expect(q.taxAmount).toBe(13);
    expect(q.total).toBe(143);
  });

  it('never lets a discount drive the tax base below zero', async () => {
    const { db } = fakeDb(readHandlers({
      header: [headerRow({ tax_rate_percent: '15.000', discount_amount: '500.00' })],
      lines: [lineRow({ line_total: '100.00' })],
    }));
    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
    // The DISPLAY clamps so a draft never shows negative tax; SUBMISSION is what
    // refuses the state outright. Both, because a draft is allowed to be wrong while
    // somebody is still working on it.
    expect(q.taxAmount).toBe(0);
    expect(q.total).toBe(0);
  });
});

// ── submission ─────────────────────────────────────────────────────────────

describe('submit — §5 gates', () => {
  const writable = [Q.writable, [{ id: QUOTE_ID, status: 'draft', attempt_no: 1, job_number: 'JC-1' }]] as [RegExp, unknown[]];

  it('refuses a quotation whose every line is an optional extra', async () => {
    const { db } = fakeDb([writable, ...readHandlers({ lines: [lineRow({ is_optional: true })] })]);
    await expect(new QuotationService(db, fakeAudit()).submit(ctx(), QUOTE_ID)).rejects.toThrow(
      /no chargeable lines/,
    );
  });

  it('⚠️ refuses a line still priced at ZERO, and names it', async () => {
    const { db } = fakeDb([
      writable,
      ...readHandlers({ lines: [lineRow({ unit_price: '0.00', line_total: '0.00', description: 'Ignition coil' })] }),
    ]);
    // Parts are generated at zero deliberately — there is no catalogue — so submitting
    // without pricing them would send a customer a quotation offering free parts.
    // Unlike a missing labour estimate, nobody downstream would question it.
    await expect(new QuotationService(db, fakeAudit()).submit(ctx(), QUOTE_ID)).rejects.toThrow(
      /Ignition coil/,
    );
  });

  it('allows a zero-priced OTHER CHARGE, which is a legitimate goodwill line', async () => {
    const { db } = fakeDb([
      writable,
      ...readHandlers({
        lines: [lineRow({ line_kind: 'other_charge', unit_price: '0.00', line_total: '0.00' })],
      }),
      [Q.quotationUpdate, []],
    ]);
    await expect(new QuotationService(db, fakeAudit()).submit(ctx(), QUOTE_ID)).resolves.toBeTruthy();
  });

  it('refuses a discount larger than the subtotal', async () => {
    const { db } = fakeDb([
      writable,
      ...readHandlers({
        header: [headerRow({ discount_amount: '5000.00' })],
        lines: [lineRow({ line_total: '100.00' })],
      }),
    ]);
    await expect(new QuotationService(db, fakeAudit()).submit(ctx(), QUOTE_ID)).rejects.toThrow(
      /larger than the subtotal/,
    );
  });

  it('records the whole money picture in the audit trail', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      writable,
      ...readHandlers({ header: [headerRow({ tax_rate_percent: '0.000' })], lines: [lineRow({ line_total: '180.00' })] }),
      [Q.quotationUpdate, []],
    ]);
    await new QuotationService(db, audit as never).submit(ctx(), QUOTE_ID);
    const event = audit.write.mock.calls[0]?.[2];
    // The one audit entry a dispute is settled from.
    expect(event?.action).toBe('quotation.submitted');
    expect(event?.detail).toMatchObject({ currency: 'GHS', subtotal: 180, total: 180 });
  });
});

// ── approval ───────────────────────────────────────────────────────────────

describe('review — §5 and §563', () => {
  it('refuses the SUBMITTER, whatever their role', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [{ id: QUOTE_ID, status: 'submitted', attempt_no: 1, submitted_by: 'user-1', job_number: 'JC-1' }]],
    ]);
    await expect(
      new QuotationService(db, fakeAudit()).review(ctx({ userId: 'user-1' }), QUOTE_ID, { decision: 'approved' }),
    ).rejects.toThrow(/you submitted this quotation/);
  });

  it('allows a different manager, and requires a reason to reject', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.reviewLookup, [{ id: QUOTE_ID, status: 'submitted', attempt_no: 1, submitted_by: OTHER_USER, job_number: 'JC-1' }]],
      [Q.quotationUpdate, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, audit as never).review(ctx(), QUOTE_ID, { decision: 'approved' });
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('quotation.approved');

    const { db: db2 } = fakeDb([]);
    await expect(
      new QuotationService(db2, fakeAudit()).review(ctx(), QUOTE_ID, { decision: 'rejected' }),
    ).rejects.toThrow(/must give a reason/);
  });

  // ── the approval LIMIT, scope 'quotation' ───────────────────────────────
  //
  // 🔴 `core.approval_limits` has allowed this scope since migration 045 and
  // NOTHING EVER CONSULTED IT. A workshop that set "a supervisor may approve up
  // to GHS 500" watched a supervisor approve GHS 5,000. These tests exist
  // because the happy-path test above PASSED both before and after the check
  // was added — the fake returns no limit row, so it reads as "unconfigured"
  // and returns silently. A refusal has to be asserted on purpose or it is not
  // tested at all.
  const LIMIT_QUERY = /FROM core\.approval_limits/;

  it('REFUSES an approval above the role limit, and names who can', async () => {
    const { db } = fakeDb([
      [Q.reviewLookup, [{ id: QUOTE_ID, status: 'submitted', attempt_no: 1, submitted_by: OTHER_USER, job_number: 'JC-1' }]],
      // ⚠️ TWO DIFFERENT QUERIES HIT `core.approval_limits`: the limit lookup,
      // and then the "who CAN approve this" lookup that builds the escalation
      // sentence. `fakeDb` takes the first matching regex, so ONE handler
      // answers both — and the row therefore has to be valid for both. Without
      // `role_name` the escalation mapper crashed on `undefined.replace`, which
      // presented as the refusal not happening rather than as a bad fixture.
      [LIMIT_QUERY, [{ max_amount: '10.00', currency: 'GHS', role_name: 'workshop_owner' }]],
      ...readHandlers(),
      [Q.quotationUpdate, []],
    ]);
    await expect(
      new QuotationService(db, fakeAudit()).review(
        ctx({ activeRole: 'workshop_manager' }), QUOTE_ID, { decision: 'approved' },
      ),
    ).rejects.toThrow(/above the GHS 10\.00 your role may approve/);
  });

  it('does NOT block a REJECTION, however large the quotation', async () => {
    // 🔴 THE ESCAPE HATCH. A limit governs committing the business to a price,
    // not refusing one. If it gated rejection too, an over-limit quotation
    // would have no reachable next step — "a rule whose escape hatch is
    // unreachable is a wall, not a rule", recorded in this repository.
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.reviewLookup, [{ id: QUOTE_ID, status: 'submitted', attempt_no: 1, submitted_by: OTHER_USER, job_number: 'JC-1' }]],
      [LIMIT_QUERY, [{ max_amount: '0.00', currency: 'GHS', role_name: 'workshop_owner' }]],
      [Q.quotationUpdate, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, audit as never).review(
      ctx({ activeRole: 'workshop_manager' }), QUOTE_ID,
      { decision: 'rejected', note: 'too expensive for this repair' },
    );
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('quotation.rejected');
  });

  it('the workshop owner is never limited', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([
      [Q.reviewLookup, [{ id: QUOTE_ID, status: 'submitted', attempt_no: 1, submitted_by: OTHER_USER, job_number: 'JC-1' }]],
      [LIMIT_QUERY, [{ max_amount: '0.00', currency: 'GHS', role_name: 'workshop_owner' }]],
      [Q.quotationUpdate, []],
      ...readHandlers(),
    ]);
    await new QuotationService(db, audit as never).review(
      ctx({ activeRole: 'workshop_owner' }), QUOTE_ID, { decision: 'approved' },
    );
    // A limit that could lock the owner out of their own workshop has no escape
    // hatch at all — the same exemption `assertWithinApprovalLimit` already makes.
    expect(audit.write.mock.calls[0]?.[2]?.action).toBe('quotation.approved');
  });

  it('404s a quotation outside the viewers scope rather than 403ing it', async () => {
    const { db } = fakeDb([[Q.reviewLookup, []]]);
    await expect(
      new QuotationService(db, fakeAudit()).review(ctx(), QUOTE_ID, { decision: 'approved' }),
    ).rejects.toThrow(/quotation not found/);
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('quotation-rules matches what migration 016 actually applied', () => {
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    // Fail loudly rather than skip — a silent skip lets the two drift while the suite
    // still reports green.
    expect(sqlPath, `could not locate ${name}`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }
  const SQL = () => migration('016_quotations.sql');

  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the four quotation statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...QUOTATION_STATUSES].sort());
  });

  it('carries exactly §11s line kinds', () => {
    expect(checkValues(SQL(), 'line_kind')).toEqual([...LINE_KINDS].sort());
  });

  it('labels every line kind it offers', () => {
    for (const kind of LINE_KINDS) {
      expect({ kind, label: lineKindLabel(kind) }).not.toEqual({ kind, label: kind });
    }
  });

  it('keeps the review decisions a strict subset of the statuses', () => {
    for (const d of QUOTATION_REVIEW_DECISIONS) expect(QUOTATION_STATUSES).toContain(d);
  });

  it('⚠️ computes line_total in the DATABASE, so it cannot disagree with its inputs', () => {
    // The classic invoice defect is an application-written total that drifts from its
    // own quantity and price. If a later migration ever makes this an ordinary column,
    // this test is what says so.
    expect(SQL()).toMatch(
      /line_total\s+numeric\(14,2\)\s+GENERATED ALWAYS AS \(round\(quantity \* unit_price, 2\)\) STORED/,
    );
  });

  it('⚠️ freezes the currency and the source plan on the header', () => {
    // A currency changed after pricing silently re-denominates every amount on the
    // document; a re-pointed plan orphans every line that cites it. 015 paid for
    // learning this class of hole one migration late.
    const sql = SQL();
    expect(sql).toMatch(/NEW\.currency IS DISTINCT FROM OLD\.currency/);
    expect(sql).toMatch(/NEW\.repair_plan_id IS DISTINCT FROM OLD\.repair_plan_id/);
  });

  it('FORCEs row-level security on all three tables', () => {
    const sql = SQL();
    for (const t of ['quotations', 'quotation_lines', 'organization_pricing']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE repair\\.${t} FORCE\\s+ROW LEVEL SECURITY`));
    }
  });

  it('grants DELETE on the lines and withholds it on the header', () => {
    const sql = SQL();
    // 013's lesson applied by default: an advisor who adds a line in error must be able
    // to remove it, and the trigger — not the missing grant — is the narrowing.
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE\s+ON repair\.quotation_lines/);
    expect(sql).toMatch(/REVOKE DELETE ON repair\.quotations/);
  });

  it('constrains the currency to an ISO-4217 shape', () => {
    expect(SQL()).toMatch(/currency\s+TEXT NOT NULL[\s\S]*?CHECK \(currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  });
});
