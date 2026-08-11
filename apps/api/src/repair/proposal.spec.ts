import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProposalService } from './proposal.service';
import {
  CAN_PREPARE_PROPOSAL,
  CAN_READ_PROPOSAL,
  CAN_RECORD_DECISION,
  DECISION_CHANNELS,
  PROPOSAL_DECISIONS,
  PROPOSAL_OPTIONS,
  PROPOSAL_STATUSES,
  decisionChannelLabel,
} from './proposal-rules';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Customer proposals — Phase 5, slice 6.
 *
 * UNIT tests over a fake client, asserting what the database cannot: who may make an
 * offer to a customer, that the attribution of a decision is mandatory, and that §424's
 * immutability is enforced in the service as well as by trigger.
 *
 * ⚠️ §424 IS PROVEN TWICE, DELIBERATELY. Here, so a caller gets a sentence naming the
 * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
 * end-to-end by `probe-proposal.mjs`. A fake client cannot enforce a constraint, so a
 * green result here says nothing about the database — and the reverse is equally true.
 */

const CARD_ID = '11111111-2222-3333-4444-555555555555';
const PROPOSAL_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const QUOTE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'reception_staff',
  hasPlatformGrant: false,
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
  id: PROPOSAL_ID,
  job_card_id: CARD_ID,
  job_number: 'JC-000003',
  complaint: 'Rough idle',
  registration_number: 'GR 4821-22',
  customer_name: 'Kwame Mensah',
  customer_email: 'kwame@example.com',
  customer_phone: '+233 24 000 0000',
  customer_location: 'Accra',
  org_name: 'Alpha Motors',
  legal_name: 'Alpha Motors Limited',
  trading_name: 'Alpha Motors',
  org_address: 'Plot 14, Spintex Road',
  org_city: 'Accra',
  org_country: 'Ghana',
  org_phone: '+233 30 123 4567',
  org_email: 'service@alpha.example',
  org_website: null,
  tax_identification_number: 'C0012345678',
  vat_registration_number: 'VAT-GH-004521',
  document_footer: 'Payment due on collection.',
  make_name: 'Toyota',
  model_name: 'Corolla',
  model_year: 2018,
  quotation_id: QUOTE_ID,
  quotation_attempt_no: 1,
  currency: 'GHS',
  warranty_terms: '12 months',
  completion_conditions: null,
  valid_until: null,
  repair_plan_id: PLAN_ID,
  version_no: 1,
  status: 'draft',
  expected_result: null,
  risk_and_limitations: null,
  uncertainties: null,
  presentation_note: null,
  issued_at: null,
  decision: null,
  approved_option: null,
  decided_at: null,
  decided_by_name: null,
  decision_channel: null,
  decision_note: null,
  superseded_by: null,
  issued_by_name: null,
  recorded_by_name: null,
  // ⚠️ STRINGS — `pg` returns `numeric` as text. Number fixtures would make the
  // conversion assertions vacuous.
  chargeable_total: '1000.00',
  optional_total: '500.00',
  discount_amount: '0.00',
  tax_rate_percent: '0.000',
  plan_hours: '3.50',
  inspection_summary: 'All checkpoints completed',
  inspection_checked: 19,
  ...over,
});

const Q = {
  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
  decisionLookup: /p\.version_no, j\.job_number/,
  draft: /FOR UPDATE OF p/,
  header: /LEFT JOIN identity\.users rb/,
  faults: /JOIN repair\.diagnostic_findings f/,
  tasks: /FROM repair\.repair_plan_tasks/,
  parts: /FROM repair\.quotation_lines/,
  openCheck: /status IN \('draft', 'issued'\)/,
  latest: /ORDER BY version_no DESC LIMIT 1/,
  approvedQuote: /FROM repair\.quotations\s+WHERE job_card_id/,
  insert: /INSERT INTO repair\.repair_proposals/,
  update: /UPDATE repair\.repair_proposals/,
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

const readHandlers = (over: { header?: unknown[] } = {}): Array<[RegExp, unknown[]]> => [
  [Q.header, over.header ?? [headerRow()]],
  [Q.faults, []],
  [Q.tasks, []],
  [Q.parts, []],
];

function only<T>(rows: T[]): T {
  const first = rows[0];
  if (!first) throw new Error(`expected one row, received ${rows.length}`);
  return first;
}

// ── who may make an offer ──────────────────────────────────────────────────

describe('proposal roles — a commercial offer, not a technical one', () => {
  it('refuses a technician and a supervisor', async () => {
    const service = () => new ProposalService(fakeDb([]).db, fakeAudit());
    await expect(service().prepare(ctx({ activeRole: 'technician' }), CARD_ID)).rejects.toThrow(
      /may not prepare a customer proposal/,
    );
    // ⚠️ THE ASYMMETRY WITH SLICE 4, ASSERTED. A supervisor approves the repair PLAN;
    // §50's authority is technical review and stops at the customer's door.
    await expect(
      service().prepare(ctx({ activeRole: 'workshop_supervisor' }), CARD_ID),
    ).rejects.toThrow(/may not prepare a customer proposal/);
    expect(CAN_PREPARE_PROPOSAL.has('workshop_supervisor')).toBe(false);
    expect(CAN_PREPARE_PROPOSAL.has('reception_staff')).toBe(true);
  });

  it('lets a technician READ one — §32 has them confirm the approval before starting', async () => {
    expect(CAN_READ_PROPOSAL.has('technician')).toBe(true);
    const { db, queries } = fakeDb(readHandlers());
    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
    // ...but only for a card assigned to them.
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
  });

  it('does NOT apply an independence rule between issuer and recorder, by design', () => {
    // Everywhere else in Phase 5 both parties are staff, so independence must be
    // enforced. Here the deciding party is the CUSTOMER — outside the system — so a
    // check between the issuer and the scribe would be theatre and would block the
    // commonest real case: reception issues a proposal and the customer answers them
    // on the spot. What protects the record instead is mandatory attribution.
    expect(CAN_RECORD_DECISION).toBe(CAN_PREPARE_PROPOSAL);
  });
});

// ── preparing and versioning ───────────────────────────────────────────────

describe('prepare — §424 versioning', () => {
  it('refuses a card at the wrong stage', async () => {
    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'repair_in_progress' })]]]);
    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /may only be prepared while the job card is at/,
    );
  });

  it('refuses when there is no APPROVED quotation, naming a reachable route', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.latest, []],
      [Q.approvedQuote, []],
    ]);
    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /APPROVED quotation.*Quotations screen/s,
    );
  });

  it('refuses a second version while one is with the customer', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1 }]],
    ]);
    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /has not been answered/,
    );
  });

  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
    const { db } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.latest, [{ id: PROPOSAL_ID, version_no: 2, status: 'approved' }]],
    ]);
    // Replacing an agreement the customer has already given is a commercial act, not a
    // side effect of pressing a button on a job that is already authorised. §7: work
    // shall not start until the required approval is received — and it already has been.
    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
      /APPROVED by the customer/,
    );
  });

  it('creates version n+1 and marks the one it replaces superseded', async () => {
    const { db, queries } = fakeDb([
      [Q.card, [cardRow()]],
      [Q.openCheck, []],
      [Q.latest, [{ id: 'older', version_no: 2, status: 'declined' }]],
      [Q.approvedQuote, [{ id: QUOTE_ID, attempt_no: 1 }]],
      [Q.insert, [{ id: PROPOSAL_ID }]],
      [Q.update, []],
      ...readHandlers({ header: [headerRow({ version_no: 3 })] }),
    ]);
    await new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID);
    expect(queries.find((q) => Q.insert.test(q.text))?.values?.[4]).toBe(3);
    // §424: the old row points at its replacement rather than being edited or removed.
    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
    expect(supersede?.values?.[0]).toBe(PROPOSAL_ID);
  });
});

// ── the document ───────────────────────────────────────────────────────────

describe('the assembled document — §410-§422', () => {
  it('resolves a letterhead and an addressee, and a reference both sides can quote', async () => {
    const { db } = fakeDb(readHandlers());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    // A document with no issuer cannot be acted on, and one addressed to nobody is a
    // draft.
    expect(p.presentation.issuer.name).toBe('Alpha Motors');
    expect(p.presentation.issuer.vatRegistrationNumber).toBe('VAT-GH-004521');
    expect(p.presentation.addressee.name).toBe('Kwame Mensah');
    expect(p.presentation.documentReference).toBe('PROP-JC-000003-V1');
    expect(p.presentation.vehicleDescription).toBe('2018 Toyota Corolla');
  });

  it('falls back to the platform name when no letterhead is configured', async () => {
    const { db } = fakeDb(
      readHandlers({
        header: [headerRow({ trading_name: null, legal_name: null, org_address: null })],
      }),
    );
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    // ADR-015 applied to paperwork: a workshop that has configured nothing still gets a
    // usable document, and the renderer omits the lines it has nothing for.
    expect(p.presentation.issuer.name).toBe('Alpha Motors');
    expect(p.presentation.issuer.address).toBeNull();
  });

  it('computes both price tiers, and excludes the optional lines from the lower one', async () => {
    const { db } = fakeDb(readHandlers());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    expect(p.presentation.recommendedTotal).toBe(1000);
    expect(p.presentation.comprehensiveTotal).toBe(1500);
  });

  it('applies the discount before tax and never lets the base go negative', async () => {
    const { db } = fakeDb(
      readHandlers({
        header: [headerRow({ discount_amount: '5000.00', tax_rate_percent: '15.000' })],
      }),
    );
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    expect(p.presentation.recommendedTotal).toBe(0);
  });

  it('converts every pg numeric to a number', async () => {
    const { db } = fakeDb(readHandlers());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    // Left as strings these would concatenate rather than add — a wrong price with no
    // type error to catch it.
    expect(typeof p.presentation.recommendedTotal).toBe('number');
    expect(p.presentation.estimatedLabourHours).toBe(3.5);
  });

  it('reports the AGREED total once a tier has been accepted', async () => {
    const { db } = fakeDb(
      readHandlers({
        header: [
          headerRow({ status: 'approved', decision: 'approved', approved_option: 'recommended' }),
        ],
      }),
    );
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
    // The figure an invoice is later checked against — which is why the option is
    // stored rather than inferred from whichever total happens to be larger.
    expect(p.agreedTotal).toBe(1000);
  });
});

// ── the decision ───────────────────────────────────────────────────────────

describe('recordDecision — §7 and the attribution', () => {
  const issued = [
    Q.decisionLookup,
    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: null }],
  ] as [RegExp, unknown[]];

  it('requires the customer name and the channel', async () => {
    const service = () => new ProposalService(fakeDb([issued]).db, fakeAudit());
    await expect(
      service().recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
      }),
    ).rejects.toThrow(/decidedByName/);
    await expect(
      service().recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame',
      }),
    ).rejects.toThrow(/decisionChannel/);
  });

  it('🔴 refuses a SUPERSEDED version on the STAFF route too', async () => {
    // §424: the answer belongs to the CURRENT version. A superseded row can
    // still read `issued`, so status alone does not catch it — and recording
    // an approval against a replaced document authorises work at a price the
    // workshop has withdrawn.
    const superseded = [
      Q.decisionLookup,
      [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: 'newer' }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'approved', approvedOption: 'recommended',
        decidedByName: 'Kwame', decisionChannel: 'telephone',
      }),
    ).rejects.toThrow(/superseded by a newer proposal/);
  });

  it('requires a reason for anything that is not an approval', async () => {
    // §7's five "request" actions all arrive as `changes_requested`, and the note is
    // what says which — so without it the workshop has nothing to act on.
    await expect(
      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'changes_requested', decidedByName: 'Kwame', decisionChannel: 'telephone',
      }),
    ).rejects.toThrow(/what the customer asked to change/);
  });

  it('requires an option when approving', async () => {
    await expect(
      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'approved', decidedByName: 'Kwame', decisionChannel: 'in_person',
      }),
    ).rejects.toThrow(/approvedOption/);
  });

  it('⚠️ records the customer as the decider and the staff member separately', async () => {
    const audit = spyAudit();
    const { db, queries } = fakeDb([issued, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, audit as never).recordDecision(
      ctx({ userId: 'reception-7' }),
      PROPOSAL_ID,
      {
        decision: 'approved',
        approvedOption: 'comprehensive',
        decidedByName: 'Kwame Mensah',
        decisionChannel: 'telephone',
      },
    );
    const update = queries.find((q) => Q.update.test(q.text));
    // Position 3 is `decided_by_name` (the customer), position 6 is `recorded_by` (the
    // scribe). Conflating them would record reception as having authorised the
    // customer's own repair.
    expect(update?.values?.[2]).toBe('Kwame Mensah');
    expect(update?.values?.[5]).toBe('reception-7');
    expect(audit.write.mock.calls[0]?.[2]?.detail).toMatchObject({
      decision: 'approved',
      channel: 'telephone',
      approvedOption: 'comprehensive',
    });
  });

  it('refuses a decision on a draft, and a second decision on a settled one', async () => {
    const draft = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'approved', approvedOption: 'recommended', decidedByName: 'K', decisionChannel: 'sms',
      }),
    ).rejects.toThrow(/has not been issued/);

    const done = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([done]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
        decision: 'declined', decidedByName: 'K', decisionChannel: 'sms', note: 'no',
      }),
    ).rejects.toThrow(/§424 requires a new version/);
  });
});

// ── §424 in the service ────────────────────────────────────────────────────


describe('recordCustomerDecision — the customer answers for themselves', () => {
  // The lookup this route uses is the decision lookup PLUS the customer's own
  // name, and it is constrained to a card that customer owns.
  const mine = [
    Q.decisionLookup,
    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah', superseded_by: null }],
  ] as [RegExp, unknown[]];

  const customerCtx = () => ctx({ activeRole: 'customer', userId: 'cust-1' });

  it('🔴 refuses any role that is not the customer', async () => {
    // Staff have their own route, where the two attributions stay separate.
    // Letting reception in here would file THEIR name as the decider.
    for (const role of ['reception_staff', 'workshop_owner', 'technician']) {
      await expect(
        new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
          ctx({ activeRole: role, userId: 'staff-1' }),
          PROPOSAL_ID,
          { decision: 'approved', approvedOption: 'recommended' },
        ),
      ).rejects.toThrow(/may not decide as the customer/);
    }
  });

  it('🔴 scopes the lookup to the calling customer, not just to the tenant', async () => {
    // THE CONTROL. The role check says a customer may use this route; THIS is
    // what stops them approving somebody else's repair. Position 4 is
    // `c.user_id`, and it must be the session's user — never a request value.
    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
    );
    const lookup = queries.find((q) => Q.decisionLookup.test(q.text));
    expect(lookup?.values?.[3]).toBe('cust-1');
    expect(lookup?.text).toMatch(/c\.user_id = \$4/);
  });

  it('🔴 derives the decider and the channel — a request cannot set either', async () => {
    // The whole reason this is a separate route. `decidedByName` comes from the
    // CUSTOMER RECORD and the channel from the route, so a customer cannot
    // approve under another name or file a portal approval as a phone call.
    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
      customerCtx(),
      PROPOSAL_ID,
      // Deliberately smuggling both fields in. The type does not admit them and
      // Zod strips them; this asserts the SERVICE ignores them even so.
      {
        decision: 'approved',
        approvedOption: 'recommended',
        decidedByName: 'Somebody Else',
        decisionChannel: 'telephone',
      } as never,
    );
    const update = queries.find((q) => Q.update.test(q.text));
    expect(update?.values?.[2]).toBe('Kwame Mensah');
    expect(update?.text).toMatch(/decision_channel = 'customer_portal'/);
    // And the customer is BOTH decider and recorder here — one person, which is
    // the strongest form of the record.
    expect(update?.values?.[4]).toBe('cust-1');
  });

  it('marks the audit entry as self-service so a dispute can tell the two apart', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, audit as never).recordCustomerDecision(
      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
    );
    expect(audit.write.mock.calls[0]?.[2]?.detail).toMatchObject({
      decision: 'approved',
      channel: 'customer_portal',
      selfService: true,
    });
  });

  it('still requires a reason for anything that is not an approval', async () => {
    // Not relaxed just because the customer typed it themselves — a refusal with
    // no reason leaves the workshop nothing to act on either way.
    await expect(
      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'declined' },
      ),
    ).rejects.toThrow(/must record why/);
  });

  it('still requires an option when approving', async () => {
    await expect(
      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved' },
      ),
    ).rejects.toThrow(/approvedOption/);
  });

  it('🔴 refuses a SUPERSEDED version even while its status still reads issued', async () => {
    // The CONTROL behind the `decidable` flag. Hiding the version from the
    // screen is not enough — a caller can POST any id, and answering a document
    // the workshop has replaced would bind them to a superseded price.
    const superseded = [
      Q.decisionLookup,
      [{
        id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1',
        display_name: 'Kwame Mensah', superseded_by: 'a-newer-proposal',
      }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
      ),
    ).rejects.toThrow(/replaced by a newer proposal/);
  });

  it('404s rather than 403s when the proposal is not theirs', async () => {
    // The non-oracle rule: a customer must not be able to learn that somebody
    // else's proposal exists by the shape of the refusal.
    await expect(
      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
      ),
    ).rejects.toThrow(/proposal not found/);
  });

  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
    const draft = [
      Q.decisionLookup,
      [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
      ),
    ).rejects.toThrow(/not been sent to you yet/);

    const answered = [
      Q.decisionLookup,
      [{ id: PROPOSAL_ID, status: 'approved', version_no: 2, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([answered]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'declined', note: 'changed my mind' },
      ),
    ).rejects.toThrow(/already answered version 2/);
  });
});

describe('a customer reading proposals', () => {
  it('🔴 is narrowed to their own cards by the QUERY, not by the role check', async () => {
    // CAN_READ_PROPOSAL admits the role; position 6 is what scopes it. Without
    // this predicate a customer receives every proposal in the organisation —
    // prices, contact details and all.
    const { db, queries } = fakeDb(readHandlers());
    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[5]).toBe('cust-9');
  });

  it('does NOT narrow a staff viewer by customer', async () => {
    // The predicate must bind to the CUSTOMER role only. Applied to staff it
    // would empty every workshop screen that reads proposals.
    const { db, queries } = fakeDb(readHandlers());
    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'workshop_owner' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[5]).toBeNull();
  });
});


describe('the affordance flags — what the VIEWER is told they may do', () => {
  /**
   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
   * set when the customer role was added to CAN_READ_PROPOSAL, so it evaluated
   * false for every customer — and the customer screen renders its approval
   * form only on `decidable`. The self-service approval was completely inert
   * while the service behind it worked and its ten tests passed.
   *
   * Nothing threw and nothing logged. Every existing test drove the SERVICE;
   * none asked what the viewer had been TOLD they could do. That gap is the bug,
   * so these assert the flags directly.
   */
  const issuedHeader = (over: Record<string, unknown> = {}) =>
    readHandlers({ header: [headerRow({ status: 'issued', issued_at: new Date('2026-08-01T00:00:00Z'), ...over })] });

  it('🔴 a customer may decide an ISSUED proposal', async () => {
    const { db } = fakeDb(issuedHeader());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-1' })));
    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
  });

  it('staff may still decide one — the customer did not displace them', async () => {
    const { db } = fakeDb(issuedHeader());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'reception_staff' })));
    expect(p.decidable).toBe(true);
  });

  it('a role that may read but not answer is NOT offered the choice', async () => {
    // A technician reads the approval to confirm it before starting work; they
    // do not make it. Offering them the control would be a button that 403s.
    const { db } = fakeDb(issuedHeader());
    const p = only(
      await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't1' })),
    );
    expect(p.decidable).toBe(false);
  });

  it('nobody may decide a DRAFT — it has not been sent yet', async () => {
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.decidable).toBe(false);
  });

  it('nobody may decide one that was already answered', async () => {
    // Otherwise the customer is offered a second answer to a settled document
    // and the API refuses it — a control that fails, which reads as a bug.
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'approved' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.decidable).toBe(false);
  });

  it('a customer is never offered the EDIT or ISSUE controls', async () => {
    // Those belong to the workshop. `editable`/`issuable` must not widen with
    // `decidable` — the same oversight in the other direction.
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.editable).toBe(false);
    expect(p.issuable).toBe(false);
  });
});

describe('§424 — immutability', () => {
  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
    const issuedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1' }]] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([issuedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
        expectedResult: 'changed',
      }),
    ).rejects.toThrow(/with the customer and its content is frozen/);

    const approvedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([approvedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
        expectedResult: 'changed',
      }),
    ).rejects.toThrow(/§424/);
  });

  it('refuses to issue without §418s expected result', async () => {
    const { db } = fakeDb([
      [Q.draft, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]],
      ...readHandlers(),
    ]);
    // The one section of §410-§422 no other record can supply: a price with no promise
    // attached is not a proposal.
    await expect(new ProposalService(db, fakeAudit()).issue(ctx(), PROPOSAL_ID)).rejects.toThrow(
      /what the work should achieve/,
    );
  });
});

// ── the rules module against the migration ─────────────────────────────────

describe('proposal-rules matches what migration 017 applied', () => {
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
  const SQL = () => migration('017_repair_proposals.sql');

  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  it('carries exactly the six proposal statuses', () => {
    expect(checkValues(SQL(), 'status')).toEqual([...PROPOSAL_STATUSES].sort());
  });

  it('carries exactly §7s three decisions', () => {
    expect(checkValues(SQL(), 'decision')).toEqual([...PROPOSAL_DECISIONS].sort());
  });

  it('carries exactly §398-§402s offered options', () => {
    expect(checkValues(SQL(), 'approved_option')).toEqual([...PROPOSAL_OPTIONS].sort());
  });

  it('carries exactly §7s channels, and labels each', () => {
    expect(checkValues(SQL(), 'decision_channel')).toEqual([...DECISION_CHANNELS].sort());
    for (const c of DECISION_CHANNELS) {
      expect({ c, label: decisionChannelLabel(c) }).not.toEqual({ c, label: c });
    }
  });

  it('⚠️ makes the decision attribution MANDATORY at the database level', () => {
    // The service checks it and this test pins the second layer: a decided row must name
    // the person, the time and the channel. This is the record a workshop relies on when
    // a customer says they never agreed.
    const sql = SQL();
    expect(sql).toMatch(/CONSTRAINT proposal_decision_attributed CHECK/);
    expect(sql).toMatch(/decided_by_name IS NOT NULL/);
    expect(sql).toMatch(/decision_channel IS NOT NULL/);
  });

  it('pins the status and the decision together so they cannot drift', () => {
    expect(SQL()).toMatch(/CONSTRAINT proposal_status_matches_decision CHECK/);
  });

  it('⚠️ refuses to edit a decided proposal, and permits ONLY the supersession', () => {
    const sql = SQL();
    // §424 in the database. The narrow exception is deliberate: recording the
    // supersession would otherwise require breaking the very immutability that makes
    // versioning necessary.
    expect(sql).toMatch(/has been decided and cannot be changed/);
    expect(sql).toMatch(/NEW\.status = 'superseded'/);
  });

  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {
    const sql = SQL();
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON repair\.repair_proposals/);
    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_proposals/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON repair\.repair_proposals/);
  });

  it('FORCEs row-level security', () => {
    const sql = SQL();
    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals FORCE\s+ROW LEVEL SECURITY/);
  });

  it('requires the letterhead table to be tenant-isolated too — migration 018', () => {
    const sql = migration('018_organization_profile.sql');
    expect(sql).toMatch(/ALTER TABLE core\.organization_profile FORCE\s+ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE DELETE ON core\.organization_profile/);
  });
});
