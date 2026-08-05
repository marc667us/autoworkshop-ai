import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  FinanceInputError,
  invoiceStatusFor,
  mayBill,
  mayRefund,
  parseInvoiceTransition,
} from './finance-rules';

export interface InvoiceLine {
  id: string;
  position: number;
  lineKind: string;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobCardId: string;
  jobNumber: string | null;
  quotationId: string | null;
  customerId: string | null;
  customerName: string | null;
  registrationNumber: string | null;
  status: string;
  currency: string;
  taxRatePercent: string;
  netTotal: string;
  taxTotal: string;
  grossTotal: string;
  /** Summed from `finance.payments`, never a stored counter. */
  paidTotal: string;
  creditedTotal: string;
  refundedTotal: string;
  /** gross − credited − paid, floored at zero. What is actually still owed. */
  balance: string;
  notes: string | null;
  voidReason: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  settledAt: string | null;
  createdAt: string;
  lines?: InvoiceLine[];
}

/**
 * Money — slice 3 of `COMPLETION_PLAN.md`.
 *
 * Before this, a job reached quality control and stopped: there was no invoice,
 * so no job could be closed for money and no vehicle released against a payment.
 *
 * ── ⚠️ NOTHING HERE TAKES A PAYMENT ────────────────────────────────────────
 *
 * ADR-012 forbids a paid dependency and every card processor is one. A payment
 * is RECORDED — somebody at the desk marks that cash, a transfer or a cheque
 * arrived. The screens say so, and `payment_method` has no `card_online` value,
 * because a value the product cannot honour is a promise the desk cannot keep.
 *
 * ── ⚠️ EVERY TOTAL IS COMPUTED BY POSTGRES ─────────────────────────────────
 *
 * `line_total` is a GENERATED column and the sums below are SQL aggregates in
 * `numeric`. Nothing in TypeScript adds up money: floating point cannot hold
 * 0.1, and a total this service computed would be free to disagree with the one
 * the database computes for the same rows. `finance-rules.ts` sees numbers only
 * to CHOOSE A STATUS.
 *
 * ── ⚠️ EVERY QUERY CARRIES tenant_id AND organization_id ────────────────────
 *
 * The RLS here is tenant-wide and a tenant holds more than one organisation —
 * the hole Codex found in `MediaService` on 2026-08-06. A tenant predicate is
 * not an organisation predicate.
 */
@Injectable()
export class FinanceService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayBill(ctx: TenantContext): void {
    if (!mayBill(ctx.activeRole)) {
      throw new ForbiddenException(
        'Billing is a front-desk or cashier function. Your role can see invoices but not raise them — ' +
          'ask reception, the cashier, the workshop manager or the owner.',
      );
    }
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /**
   * The invoice list, with everything the screens need already summed.
   *
   * ⚠️ THE SUMS ARE LATERAL SUBQUERIES, NOT STORED COLUMNS. A stored
   * `paid_total` drifts the first time a payment insert is retried or a credit
   * note lands out of order; a sum over the rows cannot be wrong about the rows.
   */
  async listInvoices(
    ctx: TenantContext,
    opts: { status?: string; jobCardId?: string; unpaidOnly?: boolean } = {},
  ): Promise<Invoice[]> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT i.*, j.job_number, c.display_name AS customer_name,
                v.registration_number,
                p.paid_total, cr.credited_total, r.refunded_total
           FROM finance.invoices i
           LEFT JOIN repair.job_cards j ON j.id = i.job_card_id
           LEFT JOIN core.customers   c ON c.id = i.customer_id
           LEFT JOIN core.vehicles    v ON v.id = j.vehicle_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS paid_total
               FROM finance.payments WHERE invoice_id = i.id
           ) p ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS credited_total
               FROM finance.credit_notes WHERE invoice_id = i.id
           ) cr ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(rf.amount), 0) AS refunded_total
               FROM finance.refunds rf
               JOIN finance.payments pp ON pp.id = rf.payment_id
              WHERE pp.invoice_id = i.id
           ) r ON true
          WHERE i.tenant_id = $1 AND i.organization_id = $2
            AND ($3::text IS NULL OR i.status = $3)
            AND ($4::uuid IS NULL OR i.job_card_id = $4)
            AND (NOT $5::boolean OR i.status IN ('issued', 'part_paid'))
          ORDER BY i.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, opts.status ?? null,
         opts.jobCardId ?? null, opts.unpaidOnly ?? false],
      );
      return rows.rows.map((r) => this.toInvoice(r));
    });
  }

  async getInvoice(ctx: TenantContext, invoiceId: string): Promise<Invoice> {
    return this.db.withTenant(ctx, async (client) => {
      const all = await this.listInvoices(ctx, {});
      const invoice = all.find((i) => i.id === invoiceId);
      if (!invoice) throw new NotFoundException('no such invoice');

      const lines = await client.query<Record<string, unknown>>(
        `SELECT id, position, line_kind, description, quantity, unit,
                unit_price, line_total
           FROM finance.invoice_lines
          WHERE invoice_id = $1 AND tenant_id = $2 AND organization_id = $3
          ORDER BY position ASC`,
        [invoiceId, ctx.tenantId, ctx.organizationId],
      );
      invoice.lines = lines.rows.map((l) => ({
        id: l.id as string,
        position: Number(l.position),
        lineKind: l.line_kind as string,
        description: l.description as string,
        quantity: String(l.quantity),
        unit: (l.unit as string) ?? null,
        unitPrice: String(l.unit_price),
        lineTotal: String(l.line_total),
      }));
      return invoice;
    });
  }

  // ── raising an invoice ────────────────────────────────────────────────────

  /**
   * Build a draft invoice for a job card, from its approved quotation when it
   * has one.
   *
   * ⚠️ THE LINES ARE COPIED, NOT JOINED. A quotation is what the customer
   * AGREED to; the invoice is what they are ASKED to pay, and the two are
   * allowed to differ (work that was not needed, a part substituted). Reading
   * the quotation live at render time would mean an invoice that silently
   * changed whenever the quotation did.
   *
   * ⚠️ OPTIONAL QUOTATION LINES ARE EXCLUDED. `is_optional` marks an option the
   * customer could decline; billing it by default is charging for something
   * nobody agreed to.
   */
  async createInvoiceForJobCard(
    ctx: TenantContext,
    input: { jobCardId: string; dueAt?: string; notes?: string },
  ): Promise<Invoice> {
    this.assertMayBill(ctx);

    const invoiceId = await this.db.withTenant(ctx, async (client) => {
      const job = await client.query<{ id: string; customer_id: string | null }>(
        `SELECT j.id, v.customer_id
           FROM repair.job_cards j
           LEFT JOIN core.vehicles v ON v.id = j.vehicle_id
          WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3`,
        [input.jobCardId, ctx.tenantId, ctx.organizationId],
      );
      if (!job.rowCount) throw new NotFoundException('no such job card');

      // One open invoice per job card. A second would let a customer be billed
      // twice for the same work, and reconciling the two is nobody's job.
      const existing = await client.query(
        `SELECT 1 FROM finance.invoices
          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status <> 'void'`,
        [input.jobCardId, ctx.tenantId, ctx.organizationId],
      );
      if (existing.rowCount) {
        throw new ConflictException(
          'This job card already has an invoice. Void that one first if it is wrong, ' +
            'or issue a credit note against it if it has already been sent.',
        );
      }

      const quotation = await client.query<{
        id: string; currency: string; tax_rate_percent: string;
      }>(
        `SELECT id, currency, tax_rate_percent
           FROM repair.quotations
          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'approved'
          ORDER BY attempt_no DESC LIMIT 1`,
        [input.jobCardId, ctx.tenantId, ctx.organizationId],
      );
      const quote = quotation.rows[0] ?? null;

      // The workshop's own currency when there is no quotation to take one
      // from. `organization_pricing` is where the workshop's rates live.
      const pricing = await client.query<{ currency: string; tax_rate_percent: string }>(
        `SELECT currency, tax_rate_percent FROM repair.organization_pricing
          WHERE organization_id = $1 AND tenant_id = $2`,
        [ctx.organizationId, ctx.tenantId],
      );

      const currency = quote?.currency ?? pricing.rows[0]?.currency ?? 'GHS';
      const taxRate = quote?.tax_rate_percent ?? pricing.rows[0]?.tax_rate_percent ?? '0';

      const number = await this.nextNumber(client, ctx, 'INV');

      const created = await client.query<{ id: string }>(
        `INSERT INTO finance.invoices
           (tenant_id, organization_id, job_card_id, quotation_id, customer_id,
            invoice_number, currency, tax_rate_percent, due_at, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, input.jobCardId, quote?.id ?? null,
         job.rows[0]!.customer_id, number, currency, taxRate,
         input.dueAt ?? null, input.notes ?? null, ctx.userId],
      );
      const id = created.rows[0]!.id;

      if (quote) {
        await client.query(
          `INSERT INTO finance.invoice_lines
             (tenant_id, organization_id, invoice_id, position, line_kind,
              quotation_line_id, description, quantity, unit, unit_price, recorded_by)
           SELECT $1, $2, $3, ql.position, ql.line_kind, ql.id, ql.description,
                  ql.quantity, ql.unit, ql.unit_price, $4
             FROM repair.quotation_lines ql
            WHERE ql.quotation_id = $5 AND ql.tenant_id = $1
              -- An option the customer could decline is not a charge.
              AND ql.is_optional = false
            ORDER BY ql.position`,
          [ctx.tenantId, ctx.organizationId, id, ctx.userId, quote.id],
        );
      }

      await this.recomputeDraftTotals(client, ctx, id);
      return id;
    });

    return this.getInvoice(ctx, invoiceId);
  }

  /** Add a line by hand. Refused once issued — by the database, not only here. */
  async addLine(
    ctx: TenantContext,
    invoiceId: string,
    input: {
      lineKind: string; description: string; quantity: number;
      unit?: string; unitPrice: number;
    },
  ): Promise<Invoice> {
    this.assertMayBill(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const invoice = await client.query<{ status: string }>(
        `SELECT status FROM finance.invoices
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [invoiceId, ctx.tenantId, ctx.organizationId],
      );
      if (!invoice.rowCount) throw new NotFoundException('no such invoice');
      if (invoice.rows[0]!.status !== 'draft') {
        // `trg_invoice_line_frozen` refuses this anyway, on INSERT as well as
        // UPDATE. Saying it here turns a trigger message into a sentence naming
        // what to do instead.
        throw new ConflictException(
          'This invoice has been issued, so its lines are what the customer was shown. ' +
            'Issue a credit note to reduce it.',
        );
      }

      await client.query(
        `INSERT INTO finance.invoice_lines
           (tenant_id, organization_id, invoice_id, position, line_kind,
            description, quantity, unit, unit_price, recorded_by)
         VALUES ($1,$2,$3,
                 COALESCE((SELECT max(position) + 1 FROM finance.invoice_lines
                            WHERE invoice_id = $3), 0),
                 $4,$5,$6,$7,$8,$9)`,
        [ctx.tenantId, ctx.organizationId, invoiceId, input.lineKind,
         input.description.trim(), input.quantity, input.unit ?? null,
         input.unitPrice, ctx.userId],
      );
      await this.recomputeDraftTotals(client, ctx, invoiceId);
    });
    return this.getInvoice(ctx, invoiceId);
  }

  async changeInvoiceStatus(
    ctx: TenantContext,
    invoiceId: string,
    input: { status: string; voidReason?: string },
  ): Promise<Invoice> {
    this.assertMayBill(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const current = await client.query<{ status: string; gross_total: string }>(
        `SELECT status, gross_total FROM finance.invoices
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [invoiceId, ctx.tenantId, ctx.organizationId],
      );
      if (!current.rowCount) throw new NotFoundException('no such invoice');

      let next: string;
      try {
        next = parseInvoiceTransition(current.rows[0]!.status, input.status);
      } catch (error) {
        if (error instanceof FinanceInputError) throw new BadRequestException(error.message);
        throw error;
      }

      if (next === 'void' && !input.voidReason?.trim()) {
        throw new BadRequestException(
          'Say why the invoice is being voided. A voided invoice stays on record, and the ' +
            'reason is the only thing that explains it later.',
        );
      }

      if (next === 'issued') {
        // Totals are snapshot at issue and frozen by the trigger from here on.
        await this.recomputeDraftTotals(client, ctx, invoiceId);
        const totals = await client.query<{ gross_total: string }>(
          `SELECT gross_total FROM finance.invoices WHERE id = $1`,
          [invoiceId],
        );
        if (Number(totals.rows[0]!.gross_total) <= 0) {
          throw new BadRequestException(
            'This invoice has nothing on it. Add at least one line before issuing it.',
          );
        }
        await client.query(
          `UPDATE finance.invoices
              SET status = 'issued', issued_at = now(), updated_by = $4
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
          [invoiceId, ctx.tenantId, ctx.organizationId, ctx.userId],
        );
      } else {
        await client.query(
          `UPDATE finance.invoices
              SET status = $4, void_reason = COALESCE($5, void_reason), updated_by = $6
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
          [invoiceId, ctx.tenantId, ctx.organizationId, next,
           input.voidReason?.trim() ?? null, ctx.userId],
        );
      }
    });
    return this.getInvoice(ctx, invoiceId);
  }

  // ── money in ──────────────────────────────────────────────────────────────

  /**
   * Record a payment, and derive the invoice's new status in the SAME
   * transaction.
   *
   * ⚠️ THE STATUS IS DERIVED FROM A SUM, never incremented. A counter drifts the
   * first time an insert is retried; a sum over the payment rows cannot be wrong
   * about the payment rows.
   */
  async recordPayment(
    ctx: TenantContext,
    invoiceId: string,
    input: { amount: number; paymentMethod: string; reference?: string; notes?: string },
  ): Promise<{ invoice: Invoice; receiptNumber: string }> {
    this.assertMayBill(ctx);

    const receiptNumber = await this.db.withTenant(ctx, async (client) => {
      const invoice = await client.query<{
        status: string; currency: string; gross_total: string;
      }>(
        `SELECT status, currency, gross_total FROM finance.invoices
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [invoiceId, ctx.tenantId, ctx.organizationId],
      );
      if (!invoice.rowCount) throw new NotFoundException('no such invoice');
      const inv = invoice.rows[0]!;

      if (inv.status === 'draft') {
        throw new ConflictException(
          'This invoice has not been issued yet, so there is nothing for the customer to pay. ' +
            'Issue it first.',
        );
      }
      if (inv.status === 'void') {
        throw new ConflictException('This invoice was voided. Raise a new one.');
      }
      if (inv.status === 'paid') {
        throw new ConflictException('This invoice is already settled.');
      }

      const payment = await client.query<{ id: string }>(
        `INSERT INTO finance.payments
           (tenant_id, organization_id, invoice_id, amount, currency,
            payment_method, reference, notes, received_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, invoiceId, input.amount, inv.currency,
         input.paymentMethod, input.reference ?? null, input.notes ?? null, ctx.userId],
      );

      // The customer's copy, in the same transaction: a payment that produced no
      // receipt would leave the desk with nothing to hand over.
      const number = await this.nextNumber(client, ctx, 'RCT');
      await client.query(
        `INSERT INTO finance.receipts
           (tenant_id, organization_id, payment_id, receipt_number, issued_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.tenantId, ctx.organizationId, payment.rows[0]!.id, number, ctx.userId],
      );

      const sums = await client.query<{ paid: string; credited: string }>(
        `SELECT
           (SELECT COALESCE(sum(amount),0) FROM finance.payments WHERE invoice_id = $1) AS paid,
           (SELECT COALESCE(sum(amount),0) FROM finance.credit_notes WHERE invoice_id = $1) AS credited`,
        [invoiceId],
      );

      const next = invoiceStatusFor({
        grossTotal: Number(inv.gross_total),
        paid: Number(sums.rows[0]!.paid),
        credited: Number(sums.rows[0]!.credited),
      });

      await client.query(
        `UPDATE finance.invoices
            SET status = $2,
                settled_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END,
                updated_by = $3
          WHERE id = $1`,
        [invoiceId, next, ctx.userId],
      );

      return number;
    });

    return { invoice: await this.getInvoice(ctx, invoiceId), receiptNumber };
  }

  // ── money out ─────────────────────────────────────────────────────────────

  private assertMayRefund(ctx: TenantContext): void {
    if (!mayRefund(ctx.activeRole)) {
      throw new ForbiddenException(
        'Refunds and credit notes move money out of the business, so they are the ' +
          "owner's or the workshop manager's decision. Ask one of them.",
      );
    }
  }

  async issueCreditNote(
    ctx: TenantContext,
    invoiceId: string,
    input: { amount: number; reason: string },
  ): Promise<Invoice> {
    this.assertMayRefund(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const invoice = await client.query<{ status: string; currency: string; gross_total: string }>(
        `SELECT status, currency, gross_total FROM finance.invoices
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [invoiceId, ctx.tenantId, ctx.organizationId],
      );
      if (!invoice.rowCount) throw new NotFoundException('no such invoice');
      if (invoice.rows[0]!.status === 'draft') {
        throw new ConflictException(
          'This invoice has not been issued, so there is nothing to credit. Edit the lines instead.',
        );
      }

      const already = await client.query<{ credited: string }>(
        `SELECT COALESCE(sum(amount),0) AS credited FROM finance.credit_notes WHERE invoice_id = $1`,
        [invoiceId],
      );
      const gross = Number(invoice.rows[0]!.gross_total);
      if (Number(already.rows[0]!.credited) + input.amount > gross) {
        throw new BadRequestException(
          `Crediting ${input.amount} would take the total credited past the ${gross} this ` +
            'invoice is for. A credit note reduces what is owed; it cannot make the workshop owe the customer.',
        );
      }

      const number = await this.nextNumber(client, ctx, 'CRN');
      await client.query(
        `INSERT INTO finance.credit_notes
           (tenant_id, organization_id, invoice_id, credit_number, amount, currency, reason, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ctx.tenantId, ctx.organizationId, invoiceId, number, input.amount,
         invoice.rows[0]!.currency, input.reason.trim(), ctx.userId],
      );

      // A credit note can settle an invoice on its own, so the status is
      // re-derived here for the same reason it is after a payment.
      const sums = await client.query<{ paid: string; credited: string }>(
        `SELECT
           (SELECT COALESCE(sum(amount),0) FROM finance.payments WHERE invoice_id = $1) AS paid,
           (SELECT COALESCE(sum(amount),0) FROM finance.credit_notes WHERE invoice_id = $1) AS credited`,
        [invoiceId],
      );
      const next = invoiceStatusFor({
        grossTotal: gross,
        paid: Number(sums.rows[0]!.paid),
        credited: Number(sums.rows[0]!.credited),
      });
      await client.query(
        `UPDATE finance.invoices
            SET status = $2, settled_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END
          WHERE id = $1`,
        [invoiceId, next],
      );
    });
    return this.getInvoice(ctx, invoiceId);
  }

  /**
   * Give money back against a payment.
   *
   * The over-refund rule is enforced by `trg_refund_limit` in Postgres, because
   * it spans rows and a CHECK constraint cannot see them. This translates the
   * trigger's refusal into a sentence rather than duplicating the arithmetic —
   * two implementations of the same limit is how they come to disagree.
   */
  async issueRefund(
    ctx: TenantContext,
    paymentId: string,
    input: { amount: number; reason: string; refundMethod: string },
  ): Promise<void> {
    this.assertMayRefund(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const payment = await client.query<{ currency: string }>(
        `SELECT currency FROM finance.payments
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [paymentId, ctx.tenantId, ctx.organizationId],
      );
      if (!payment.rowCount) throw new NotFoundException('no such payment');

      try {
        await client.query(
          `INSERT INTO finance.refunds
             (tenant_id, organization_id, payment_id, amount, currency, reason,
              refund_method, issued_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ctx.tenantId, ctx.organizationId, paymentId, input.amount,
           payment.rows[0]!.currency, input.reason.trim(), input.refundMethod, ctx.userId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23514') {
          throw new BadRequestException(
            'That would refund more than was actually paid on this payment.',
          );
        }
        throw error;
      }
    });
  }

  /** Payments across the organisation — the receipts and payments screens. */
  async listPayments(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT p.id, p.amount, p.currency, p.payment_method, p.reference,
                p.received_at, u.display_name AS received_by_name,
                i.invoice_number, i.id AS invoice_id,
                c.display_name AS customer_name,
                rc.receipt_number, rc.issued_at AS receipt_issued_at,
                COALESCE(rf.refunded, 0) AS refunded
           FROM finance.payments p
           JOIN finance.invoices i ON i.id = p.invoice_id
           LEFT JOIN identity.users u ON u.id = p.received_by
           LEFT JOIN core.customers c ON c.id = i.customer_id
           LEFT JOIN finance.receipts rc ON rc.payment_id = p.id
           LEFT JOIN LATERAL (
             SELECT sum(amount) AS refunded FROM finance.refunds WHERE payment_id = p.id
           ) rf ON true
          WHERE p.tenant_id = $1 AND p.organization_id = $2
          ORDER BY p.received_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  /**
   * Revenue, by month.
   *
   * ⚠️ COUNTED FROM PAYMENTS RECEIVED, NET OF REFUNDS — not from invoices
   * issued. An invoice is a claim; money the workshop actually has is what a
   * revenue screen is asked about, and reporting issued-but-unpaid invoices as
   * revenue is how a business believes it is solvent when it is not.
   */
  async revenueByMonth(ctx: TenantContext, months = 12): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `WITH received AS (
           SELECT date_trunc('month', received_at) AS month,
                  sum(amount) AS taken, currency
             FROM finance.payments
            WHERE tenant_id = $1 AND organization_id = $2
              AND received_at >= date_trunc('month', now()) - make_interval(months => $3::int)
            GROUP BY 1, currency
         ), given_back AS (
           SELECT date_trunc('month', r.issued_at) AS month,
                  sum(r.amount) AS returned, r.currency
             FROM finance.refunds r
            WHERE r.tenant_id = $1 AND r.organization_id = $2
              AND r.issued_at >= date_trunc('month', now()) - make_interval(months => $3::int)
            GROUP BY 1, r.currency
         )
         SELECT COALESCE(rc.month, gb.month) AS month,
                COALESCE(rc.currency, gb.currency) AS currency,
                COALESCE(rc.taken, 0) AS taken,
                COALESCE(gb.returned, 0) AS refunded,
                COALESCE(rc.taken, 0) - COALESCE(gb.returned, 0) AS net
           FROM received rc
           FULL OUTER JOIN given_back gb
             ON gb.month = rc.month AND gb.currency = rc.currency
          ORDER BY 1 DESC`,
        [ctx.tenantId, ctx.organizationId, months],
      );
      return rows.rows;
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * The next human-facing number for this organisation.
   *
   * ⚠️ TAKES A LOCK ON THE ORGANISATION ROW so two desks issuing at once cannot
   * both read the same maximum. `uq_invoice_number` would catch the collision
   * anyway, but as a 500 rather than a number — and the person would have to
   * retype the invoice.
   */
  private async nextNumber(
    client: { query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    ctx: TenantContext,
    prefix: 'INV' | 'RCT' | 'CRN',
  ): Promise<string> {
    const table =
      prefix === 'INV' ? 'finance.invoices'
      : prefix === 'RCT' ? 'finance.receipts'
      : 'finance.credit_notes';
    const column =
      prefix === 'INV' ? 'invoice_number'
      : prefix === 'RCT' ? 'receipt_number'
      : 'credit_number';

    // The table and column are chosen from a closed set above and are never
    // caller text — the same rule `MediaService.OWNER_TABLES` follows.
    await client.query(
      `SELECT 1 FROM identity.organizations WHERE id = $1 FOR UPDATE`,
      [ctx.organizationId],
    );
    const rows = await client.query<{ next: string }>(
      `SELECT COALESCE(max(substring(${column} from '[0-9]+$')::bigint), 0) + 1 AS next
         FROM ${table}
        WHERE organization_id = $1 AND ${column} LIKE $2`,
      [ctx.organizationId, `${prefix}-%`],
    );
    return `${prefix}-${String(rows.rows[0]!.next).padStart(6, '0')}`;
  }

  /** Only ever called while the invoice is a draft; the trigger enforces that. */
  private async recomputeDraftTotals(
    client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
    ctx: TenantContext,
    invoiceId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE finance.invoices i
          SET net_total = t.net,
              tax_total = round(t.net * i.tax_rate_percent / 100, 2),
              gross_total = t.net + round(t.net * i.tax_rate_percent / 100, 2)
         FROM (SELECT COALESCE(sum(line_total), 0) AS net
                 FROM finance.invoice_lines WHERE invoice_id = $1) t
        WHERE i.id = $1 AND i.tenant_id = $2 AND i.status = 'draft'`,
      [invoiceId, ctx.tenantId],
    );
  }

  private toInvoice(r: Record<string, unknown>): Invoice {
    const gross = Number(r.gross_total ?? 0);
    const paid = Number(r.paid_total ?? 0);
    const credited = Number(r.credited_total ?? 0);
    return {
      id: r.id as string,
      invoiceNumber: r.invoice_number as string,
      jobCardId: r.job_card_id as string,
      jobNumber: (r.job_number as string) ?? null,
      quotationId: (r.quotation_id as string) ?? null,
      customerId: (r.customer_id as string) ?? null,
      customerName: (r.customer_name as string) ?? null,
      registrationNumber: (r.registration_number as string) ?? null,
      status: r.status as string,
      currency: r.currency as string,
      taxRatePercent: String(r.tax_rate_percent),
      netTotal: String(r.net_total),
      taxTotal: String(r.tax_total),
      grossTotal: String(r.gross_total),
      paidTotal: String(r.paid_total ?? 0),
      creditedTotal: String(r.credited_total ?? 0),
      refundedTotal: String(r.refunded_total ?? 0),
      balance: Math.max(0, Math.round((gross - credited - paid) * 100) / 100).toFixed(2),
      notes: (r.notes as string) ?? null,
      voidReason: (r.void_reason as string) ?? null,
      issuedAt: (r.issued_at as string) ?? null,
      dueAt: (r.due_at as string) ?? null,
      settledAt: (r.settled_at as string) ?? null,
      createdAt: r.created_at as string,
    };
  }
}
