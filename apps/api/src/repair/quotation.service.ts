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
import { optionalDate, optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  CAN_APPROVE_QUOTATION,
  CAN_PREPARE_QUOTATION,
  CAN_READ_QUOTATION,
  LINE_KINDS,
  PRICING_DEFAULTS,
  QUOTATION_REVIEW_DECISIONS,
  QUOTATION_START_STAGE,
  REQUIRED_PLAN_STATUS,
  RESOURCE_KIND_TO_LINE_KIND,
  lineKindLabel,
  type LineKind,
  type QuotationReviewDecision,
  type QuotationStatus,
} from './quotation-rules';

export interface QuotationLine {
  id: string;
  position: number;
  lineKind: LineKind | string;
  lineKindLabel: string;
  repairPlanTaskId: string | null;
  repairPlanResourceId: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  /** Computed by the database, never by a caller. See migration 016. */
  lineTotal: number;
  isOptional: boolean;
}

export interface Quotation {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  complaint: string;
  repairPlanId: string;
  repairPlanAttemptNo: number;
  /** §4 — read live from the approved diagnosis, which 012 froze. Never copied. */
  diagnosisSummary: string | null;
  attemptNo: number;
  status: QuotationStatus;
  currency: string;
  labourRate: number;
  taxName: string;
  taxRatePercent: number;
  discountAmount: number;
  discountReason: string | null;
  validUntil: string | null;
  warrantyTerms: string | null;
  completionConditions: string | null;
  recommendedRepair: string | null;
  alternativeOptions: string | null;
  preparedByName: string | null;
  preparedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  lines: QuotationLine[];
  /**
   * ── THE TOTALS, ALL DERIVED ───────────────────────────────────────────────
   *
   * Never stored. Every input is immutable once the quotation leaves `draft`, so a
   * derived total gives the same answer forever and there is no second copy to
   * drift — the judgement 014 made about the plan's labour hours, applied to money.
   *
   * ⚠️ OPTIONAL LINES ARE EXCLUDED. §4's "alternative options where applicable" are
   * things the customer may decline, and adding them to the headline price would
   * quote for work nobody has agreed to.
   */
  subtotal: number;
  optionalTotal: number;
  taxAmount: number;
  total: number;
  /**
   * Whether THIS viewer may still write to THIS quotation.
   *
   * ⚠️ A UI CONVENIENCE, NEVER A CONTROL. Every write re-derives the whole judgement
   * server-side (CLAUDE.md §8 — hidden is not secure).
   */
  editable: boolean;
  /** Mirrors the write path's BOTH conditions — role AND not the submitter. */
  reviewable: boolean;
}

interface LineInput {
  lineKind?: string;
  description?: string;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number;
  isOptional?: boolean;
  repairPlanTaskId?: string | null;
  repairPlanResourceId?: string | null;
}

interface QuotationDetailsInput {
  discountAmount?: number;
  discountReason?: string | null;
  validUntil?: string | null;
  warrantyTerms?: string | null;
  completionConditions?: string | null;
  recommendedRepair?: string | null;
  alternativeOptions?: string | null;
}

/**
 * The quotation for a job card — `07.txt` §9-§16, `1.txt` §340.
 *
 * ── §3: "THE SYSTEM GENERATES A DRAFT QUOTATION" ───────────────────────────
 *
 * That word is the design. `prepare()` does not create an empty document for
 * somebody to retype the plan into — it PRICES the approved plan: one `labour` line
 * per task at the workshop's rate × the task's estimated hours, one `part` or
 * `consumable` line per priced resource. Re-keying figures that already exist is how
 * a quotation comes to disagree with the plan it is supposedly for, and it is the
 * single most likely source of a wrong customer charge.
 *
 * Equipment is NOT priced. A two-post lift is the workshop's own, and auto-charging
 * for it would invent a fee nobody decided on — see `RESOURCE_KIND_TO_LINE_KIND`.
 *
 * Every generated line keeps the id of the task or resource it came from, so a
 * customer charge can always answer "which task is this?".
 */
@Injectable()
export class QuotationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Quotation[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any quotation is read.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readQuotations(client, ctx, { jobCardId: cardId });
    });
  }

  async list(ctx: TenantContext): Promise<Quotation[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readQuotations(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<Quotation> {
    this.assertMayRead(ctx);
    const quotationId = requireUuid(id, 'id');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readQuotations(client, ctx, { quotationId });
      return QuotationService.one(rows);
    });
  }

  /**
   * §10 + §3 — take the approved repair plan and generate the draft.
   */
  async prepare(ctx: TenantContext, jobCardId: string): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      if (card.stage !== QUOTATION_START_STAGE) {
        throw new BadRequestException(
          `a quotation may only be prepared while the job card is at ` +
            `'${QUOTATION_START_STAGE}'; this card is at '${card.stage}'. ` +
            `Move the card to '${QUOTATION_START_STAGE}' first.`,
        );
      }

      // ── ONE UNSETTLED QUOTATION AT A TIME ────────────────────────────────
      // `submitted` blocks too, for the reason slice 3b paid a HIGH for: every read
      // orders by `attempt_no DESC`, so a new attempt would make the submitted one
      // stop being the current record and the approval queue would empty while a
      // price still awaited sign-off.
      const unsettled = await client.query(
        `SELECT id, status FROM repair.quotations
          WHERE job_card_id = $1 AND tenant_id = $2
            AND status IN ('draft', 'submitted')
          ORDER BY attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const blocking = unsettled.rows[0] as { id: string; status: string } | undefined;
      if (blocking) {
        throw new ConflictException(
          blocking.status === 'draft'
            ? 'this job card already has a quotation in preparation; submit it before starting another'
            : 'the previous quotation for this job card is awaiting internal approval; ' +
              'a new one can only be prepared once it has been approved or rejected',
        );
      }

      // ── the APPROVED plan this is priced from (§10) ──────────────────────
      const planRow = await client.query(
        `SELECT p.id, p.attempt_no
           FROM repair.repair_plans p
          WHERE p.job_card_id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
            AND p.status = $4
          ORDER BY p.attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_PLAN_STATUS],
      );
      const plan = planRow.rows[0] as { id: string; attempt_no: number } | undefined;
      if (!plan) {
        // The refusal names a route that exists — the repair-plan queue is where a
        // plan is submitted, and the same queue is where a manager approves it.
        throw new ConflictException(
          'a quotation is priced from an APPROVED repair plan, and this job card has none. ' +
            'Build a repair plan and have a supervisor approve it on the Repair Plans screen first.',
        );
      }

      // ── the workshop's pricing, or the documented fallbacks ──────────────
      const pricingRow = await client.query(
        `SELECT currency, default_labour_rate, tax_name, tax_rate_percent,
                default_validity_days, default_warranty_terms
           FROM repair.organization_pricing
          WHERE organization_id = $1 AND tenant_id = $2`,
        [ctx.organizationId, ctx.tenantId],
      );
      const pricing = pricingRow.rows[0] as PricingRow | undefined;
      const currency = pricing?.currency ?? PRICING_DEFAULTS.currency;
      const labourRate = pricing ? Number(pricing.default_labour_rate) : PRICING_DEFAULTS.labourRate;
      const taxName = pricing?.tax_name ?? PRICING_DEFAULTS.taxName;
      const taxRate = pricing ? Number(pricing.tax_rate_percent) : PRICING_DEFAULTS.taxRatePercent;
      const validityDays = pricing?.default_validity_days ?? PRICING_DEFAULTS.validityDays;

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.quotations WHERE job_card_id = $1 AND tenant_id = $2`,
        [cardId, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.quotations
           (tenant_id, organization_id, job_card_id, repair_plan_id, attempt_no,
            currency, labour_rate, tax_name, tax_rate_percent,
            valid_until, warranty_terms, prepared_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                 -- The DATE is stored, not the number of days: "valid for 14 days"
                 -- computed at read time would keep moving forward, so a quotation
                 -- would never expire.
                 (CURRENT_DATE + ($10 || ' days')::interval)::date,
                 $11,$12,$12,$12)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, cardId, plan.id, attemptNo,
          currency, labourRate, taxName, taxRate,
          String(validityDays), pricing?.default_warranty_terms ?? null, ctx.userId,
        ],
      );
      const quotationId = inserted.rows[0].id as string;

      // ── §3: GENERATE the lines from the plan ─────────────────────────────
      const generated = await this.generateLines(client, ctx, quotationId, plan.id, labourRate);

      await this.audit.write(client, ctx, {
        action: 'quotation.prepared',
        resourceType: 'quotation',
        resourceId: quotationId,
        detail: {
          jobNumber: card.job_number,
          attemptNo,
          planAttemptNo: plan.attempt_no,
          currency,
          linesGenerated: generated,
          // Whether the workshop had configured a rate at all. A quotation drafted at
          // a zero rate is legitimate but almost always a misconfiguration, and this
          // is the record that says which it was.
          pricingConfigured: pricing !== undefined,
        },
      });

      const rows = await this.readQuotations(client, ctx, { quotationId });
      return QuotationService.one(rows);
    });
  }

  /**
   * §3 — one line per plan task, one per priced resource.
   *
   * ⚠️ THE UNIT PRICE IS SNAPSHOT, NOT REFERENCED. `labourRate` is written onto every
   * labour line as it is created. If it were read from the settings at display time,
   * raising the workshop's rate tomorrow would silently re-price a quotation a
   * customer had already been shown.
   *
   * Parts get a unit price of ZERO, not a guess. There is no parts catalogue in this
   * build (§24's Find Parts is a later slice), so the honest draft lists WHAT is
   * needed and leaves the advisor to price it — inventing a number would put a
   * fabricated figure in front of a customer.
   */
  private async generateLines(
    client: Client,
    ctx: TenantContext,
    quotationId: string,
    planId: string,
    labourRate: number,
  ): Promise<number> {
    const tasks = await client.query(
      `SELECT id, title, estimated_labour_hours
         FROM repair.repair_plan_tasks
        WHERE plan_id = $1 AND tenant_id = $2
        ORDER BY position`,
      [planId, ctx.tenantId],
    );
    const resources = await client.query(
      `SELECT id, resource_kind, name, reference, quantity, unit
         FROM repair.repair_plan_resources
        WHERE plan_id = $1 AND tenant_id = $2
        ORDER BY position`,
      [planId, ctx.tenantId],
    );

    let position = 0;
    let created = 0;

    for (const raw of tasks.rows as Array<{
      id: string;
      title: string;
      estimated_labour_hours: string | null;
    }>) {
      // A plan cannot be submitted with an unestimated task, and only an APPROVED
      // plan gets here — so this is belt-and-braces rather than an expected case.
      // Skipped rather than priced at zero, because a zero-hour labour line reads as
      // "this work is free".
      if (raw.estimated_labour_hours === null) continue;
      position += 1;
      created += 1;
      await client.query(
        `INSERT INTO repair.quotation_lines
           (tenant_id, organization_id, quotation_id, position, line_kind,
            repair_plan_task_id, description, quantity, unit, unit_price, recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,'labour',$5,$6,$7,'hours',$8,$9,$9)`,
        [
          ctx.tenantId, ctx.organizationId, quotationId, position,
          raw.id, raw.title, Number(raw.estimated_labour_hours), labourRate, ctx.userId,
        ],
      );
    }

    for (const raw of resources.rows as Array<{
      id: string;
      resource_kind: string;
      name: string;
      reference: string | null;
      quantity: string;
      unit: string | null;
    }>) {
      const kind = RESOURCE_KIND_TO_LINE_KIND[raw.resource_kind];
      // Equipment is the workshop's own — see the rules module.
      if (!kind) continue;
      position += 1;
      created += 1;
      await client.query(
        `INSERT INTO repair.quotation_lines
           (tenant_id, organization_id, quotation_id, position, line_kind,
            repair_plan_resource_id, description, quantity, unit, unit_price, recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$10)`,
        [
          ctx.tenantId, ctx.organizationId, quotationId, position, kind, raw.id,
          raw.reference ? `${raw.name} (${raw.reference})` : raw.name,
          Number(raw.quantity), raw.unit, ctx.userId,
        ],
      );
    }

    return created;
  }

  /** §11's taxes and discounts, §4's validity, warranty and conditions. */
  async recordDetails(
    ctx: TenantContext,
    quotationId: string,
    input: QuotationDetailsInput,
  ): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(quotationId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.discountAmount !== undefined) {
      set('discount_amount', this.requireMoney(input.discountAmount, 'discountAmount', true));
    }
    if (input.validUntil !== undefined) {
      set('valid_until', input.validUntil === null || input.validUntil === ''
        ? null
        : optionalDate(input.validUntil, 'validUntil'));
    }
    this.nullableText(set, 'discount_reason', input.discountReason, 'discountReason', 2000);
    this.nullableText(set, 'warranty_terms', input.warrantyTerms, 'warrantyTerms', 8000);
    this.nullableText(set, 'completion_conditions', input.completionConditions, 'completionConditions', 8000);
    this.nullableText(set, 'recommended_repair', input.recommendedRepair, 'recommendedRepair', 8000);
    this.nullableText(set, 'alternative_options', input.alternativeOptions, 'alternativeOptions', 8000);

    if (sets.length === 0) throw new BadRequestException('nothing to update');
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.quotations SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const quotation = await this.assertWritable(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'quotation.details_recorded',
        resourceType: 'quotation',
        resourceId: id,
        // The DISCOUNT is audited by amount, because it is the one field on this
        // route that changes what a customer pays.
        detail: { jobNumber: quotation.job_number, discountAmount: input.discountAmount ?? null },
      });
      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(rows);
    });
  }

  /** Add a line the plan did not produce — §11's external services, §4's other charges. */
  async addLine(ctx: TenantContext, quotationId: string, input: LineInput): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(quotationId, 'id');
    const lineKind = requireOneOf(input.lineKind, LINE_KINDS, 'lineKind');
    const description = requireText(input.description, 'description', 500);
    const quantity = this.requireQuantity(input.quantity);
    const unitPrice = this.requireMoney(input.unitPrice, 'unitPrice', true);
    const unit = optionalText(input.unit, 'unit', 50);

    return this.db.withTenant(ctx, async (client) => {
      const quotation = await this.assertWritable(client, ctx, id);
      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.quotation_lines WHERE quotation_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      await client.query(
        `INSERT INTO repair.quotation_lines
           (tenant_id, organization_id, quotation_id, position, line_kind,
            description, quantity, unit, unit_price, is_optional, recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          ctx.tenantId, ctx.organizationId, id, Number(next.rows[0].n), lineKind,
          description, quantity, unit, unitPrice, input.isOptional === true, ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'quotation.line_added',
        resourceType: 'quotation',
        resourceId: id,
        detail: { jobNumber: quotation.job_number, lineKind, unitPrice, quantity },
      });
      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(rows);
    });
  }

  /** Price a line, or correct it, while the quotation is still a draft. */
  async updateLine(
    ctx: TenantContext,
    quotationId: string,
    lineId: string,
    input: LineInput,
  ): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(quotationId, 'id');
    const targetId = requireUuid(lineId, 'lineId');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.description !== undefined) {
      set('description', requireText(input.description, 'description', 500));
    }
    if (input.lineKind !== undefined) {
      set('line_kind', requireOneOf(input.lineKind, LINE_KINDS, 'lineKind'));
    }
    if (input.quantity !== undefined) set('quantity', this.requireQuantity(input.quantity));
    if (input.unitPrice !== undefined) {
      set('unit_price', this.requireMoney(input.unitPrice, 'unitPrice', true));
    }
    if (input.isOptional !== undefined) set('is_optional', input.isOptional === true);
    this.nullableText(set, 'unit', input.unit, 'unit', 50);

    if (sets.length === 0) throw new BadRequestException('nothing to update');
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(targetId, id, ctx.tenantId);
    const sql = `UPDATE repair.quotation_lines SET ${sets.join(', ')}
                  WHERE id = $${values.length - 2}
                    AND quotation_id = $${values.length - 1}
                    AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const quotation = await this.assertWritable(client, ctx, id);
      const updated = await client.query(sql, values);
      // `rowCount` 0 on an UPDATE is the quiet no-op that makes a write look successful.
      if (updated.rowCount === 0) {
        throw new NotFoundException('line not found on this quotation');
      }
      await this.audit.write(client, ctx, {
        action: 'quotation.line_updated',
        resourceType: 'quotation',
        resourceId: id,
        detail: { jobNumber: quotation.job_number, lineId: targetId, unitPrice: input.unitPrice ?? null },
      });
      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(rows);
    });
  }

  /**
   * Remove a line while the quotation is a draft.
   *
   * The escape hatch, granted by 016 from the start rather than by a fix-up later:
   * `update` can correct a line but cannot remove a duplicate, and a second attempt
   * cannot be started while one is open.
   */
  async removeLine(ctx: TenantContext, quotationId: string, lineId: string): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(quotationId, 'id');
    const targetId = requireUuid(lineId, 'lineId');

    return this.db.withTenant(ctx, async (client) => {
      const quotation = await this.assertWritable(client, ctx, id);
      const removed = await client.query(
        `DELETE FROM repair.quotation_lines
          WHERE id = $1 AND quotation_id = $2 AND tenant_id = $3`,
        [targetId, id, ctx.tenantId],
      );
      if (removed.rowCount === 0) {
        throw new NotFoundException('line not found on this quotation');
      }
      await this.audit.write(client, ctx, {
        action: 'quotation.line_removed',
        resourceType: 'quotation',
        resourceId: id,
        // A row that is gone leaves no other trace.
        detail: { jobNumber: quotation.job_number, lineId: targetId },
      });
      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(rows);
    });
  }

  /**
   * §5 — submit for internal approval.
   *
   * ── THE GATES, AND WHY THEY ARE ABOUT MONEY ────────────────────────────────
   *
   * 1. At least one NON-OPTIONAL line. A quotation whose every line is an optional
   *    extra quotes nothing for the repair itself.
   * 2. No line priced at zero unless it is explicitly an `other_charge`. Parts are
   *    generated at zero deliberately (there is no catalogue), so submitting without
   *    pricing them would send a customer a quotation offering free parts — and
   *    unlike a missing labour estimate, nobody downstream would question it.
   * 3. The discount cannot exceed the subtotal. A discount larger than the price is a
   *    negative total, which is a refund the workshop never agreed to.
   */
  async submit(ctx: TenantContext, quotationId: string): Promise<Quotation> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(quotationId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const quotation = await this.assertWritable(client, ctx, id);

      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      const current = QuotationService.one(rows);

      const chargeable = current.lines.filter((l) => !l.isOptional);
      if (chargeable.length === 0) {
        throw new BadRequestException(
          'a quotation cannot be submitted with no chargeable lines; every line on it is ' +
            'marked as an optional extra, so nothing is being quoted for the repair itself',
        );
      }

      const unpriced = chargeable.filter((l) => l.unitPrice === 0 && l.lineKind !== 'other_charge');
      if (unpriced.length > 0) {
        const names = unpriced.slice(0, 5).map((l) => `${l.position}. ${l.description}`).join('; ');
        throw new BadRequestException(
          `${unpriced.length} line(s) are still priced at zero and would quote the customer ` +
            `nothing for them. Price them, mark them optional, or remove them: ${names}`,
        );
      }

      if (current.discountAmount > current.subtotal) {
        throw new BadRequestException(
          `the discount (${current.discountAmount}) is larger than the subtotal ` +
            `(${current.subtotal}), which would quote a negative price`,
        );
      }

      await client.query(
        `UPDATE repair.quotations
            SET status = 'submitted', submitted_by = $1, submitted_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'quotation.submitted',
        resourceType: 'quotation',
        resourceId: id,
        // The MONEY, in full. This is the one audit entry a dispute is settled from.
        detail: {
          jobNumber: quotation.job_number,
          attemptNo: quotation.attempt_no,
          currency: current.currency,
          subtotal: current.subtotal,
          discountAmount: current.discountAmount,
          taxAmount: current.taxAmount,
          total: current.total,
          lines: current.lines.length,
        },
      });

      const after = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(after);
    });
  }

  /**
   * §5's internal approval — approve, or reject with a reason.
   *
   * Both independence rules, exactly as slices 3b and 4:
   *   · ROLE — `CAN_APPROVE_QUOTATION` is narrower than `CAN_PREPARE_QUOTATION`, so
   *     reception can draft a price but cannot commit the business to it.
   *   · IDENTITY — the approver may not be the person who submitted it.
   */
  async review(
    ctx: TenantContext,
    quotationId: string,
    input: { decision?: string; note?: string },
  ): Promise<Quotation> {
    this.assertMayApprove(ctx);
    const id = requireUuid(quotationId, 'id');
    const decision: QuotationReviewDecision = requireOneOf(
      input.decision, QUOTATION_REVIEW_DECISIONS, 'decision',
    );
    const note = optionalText(input.note, 'note', 8000);
    if (decision === 'rejected' && note === null) {
      throw new BadRequestException('a rejection must give a reason; note is required');
    }

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT q.id, q.status, q.attempt_no, q.submitted_by, j.job_number
           FROM repair.quotations q
           JOIN repair.job_cards j ON j.id = q.job_card_id AND j.tenant_id = q.tenant_id
          WHERE q.id = $1 AND q.tenant_id = $2 AND q.organization_id = $3
          FOR UPDATE OF q`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as ReviewRow | undefined;
      if (!row) throw new NotFoundException('quotation not found');

      if (row.status === 'draft') {
        throw new ConflictException('this quotation has not been submitted yet and cannot be approved');
      }
      if (row.status !== 'submitted') {
        throw new ConflictException(
          `this quotation was already ${row.status} and cannot be reviewed again; ` +
            'a revised price is a new quotation',
        );
      }
      if (row.submitted_by !== null && row.submitted_by === ctx.userId) {
        throw new ForbiddenException(
          'you submitted this quotation and cannot also approve it; another manager must approve it',
        );
      }

      await client.query(
        `UPDATE repair.quotations
            SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3,
                updated_at = now(), updated_by = $2
          WHERE id = $4 AND tenant_id = $5`,
        [decision, ctx.userId, note, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: decision === 'approved' ? 'quotation.approved' : 'quotation.rejected',
        resourceType: 'quotation',
        resourceId: id,
        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
      });

      const rows = await this.readQuotations(client, ctx, { quotationId: id });
      return QuotationService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private async readQuotations(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; quotationId?: string },
  ): Promise<Quotation[]> {
    const headers = await client.query(
      `SELECT q.id, q.job_card_id, j.job_number, j.complaint, v.registration_number,
              c.display_name AS customer_name,
              q.repair_plan_id, p.attempt_no AS plan_attempt_no,
              d.summary AS diagnosis_summary,
              q.attempt_no, q.status, q.currency, q.labour_rate,
              q.tax_name, q.tax_rate_percent, q.discount_amount, q.discount_reason,
              q.valid_until, q.warranty_terms, q.completion_conditions,
              q.recommended_repair, q.alternative_options,
              q.prepared_at, q.submitted_at, q.reviewed_at, q.review_note, q.submitted_by,
              pb.display_name AS prepared_by_name,
              sb.display_name AS submitted_by_name,
              rb.display_name AS reviewed_by_name
         FROM repair.quotations q
         JOIN repair.job_cards j ON j.id = q.job_card_id AND j.tenant_id = q.tenant_id
         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
         JOIN repair.repair_plans p ON p.id = q.repair_plan_id AND p.tenant_id = q.tenant_id
         -- The diagnosis behind the plan, for §4's summary. Read LIVE rather than
         -- copied: 012 froze an approved diagnosis, so it gives the same answer
         -- forever and a second copy would be a second thing to keep in step.
         JOIN repair.diagnoses d ON d.id = p.diagnosis_id AND d.tenant_id = p.tenant_id
         LEFT JOIN identity.users pb ON pb.id = q.prepared_by
         LEFT JOIN identity.users sb ON sb.id = q.submitted_by
         LEFT JOIN identity.users rb ON rb.id = q.reviewed_by
        WHERE q.tenant_id = $1
          AND q.organization_id = $2
          AND ($3::uuid IS NULL OR q.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR q.id = $4::uuid)
          -- THE SAME NARROWING THE JOB CARD CARRIES. A technician may READ a
          -- quotation, but only for a card they are assigned to.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY q.attempt_no DESC`,
      [
        ctx.tenantId, ctx.organizationId,
        filter.jobCardId ?? null, filter.quotationId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const lines = await client.query(
      `SELECT id, quotation_id, position, line_kind, repair_plan_task_id,
              repair_plan_resource_id, description, quantity, unit, unit_price,
              line_total, is_optional
         FROM repair.quotation_lines
        WHERE quotation_id = ANY($1::uuid[]) AND tenant_id = $2
        ORDER BY position`,
      [rows.map((r) => r.id), ctx.tenantId],
    );

    const byQuotation = new Map<string, QuotationLine[]>();
    for (const raw of lines.rows as LineRow[]) {
      const list = byQuotation.get(raw.quotation_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        lineKind: raw.line_kind,
        lineKindLabel: lineKindLabel(raw.line_kind),
        repairPlanTaskId: raw.repair_plan_task_id,
        repairPlanResourceId: raw.repair_plan_resource_id,
        description: raw.description,
        // ⚠️ EVERY `numeric` ARRIVES FROM `pg` AS A STRING. Left as-is, `subtotal`
        // below would be string concatenation — "100" + "50" = "10050" — which is a
        // wrong customer price that no type error catches.
        quantity: Number(raw.quantity),
        unit: raw.unit,
        unitPrice: Number(raw.unit_price),
        lineTotal: Number(raw.line_total),
        isOptional: raw.is_optional,
      });
      byQuotation.set(raw.quotation_id, list);
    }

    return rows.map((row) => {
      const list = byQuotation.get(row.id) ?? [];
      const chargeable = list.filter((l) => !l.isOptional);
      // Every total is rounded to 2 places at each step, in the currency's own minor
      // unit, rather than summed as floats and rounded once at the end — which is how
      // a total comes to differ from the sum of the lines a customer can read.
      const subtotal = round2(chargeable.reduce((s, l) => s + l.lineTotal, 0));
      const optionalTotal = round2(
        list.filter((l) => l.isOptional).reduce((s, l) => s + l.lineTotal, 0),
      );
      const discount = Number(row.discount_amount);
      const taxable = Math.max(0, round2(subtotal - discount));
      const taxAmount = round2((taxable * Number(row.tax_rate_percent)) / 100);
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        customerName: row.customer_name,
        complaint: row.complaint,
        repairPlanId: row.repair_plan_id,
        repairPlanAttemptNo: row.plan_attempt_no,
        diagnosisSummary: row.diagnosis_summary,
        attemptNo: row.attempt_no,
        status: row.status,
        currency: row.currency,
        labourRate: Number(row.labour_rate),
        taxName: row.tax_name,
        taxRatePercent: Number(row.tax_rate_percent),
        discountAmount: discount,
        discountReason: row.discount_reason,
        validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
        warrantyTerms: row.warranty_terms,
        completionConditions: row.completion_conditions,
        recommendedRepair: row.recommended_repair,
        alternativeOptions: row.alternative_options,
        preparedByName: row.prepared_by_name,
        preparedAt: row.prepared_at.toISOString(),
        submittedByName: row.submitted_by_name,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        reviewedByName: row.reviewed_by_name,
        reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
        reviewNote: row.review_note,
        lines: list,
        subtotal,
        optionalTotal,
        taxAmount,
        total: round2(taxable + taxAmount),
        editable: row.status === 'draft' && CAN_PREPARE_QUOTATION.has(ctx.activeRole),
        reviewable:
          row.status === 'submitted' &&
          CAN_APPROVE_QUOTATION.has(ctx.activeRole) &&
          row.submitted_by !== ctx.userId,
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
    // 404, not 403 — the same non-oracle rule as everywhere else here.
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  private async assertWritable(
    client: Client,
    ctx: TenantContext,
    quotationId: string,
  ): Promise<{ job_number: string; attempt_no: number }> {
    const found = await client.query(
      `SELECT q.id, q.status, q.attempt_no, j.job_number
         FROM repair.quotations q
         JOIN repair.job_cards j ON j.id = q.job_card_id AND j.tenant_id = q.tenant_id
        WHERE q.id = $1 AND q.tenant_id = $2 AND q.organization_id = $3
        FOR UPDATE OF q`,
      [quotationId, ctx.tenantId, ctx.organizationId],
    );
    const row = found.rows[0] as
      | { id: string; status: QuotationStatus; attempt_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('quotation not found');
    if (row.status !== 'draft') {
      throw new ConflictException(
        `this quotation is ${row.status} and cannot be changed; prepare a new quotation to record a revised price`,
      );
    }
    return { job_number: row.job_number, attempt_no: row.attempt_no };
  }

  /**
   * A nullable text column: absent leaves it, null/'' clears it, a string sets it.
   *
   * ⚠️ A NON-STRING IS A 400, NOT A SILENT CLEAR — the data-loss regression the
   * Supervisor caught on slice 3b's clear-semantics commit.
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

  /**
   * A money amount — at most two decimals, never negative, never a float artefact.
   *
   * ⚠️ THE PRECISION IS CHECKED HERE, not left to the column. `numeric(14,2)` ROUNDS
   * `10.005` to `10.01` silently; it does not refuse it. On a price, the number the
   * advisor typed and the number the customer is charged must be the same number.
   */
  private requireMoney(value: unknown, field: string, allowZero: boolean): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${field} must be an amount`);
    }
    if (value < 0 || (!allowZero && value === 0)) {
      throw new BadRequestException(`${field} must be ${allowZero ? 'zero or more' : 'more than zero'}`);
    }
    if (value > 999999999999.99) throw new BadRequestException(`${field} is implausibly large`);
    if (Math.round(value * 100) !== value * 100) {
      throw new BadRequestException(`${field} is recorded to two decimal places; round it first`);
    }
    return value;
  }

  private requireQuantity(value: unknown): number {
    if (value === undefined || value === null) throw new BadRequestException('quantity is required');
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException('quantity must be a number');
    }
    if (value <= 0) throw new BadRequestException('quantity must be greater than zero');
    if (value > 999999999) throw new BadRequestException('quantity is implausibly large');
    if (Math.round(value * 1000) !== value * 1000) {
      throw new BadRequestException('quantity is recorded to three decimal places; round it first');
    }
    return value;
  }

  private static one(rows: Quotation[]): Quotation {
    const first = rows[0];
    if (!first) throw new NotFoundException('quotation not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_QUOTATION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read quotations`);
    }
  }

  private assertMayPrepare(ctx: TenantContext): void {
    if (!CAN_PREPARE_QUOTATION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a quotation`);
    }
  }

  private assertMayApprove(ctx: TenantContext): void {
    if (!CAN_APPROVE_QUOTATION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not approve a quotation`);
    }
  }
}

/** Two decimal places, the currency's minor unit. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Client {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface PricingRow {
  currency: string;
  default_labour_rate: string;
  tax_name: string;
  tax_rate_percent: string;
  default_validity_days: number;
  default_warranty_terms: string | null;
}

interface CardRow {
  id: string;
  job_number: string;
  stage: string;
}

interface ReviewRow {
  id: string;
  status: QuotationStatus;
  attempt_no: number;
  submitted_by: string | null;
  job_number: string;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  complaint: string;
  registration_number: string;
  customer_name: string;
  repair_plan_id: string;
  plan_attempt_no: number;
  diagnosis_summary: string | null;
  attempt_no: number;
  status: QuotationStatus;
  currency: string;
  labour_rate: string;
  tax_name: string;
  tax_rate_percent: string;
  discount_amount: string;
  discount_reason: string | null;
  valid_until: Date | null;
  warranty_terms: string | null;
  completion_conditions: string | null;
  recommended_repair: string | null;
  alternative_options: string | null;
  prepared_at: Date;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  review_note: string | null;
  submitted_by: string | null;
  prepared_by_name: string | null;
  submitted_by_name: string | null;
  reviewed_by_name: string | null;
}

interface LineRow {
  id: string;
  quotation_id: string;
  position: number;
  line_kind: LineKind;
  repair_plan_task_id: string | null;
  repair_plan_resource_id: string | null;
  description: string;
  quantity: string;
  unit: string | null;
  unit_price: string;
  line_total: string;
  is_optional: boolean;
}
