import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  CAN_PREPARE_PROPOSAL,
  CAN_READ_PROPOSAL,
  CAN_RECORD_DECISION,
  DECISION_CHANNELS,
  PROPOSAL_DECISIONS,
  PROPOSAL_OPTIONS,
  PROPOSAL_STAGES,
  REQUIRED_QUOTATION_STATUS,
  decisionChannelLabel,
  type DecisionChannel,
  type ProposalDecision,
  type ProposalOption,
  type ProposalStatus,
} from './proposal-rules';

/**
 * What §410-§422 says the customer must be shown, gathered from the records that
 * already hold it.
 *
 * ⚠️ EVERY FIELD HERE IS READ, NEVER COPIED. Each source is already immutable by the
 * time a proposal can exist — a submitted inspection (010), an approved diagnosis
 * (012), an approved plan (014), an approved quotation (016). Snapshotting them onto
 * the proposal would create a second version of a fact that can never change, and a
 * second thing to keep in step.
 */
/**
 * The workshop's own identity, as it appears at the head of a document it issues.
 *
 * Every field is optional — a workshop that has configured nothing still gets a usable
 * document, and the renderer omits the lines it has nothing for rather than printing
 * blanks. `name` always resolves, falling back to the platform's record.
 */
export interface IssuerIdentity {
  name: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxIdentificationNumber: string | null;
  vatRegistrationNumber: string | null;
  documentFooter: string | null;
}

/** Who the document is addressed to. */
export interface AddresseeIdentity {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface ProposalPresentation {
  /** §410 — what was reported. */
  complaint: string;
  /** §412 — what was inspected. */
  inspectionSummary: string | null;
  inspectionCheckedCount: number;
  /** §414 — what was confirmed. */
  confirmedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
  /**
   * §416 — WHAT REMAINS SUSPECTED.
   *
   * The field most likely to be dropped and the one §416 names explicitly: a customer
   * agreeing to a repair is entitled to know what the workshop has NOT established, or
   * the first unexpected extra reads as incompetence rather than as a stated unknown.
   */
  suspectedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
  /** §418's proposed work — the approved plan's tasks. */
  proposedWork: Array<{ id: string; title: string; estimatedLabourHours: number | null }>;
  /** §418's proposed parts. */
  proposedParts: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
  /** §420 — how long it should take, summed from the plan. */
  estimatedLabourHours: number;
  /** §420 — what it will cost. */
  currency: string;
  recommendedTotal: number;
  comprehensiveTotal: number;
  /** §422 — what warranty applies. */
  warrantyTerms: string | null;
  completionConditions: string | null;
  validUntil: string | null;
  /** The letterhead — who is making this offer. */
  issuer: IssuerIdentity;
  /** The addressee — who it is made to. */
  addressee: AddresseeIdentity;
  /**
   * The document's own reference.
   *
   * A commercial document a customer may quote back at the workshop needs an
   * identifier that is short, human-readable and stable. Derived from the job number
   * and the version rather than stored, because both are already immutable and a
   * stored copy could only drift from them.
   */
  documentReference: string;
  vehicleDescription: string;
}

export interface RepairProposal {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  quotationId: string;
  quotationAttemptNo: number;
  versionNo: number;
  status: ProposalStatus;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  presentationNote: string | null;
  issuedByName: string | null;
  issuedAt: string | null;
  decision: ProposalDecision | null;
  approvedOption: ProposalOption | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionChannel: DecisionChannel | string | null;
  decisionChannelLabel: string | null;
  decisionNote: string | null;
  recordedByName: string | null;
  supersededBy: string | null;
  presentation: ProposalPresentation;
  /** §7 — the total the customer actually agreed to, once they have. */
  agreedTotal: number | null;
  editable: boolean;
  issuable: boolean;
  decidable: boolean;
}

interface NarrativeInput {
  expectedResult?: string | null;
  riskAndLimitations?: string | null;
  uncertainties?: string | null;
  presentationNote?: string | null;
}

/**
 * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
 *
 * ── §424 IS THE WHOLE SLICE ────────────────────────────────────────────────
 *
 * "Approved proposals shall be immutable. A material change shall create a new
 * version requiring new approval." Everything here follows from that sentence:
 *
 *   · A decided proposal cannot be edited — in the service AND by trigger. The only
 *     writable field left on it is `superseded_by`, because recording the
 *     supersession would otherwise require breaking the immutability that makes
 *     versioning necessary in the first place.
 *   · `prepare()` on a card whose latest proposal is already decided creates
 *     VERSION n+1 and links the old row to it, rather than reopening anything.
 *   · An ISSUED proposal freezes too. A document that changes while the customer is
 *     reading it is a different offer from the one they say yes to.
 *
 * ── WHY THE PRESENTATION IS ASSEMBLED, NOT STORED ──────────────────────────
 *
 * §410-§422 lists twelve things the customer must see, and ten already exist in
 * records that are frozen before a proposal can be created. They are read at display
 * time from the exact quotation, plan, diagnosis and inspection the proposal names —
 * so the document is reproducible forever without a single copied field.
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairProposal[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any proposal is read.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readProposals(client, ctx, { jobCardId: cardId });
    });
  }

  async list(ctx: TenantContext): Promise<RepairProposal[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readProposals(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<RepairProposal> {
    this.assertMayRead(ctx);
    const proposalId = requireUuid(id, 'id');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readProposals(client, ctx, { proposalId });
      return ProposalService.one(rows);
    });
  }

  /**
   * Draft a proposal from the approved quotation — or, when the last one has been
   * decided, §424's NEW VERSION of it.
   */
  async prepare(ctx: TenantContext, jobCardId: string): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      if (!PROPOSAL_STAGES.includes(card.stage)) {
        throw new BadRequestException(
          `a proposal may only be prepared while the job card is at ` +
            `${PROPOSAL_STAGES.map((s) => `'${s}'`).join(' or ')}; this card is at ` +
            `'${card.stage}'. Move the card to '${PROPOSAL_STAGES[0]}' first.`,
        );
      }

      // ── one UNDECIDED proposal at a time ─────────────────────────────────
      const openRow = await client.query(
        `SELECT id, status, version_no FROM repair.repair_proposals
          WHERE job_card_id = $1 AND tenant_id = $2
            AND status IN ('draft', 'issued')
          ORDER BY version_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const open = openRow.rows[0] as { id: string; status: string; version_no: number } | undefined;
      if (open) {
        throw new ConflictException(
          open.status === 'draft'
            ? `version ${open.version_no} of this proposal is still a draft; issue it or finish it before starting another`
            : `version ${open.version_no} is with the customer and has not been answered; ` +
              'record their decision before issuing a new version',
        );
      }

      // The version this one replaces, if any. §424: a material change creates a NEW
      // version, so the previous decided row is marked superseded rather than edited.
      const previousRow = await client.query(
        `SELECT id, version_no, status FROM repair.repair_proposals
          WHERE job_card_id = $1 AND tenant_id = $2
          ORDER BY version_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const previous = previousRow.rows[0] as
        | { id: string; version_no: number; status: string }
        | undefined;

      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
      // agreed, replacing that agreement is a commercial act, and §7 says repair work
      // shall not start until the required approval is received — so a new version
      // must be a deliberate re-quote, not a side effect of pressing a button on a
      // job that is already authorised.
      if (previous?.status === 'approved') {
        throw new ConflictException(
          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
            'change needs a new quotation first, which is then proposed as a new version — ' +
            'prepare a fresh quotation on the Quotations screen.',
        );
      }

      const quotationRow = await client.query(
        `SELECT id, attempt_no FROM repair.quotations
          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = $4
          ORDER BY attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_QUOTATION_STATUS],
      );
      const quotation = quotationRow.rows[0] as { id: string; attempt_no: number } | undefined;
      if (!quotation) {
        // The refusal names a route that exists: the quotation queue is where a price
        // is both prepared and internally approved.
        throw new ConflictException(
          'a proposal presents an APPROVED quotation, and this job card has none. ' +
            'Prepare a quotation and have a manager approve it on the Quotations screen first.',
        );
      }

      const nextVersion = (previous?.version_no ?? 0) + 1;

      const inserted = await client.query(
        `INSERT INTO repair.repair_proposals
           (tenant_id, organization_id, job_card_id, quotation_id, version_no,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, cardId, quotation.id, nextVersion, ctx.userId],
      );
      const proposalId = inserted.rows[0].id as string;

      // Link the version it replaces. Done AFTER the insert because the new id is what
      // the old row points at, and the trigger permits exactly this one write on a
      // decided row.
      if (previous && previous.status !== 'superseded') {
        await client.query(
          `UPDATE repair.repair_proposals
              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
            WHERE id = $3 AND tenant_id = $4`,
          [proposalId, ctx.userId, previous.id, ctx.tenantId],
        );
      }

      await this.audit.write(client, ctx, {
        action: 'proposal.prepared',
        resourceType: 'proposal',
        resourceId: proposalId,
        detail: {
          jobNumber: card.job_number,
          versionNo: nextVersion,
          quotationAttemptNo: quotation.attempt_no,
          supersedes: previous?.version_no ?? null,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId });
      return ProposalService.one(rows);
    });
  }

  /** §418's expected result, §422's risks and uncertainties. */
  async recordNarrative(
    ctx: TenantContext,
    proposalId: string,
    input: NarrativeInput,
  ): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(proposalId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // Column names come from these literals and NEVER from the request.
    this.nullableText(set, 'expected_result', input.expectedResult, 'expectedResult', 8000);
    this.nullableText(set, 'risk_and_limitations', input.riskAndLimitations, 'riskAndLimitations', 8000);
    this.nullableText(set, 'uncertainties', input.uncertainties, 'uncertainties', 8000);
    this.nullableText(set, 'presentation_note', input.presentationNote, 'presentationNote', 8000);

    if (sets.length === 0) throw new BadRequestException('nothing to update');
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const proposal = await this.assertDraft(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'proposal.narrative_recorded',
        resourceType: 'proposal',
        resourceId: id,
        detail: { jobNumber: proposal.job_number, versionNo: proposal.version_no },
      });
      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  /**
   * Put the proposal in front of the customer.
   *
   * ⚠️ THE GATE IS §418, NOT A FORMALITY. A proposal that does not say what the work
   * should ACHIEVE is a price with no promise attached, and it is the one thing on
   * §410-§422's list that no other record can supply — the complaint, the findings,
   * the tasks and the totals are all read from frozen sources, but "what this will fix
   * for you" exists nowhere until somebody writes it.
   */
  async issue(ctx: TenantContext, proposalId: string): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(proposalId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const proposal = await this.assertDraft(client, ctx, id);

      const current = ProposalService.one(await this.readProposals(client, ctx, { proposalId: id }));
      if (current.expectedResult === null) {
        throw new BadRequestException(
          'a proposal cannot be issued without saying what the work should achieve (§418). ' +
            'Record the expected result first.',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = 'issued', issued_by = $1, issued_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'proposal.issued',
        resourceType: 'proposal',
        resourceId: id,
        // The money the customer is being shown, so the trail records the offer as
        // made rather than only that an offer happened.
        detail: {
          jobNumber: proposal.job_number,
          versionNo: proposal.version_no,
          currency: current.presentation.currency,
          recommendedTotal: current.presentation.recommendedTotal,
          comprehensiveTotal: current.presentation.comprehensiveTotal,
          suspectedFaultsDisclosed: current.presentation.suspectedFaults.length,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  /**
   * §7 — record the customer's answer.
   *
   * ── THE ATTRIBUTION IS THE RECORD ──────────────────────────────────────────
   *
   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
   * member who captured it, taken from the session and never from the request. Those
   * are two different facts, and an approval that conflates them cannot answer "who
   * agreed to this" when a customer later says they did not.
   *
   * The channel is mandatory too. §7 offers telephone and video consultation, so a
   * decision frequently arrives off-system — and "approved" with no channel is an
   * assertion rather than a record.
   */
  async recordDecision(
    ctx: TenantContext,
    proposalId: string,
    input: {
      decision?: string;
      approvedOption?: string;
      decidedByName?: string;
      decisionChannel?: string;
      note?: string;
    },
  ): Promise<RepairProposal> {
    this.assertMayRecordDecision(ctx);
    const id = requireUuid(proposalId, 'id');
    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
    const channel: DecisionChannel = requireOneOf(
      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
    );
    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
    const note = optionalText(input.note, 'note', 8000);

    // §7's five "request" actions all arrive as `changes_requested`, and the note is
    // what says which. A decline with no reason leaves the workshop nothing to act on.
    if (decision !== 'approved' && note === null) {
      throw new BadRequestException(
        decision === 'declined'
          ? 'a declined proposal must record why; note is required'
          : 'say what the customer asked to change, or what they want explained; note is required',
      );
    }

    const approvedOption: ProposalOption | null =
      decision === 'approved'
        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
        : null;

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT p.id, p.status, p.version_no, j.job_number
           FROM repair.repair_proposals p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
          -- Serialises two people recording an answer to the same proposal, so the
          -- second reads the status the first committed.
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as
        | { id: string; status: ProposalStatus; version_no: number; job_number: string }
        | undefined;
      // 404, not 403 — the non-oracle rule this codebase holds everywhere.
      if (!row) throw new NotFoundException('proposal not found');

      if (row.status === 'draft') {
        throw new ConflictException(
          'this proposal has not been issued to the customer yet, so there is no decision to record',
        );
      }
      if (row.status !== 'issued') {
        throw new ConflictException(
          `version ${row.version_no} was already ${row.status}; §424 requires a new version ` +
            'for a material change, and a further answer belongs to that version',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = $1, decision = $1, approved_option = $2,
                decided_at = now(), decided_by_name = $3, decision_channel = $4,
                decision_note = $5, recorded_by = $6,
                updated_at = now(), updated_by = $6
          WHERE id = $7 AND tenant_id = $8`,
        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action:
          decision === 'approved'
            ? 'proposal.approved_by_customer'
            : decision === 'declined'
              ? 'proposal.declined_by_customer'
              : 'proposal.changes_requested',
        resourceType: 'proposal',
        resourceId: id,
        // The channel and the option, never the customer's free text. This is the
        // entry a dispute over authorisation is settled from.
        detail: {
          jobNumber: row.job_number,
          versionNo: row.version_no,
          decision,
          approvedOption,
          channel,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /**
   * Assembles §410-§422's document from the frozen records behind it.
   *
   * Five queries for any number of proposals, never one per row.
   */
  private async readProposals(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; proposalId?: string },
  ): Promise<RepairProposal[]> {
    const headers = await client.query(
      `SELECT p.id, p.job_card_id, j.job_number, j.complaint, v.registration_number,
              c.display_name AS customer_name,
              c.email AS customer_email, c.phone AS customer_phone,
              c.location AS customer_location,
              o.name AS org_name,
              op.legal_name, op.trading_name, op.address AS org_address,
              op.city AS org_city, op.country AS org_country,
              op.phone AS org_phone, op.email AS org_email, op.website AS org_website,
              op.tax_identification_number, op.vat_registration_number,
              op.document_footer,
              mk.name AS make_name, md.name AS model_name, v.model_year,
              p.quotation_id, q.attempt_no AS quotation_attempt_no,
              q.currency, q.warranty_terms, q.completion_conditions, q.valid_until,
              q.repair_plan_id,
              p.version_no, p.status, p.expected_result, p.risk_and_limitations,
              p.uncertainties, p.presentation_note,
              p.issued_at, p.decision, p.approved_option, p.decided_at,
              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
              ib.display_name AS issued_by_name,
              rb.display_name AS recorded_by_name,
              -- The money, read from the exact quotation this proposal names.
              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
                  AND l.is_optional = false) AS chargeable_total,
              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
                  AND l.is_optional = true) AS optional_total,
              q.discount_amount, q.tax_rate_percent,
              -- §420 — how long it should take.
              (SELECT COALESCE(sum(t.estimated_labour_hours), 0) FROM repair.repair_plan_tasks t
                WHERE t.plan_id = q.repair_plan_id AND t.tenant_id = q.tenant_id) AS plan_hours,
              -- §412 — what was inspected. The latest submitted sheet on this card.
              (SELECT i.summary FROM repair.inspections i
                WHERE i.job_card_id = j.id AND i.tenant_id = j.tenant_id
                  AND i.status <> 'in_progress'
                ORDER BY i.attempt_no DESC LIMIT 1) AS inspection_summary,
              (SELECT count(*)::int FROM repair.inspection_items ii
                JOIN repair.inspections i2 ON i2.id = ii.inspection_id AND i2.tenant_id = ii.tenant_id
               WHERE i2.job_card_id = j.id AND i2.tenant_id = j.tenant_id
                 AND i2.status <> 'in_progress' AND ii.result IS NOT NULL) AS inspection_checked
         FROM repair.repair_proposals p
         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         -- The make and model are reference tables, not columns. LEFT on the model
         -- because 004 allows a vehicle whose exact model is unknown.
         LEFT JOIN core.vehicle_makes mk ON mk.id = v.make_id
         LEFT JOIN core.vehicle_models md ON md.id = v.model_id
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
         JOIN identity.organizations o ON o.id = p.organization_id
         -- LEFT: a workshop that has configured no letterhead still gets a document.
         LEFT JOIN core.organization_profile op
           ON op.organization_id = p.organization_id AND op.tenant_id = p.tenant_id
         JOIN repair.quotations q ON q.id = p.quotation_id AND q.tenant_id = p.tenant_id
         LEFT JOIN identity.users ib ON ib.id = p.issued_by
         LEFT JOIN identity.users rb ON rb.id = p.recorded_by
        WHERE p.tenant_id = $1
          AND p.organization_id = $2
          AND ($3::uuid IS NULL OR p.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR p.id = $4::uuid)
          -- The same narrowing the job card carries: a technician sees the approval
          -- only for a card assigned to them.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY p.version_no DESC`,
      [
        ctx.tenantId, ctx.organizationId,
        filter.jobCardId ?? null, filter.proposalId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const planIds = [...new Set(rows.map((r) => r.repair_plan_id))];
    const quotationIds = [...new Set(rows.map((r) => r.quotation_id))];
    const cardIds = [...new Set(rows.map((r) => r.job_card_id))];

    const [faults, tasks, parts] = await Promise.all([
      // §414 and §416 — confirmed AND suspected, from the diagnosis behind the plan.
      client.query(
        `SELECT p.id AS plan_id, f.id, f.fault_description, f.fault_code, f.finding_status
           FROM repair.repair_plans p
           JOIN repair.diagnostic_findings f
             ON f.diagnosis_id = p.diagnosis_id AND f.tenant_id = p.tenant_id
          WHERE p.id = ANY($1::uuid[]) AND p.tenant_id = $2
            AND f.finding_status IN ('confirmed', 'suspected')
          ORDER BY f.position`,
        [planIds, ctx.tenantId],
      ),
      client.query(
        `SELECT plan_id, id, title, estimated_labour_hours
           FROM repair.repair_plan_tasks
          WHERE plan_id = ANY($1::uuid[]) AND tenant_id = $2
          ORDER BY position`,
        [planIds, ctx.tenantId],
      ),
      client.query(
        `SELECT quotation_id, id, description, quantity, unit_price
           FROM repair.quotation_lines
          WHERE quotation_id = ANY($1::uuid[]) AND tenant_id = $2
            AND line_kind IN ('part', 'consumable')
          ORDER BY position`,
        [quotationIds, ctx.tenantId],
      ),
    ]);
    void cardIds;

    const byPlan = <T>(list: Array<T & { plan_id: string }>): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const l = m.get(r.plan_id) ?? [];
        l.push(r);
        m.set(r.plan_id, l);
      }
      return m;
    };
    const faultsByPlan = byPlan(faults.rows as Array<FaultRow & { plan_id: string }>);
    const tasksByPlan = byPlan(tasks.rows as Array<TaskRow & { plan_id: string }>);
    const partsByQuotation = new Map<string, PartRow[]>();
    for (const r of parts.rows as PartRow[]) {
      const l = partsByQuotation.get(r.quotation_id) ?? [];
      l.push(r);
      partsByQuotation.set(r.quotation_id, l);
    }

    return rows.map((row) => {
      const planFaults = faultsByPlan.get(row.repair_plan_id) ?? [];
      const planTasks = tasksByPlan.get(row.repair_plan_id) ?? [];
      const quotationParts = partsByQuotation.get(row.quotation_id) ?? [];

      // ⚠️ EVERY `numeric` ARRIVES AS A STRING FROM `pg`. Converted at the boundary —
      // left alone, the totals below would be string concatenation, which is a wrong
      // price no type error catches.
      const chargeable = Number(row.chargeable_total);
      const optional = Number(row.optional_total);
      const discount = Number(row.discount_amount);
      const taxRate = Number(row.tax_rate_percent);

      // The same arithmetic slice 5 uses, applied to two tiers. Rounded at each step in
      // the currency's minor unit so a displayed total always equals the sum of the
      // lines a customer can read.
      const withTax = (net: number): number => {
        const taxable = Math.max(0, round2(net - discount));
        return round2(taxable + round2((taxable * taxRate) / 100));
      };
      const recommendedTotal = withTax(chargeable);
      const comprehensiveTotal = withTax(round2(chargeable + optional));

      const status = row.status;
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        customerName: row.customer_name,
        quotationId: row.quotation_id,
        quotationAttemptNo: row.quotation_attempt_no,
        versionNo: row.version_no,
        status,
        expectedResult: row.expected_result,
        riskAndLimitations: row.risk_and_limitations,
        uncertainties: row.uncertainties,
        presentationNote: row.presentation_note,
        issuedByName: row.issued_by_name,
        issuedAt: row.issued_at ? row.issued_at.toISOString() : null,
        decision: row.decision,
        approvedOption: row.approved_option,
        decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
        decidedByName: row.decided_by_name,
        decisionChannel: row.decision_channel,
        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
        decisionNote: row.decision_note,
        recordedByName: row.recorded_by_name,
        supersededBy: row.superseded_by,
        presentation: {
          complaint: row.complaint,
          inspectionSummary: row.inspection_summary,
          inspectionCheckedCount: Number(row.inspection_checked ?? 0),
          confirmedFaults: planFaults
            .filter((f) => f.finding_status === 'confirmed')
            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
          suspectedFaults: planFaults
            .filter((f) => f.finding_status === 'suspected')
            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
          proposedWork: planTasks.map((t) => ({
            id: t.id,
            title: t.title,
            estimatedLabourHours:
              t.estimated_labour_hours === null ? null : Number(t.estimated_labour_hours),
          })),
          proposedParts: quotationParts.map((p) => ({
            id: p.id,
            description: p.description,
            quantity: Number(p.quantity),
            unitPrice: Number(p.unit_price),
          })),
          estimatedLabourHours: round2(Number(row.plan_hours)),
          currency: row.currency,
          recommendedTotal,
          comprehensiveTotal,
          warrantyTerms: row.warranty_terms,
          completionConditions: row.completion_conditions,
          validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
          issuer: {
            // The trading name is what a customer recognises; the legal name is who the
            // contract is with. Falls back to the platform's record so the letterhead is
            // never blank.
            name: row.trading_name ?? row.legal_name ?? row.org_name,
            legalName: row.legal_name,
            address: row.org_address,
            city: row.org_city,
            country: row.org_country,
            phone: row.org_phone,
            email: row.org_email,
            website: row.org_website,
            taxIdentificationNumber: row.tax_identification_number,
            vatRegistrationNumber: row.vat_registration_number,
            documentFooter: row.document_footer,
          },
          addressee: {
            name: row.customer_name,
            email: row.customer_email,
            phone: row.customer_phone,
            location: row.customer_location,
          },
          // e.g. PROP-JC-000003-V2 — short, human-readable, and derivable forever from
          // two values that can never change.
          documentReference: `PROP-${row.job_number}-V${row.version_no}`,
          vehicleDescription: [row.model_year, row.make_name, row.model_name]
            .filter(Boolean)
            .join(' '),
        },
        // What the customer actually agreed to — the figure an invoice is later checked
        // against, and the reason `approved_option` is stored rather than inferred.
        agreedTotal:
          row.approved_option === 'comprehensive'
            ? comprehensiveTotal
            : row.approved_option === 'recommended'
              ? recommendedTotal
              : null,
        editable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
        issuable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
        decidable: status === 'issued' && CAN_RECORD_DECISION.has(ctx.activeRole),
      };
    });
  }

  private async assertCardVisible(
    client: Client,
    ctx: TenantContext,
    cardId: string,
    opts: { lock?: boolean } = {},
  ): Promise<CardRow> {
    const found = await client.query(
      `SELECT j.id, j.job_number, j.stage
         FROM repair.job_cards j
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
      [
        cardId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  /**
   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
   *
   * The message names §424 by name, because "cannot be changed" without the reason
   * reads as a bug to somebody who has not read the specification.
   */
  private async assertDraft(
    client: Client,
    ctx: TenantContext,
    proposalId: string,
  ): Promise<{ job_number: string; version_no: number }> {
    const found = await client.query(
      `SELECT p.id, p.status, p.version_no, j.job_number
         FROM repair.repair_proposals p
         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
        FOR UPDATE OF p`,
      [proposalId, ctx.tenantId, ctx.organizationId],
    );
    const row = found.rows[0] as
      | { id: string; status: ProposalStatus; version_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('proposal not found');
    if (row.status !== 'draft') {
      throw new ConflictException(
        row.status === 'issued'
          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
            'record their decision, then prepare a new version'
          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
            'immutable and a material change requires a NEW VERSION — prepare one instead',
      );
    }
    return { job_number: row.job_number, version_no: row.version_no };
  }

  /**
   * Absent leaves it, null/'' clears it, a string sets it.
   *
   * ⚠️ A NON-STRING IS A 400, NOT A SILENT CLEAR — the data-loss regression the
   * Supervisor caught on slice 3b's clear-semantics commit, avoided here by default.
   */
  private nullableText(
    set: (column: string, value: unknown) => void,
    column: string,
    raw: unknown,
    field: string,
    max: number,
  ): void {
    if (raw === undefined) return;
    if (raw === null || raw === '') {
      set(column, null);
      return;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field} must be a string, or null to clear it`);
    }
    set(column, optionalText(raw, field, max));
  }

  private static one(rows: RepairProposal[]): RepairProposal {
    const first = rows[0];
    if (!first) throw new NotFoundException('proposal not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_PROPOSAL.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
    }
  }

  private assertMayPrepare(ctx: TenantContext): void {
    if (!CAN_PREPARE_PROPOSAL.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
    }
  }

  private assertMayRecordDecision(ctx: TenantContext): void {
    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not record a customer decision`,
      );
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Client {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface CardRow {
  id: string;
  job_number: string;
  stage: string;
}

interface FaultRow {
  id: string;
  fault_description: string;
  fault_code: string | null;
  finding_status: string;
}

interface TaskRow {
  id: string;
  title: string;
  estimated_labour_hours: string | null;
}

interface PartRow {
  quotation_id: string;
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  complaint: string;
  registration_number: string;
  customer_name: string;
  quotation_id: string;
  quotation_attempt_no: number;
  currency: string;
  warranty_terms: string | null;
  completion_conditions: string | null;
  valid_until: Date | null;
  repair_plan_id: string;
  version_no: number;
  status: ProposalStatus;
  expected_result: string | null;
  risk_and_limitations: string | null;
  uncertainties: string | null;
  presentation_note: string | null;
  issued_at: Date | null;
  decision: ProposalDecision | null;
  approved_option: ProposalOption | null;
  decided_at: Date | null;
  decided_by_name: string | null;
  decision_channel: DecisionChannel | null;
  decision_note: string | null;
  superseded_by: string | null;
  issued_by_name: string | null;
  recorded_by_name: string | null;
  chargeable_total: string;
  optional_total: string;
  discount_amount: string;
  tax_rate_percent: string;
  plan_hours: string;
  inspection_summary: string | null;
  inspection_checked: number;
  customer_email: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  org_name: string;
  legal_name: string | null;
  trading_name: string | null;
  org_address: string | null;
  org_city: string | null;
  org_country: string | null;
  org_phone: string | null;
  org_email: string | null;
  org_website: string | null;
  tax_identification_number: string | null;
  vat_registration_number: string | null;
  document_footer: string | null;
  make_name: string | null;
  model_name: string | null;
  model_year: number | null;
}
