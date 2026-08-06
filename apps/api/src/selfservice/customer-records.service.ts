import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { nextWarrantyNumber } from '../warranty/warranty-numbers';
import { resolveCustomerId, staffEcho } from './customer-scope';

/**
 * A CUSTOMER'S OWN MONEY AND WARRANTY — slice 12, `NEXT_SESSION_SCHEDULE.md` A2.
 *
 * ── 🔴 WHY THIS SERVICE EXISTS AT ALL ──────────────────────────────────────
 *
 * On 2026-08-07 eleven read methods in `FinanceService`, `WarrantyService` and
 * `PartsService` were found with NO role gate. `customer` is a real membership
 * role whose organisation IS the workshop's, so a signed-in customer could read
 * the workshop's entire invoice book, payment record, stock, supplier orders and
 * warranty decisions. `assertWorkshopStaff` closed that.
 *
 * ⚠️ CLOSING THE HOLE DID NOT OPEN THE DOOR. A customer must still see THEIR
 * OWN invoices, payments, receipts, quotations and warranty — and after the fix
 * they had no way to. That is not an argument for relaxing the gate. It is a
 * DIFFERENT QUERY, and this is it.
 *
 * The distinction, stated once:
 *
 *   `assertWorkshopStaff`  the workshop's books      → refuse a customer
 *   `resolveCustomerId`    one customer's own rows   → narrow to that customer
 *
 * A method needs exactly one of the two. Neither is the defect that started all
 * of this; both would be a contradiction.
 *
 * ── 🔴 THE PREDICATE IS THE JOB CARD, NOT THE INVOICE'S OWN COLUMN ─────────
 *
 * Every artefact here reaches its customer through `repair.job_cards`:
 *
 *     job card ─┬─ invoice ─┬─ payment ── receipt
 *               │           └─ credit note
 *               ├─ quotation ── proposal (what the customer was actually shown)
 *               └─ warranty policy ── claim
 *
 * `finance.invoices.customer_id` existed but was NULLABLE and was stamped from
 * the VEHICLE'S OWNER rather than the job card's customer, so it could disagree
 * with the job card — see migration 053, which makes the two agree, fills the
 * column and enforces it in Postgres. These queries can therefore trust
 * `i.customer_id`; the ones with no such column (quotations, warranty) join the
 * job card, which is the same fact by a longer path.
 *
 * ── ⚠️ STAFF READ THESE TOO, BY EXPLICIT CUSTOMER ID ───────────────────────
 *
 * A cashier answering "what does this customer still owe?" needs the same list.
 * `resolveCustomerId` lets a staff role name a customer and REFUSES a customer
 * who names one — so the same method serves both audiences without either being
 * able to ask the other's question.
 */

export interface MyInvoiceRow {
  id: string;
  invoiceNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  status: string;
  currency: string;
  grossTotal: string;
  paidTotal: string;
  creditedTotal: string;
  outstanding: string;
  issuedAt: string | null;
  dueAt: string | null;
  settledAt: string | null;
  isOverdue: boolean;
  lines?: MyInvoiceLine[];
}

export interface MyInvoiceLine {
  id: string;
  position: number;
  lineKind: string;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  lineTotal: string;
}

export interface MyPaymentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  reference: string | null;
  receivedAt: string;
  receiptNumber: string | null;
  refundedTotal: string;
}

export interface MyReceiptRow {
  id: string;
  receiptNumber: string;
  invoiceNumber: string;
  jobNumber: string | null;
  amount: string;
  currency: string;
  paymentMethod: string;
  issuedAt: string;
}

export interface MyQuotationRow {
  id: string;
  proposalId: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  versionNo: number;
  status: string;
  decision: string | null;
  currency: string;
  total: string;
  validUntil: string | null;
  warrantyTerms: string | null;
  recommendedRepair: string | null;
  issuedAt: string | null;
  decidedAt: string | null;
  awaitingYou: boolean;
}

export interface MyPolicyRow {
  id: string;
  policyNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  coverSummary: string;
  startsOn: string;
  expiresOn: string | null;
  expiresAtOdometer: number | null;
  status: string;
  isActive: boolean;
  daysRemaining: number | null;
  claimCount: number;
}

export interface MyClaimRow {
  id: string;
  claimNumber: string;
  policyNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  reportedFault: string;
  reportedAt: string;
  status: string;
  events: { at: string; kind: string; note: string | null }[];
}

@Injectable()
export class CustomerRecordsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ── invoices ──────────────────────────────────────────────────────────────

  /**
   * The customer's own invoices, with what is still outstanding already worked
   * out.
   *
   * ⚠️ THE TOTALS ARE SUMS OVER THE ROWS, NOT STORED COLUMNS — the same choice
   * `FinanceService.listInvoices` makes, and for the same reason: a stored
   * `paid_total` drifts the first time a payment insert is retried or a credit
   * note lands out of order. A customer being shown a wrong balance is worse
   * than a workshop being shown one, because they will pay it.
   *
   * ⚠️ DRAFTS ARE EXCLUDED. A draft invoice is the workshop still deciding what
   * to charge. Showing it to the customer would present a number nobody has
   * agreed to as though it were a bill, and the amount can still change.
   */
  async listMyInvoices(ctx: TenantContext, customerId?: string): Promise<MyInvoiceRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT i.id, i.invoice_number, i.status, i.currency, i.gross_total,
                i.issued_at, i.due_at, i.settled_at,
                j.job_number, v.registration_number,
                p.paid_total, cr.credited_total
           FROM finance.invoices i
           LEFT JOIN repair.job_cards j ON j.id = i.job_card_id
           LEFT JOIN core.vehicles    v ON v.id = j.vehicle_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS paid_total
               FROM finance.payments
              WHERE invoice_id = i.id
                AND tenant_id = i.tenant_id AND organization_id = i.organization_id
           ) p ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS credited_total
               FROM finance.credit_notes
              WHERE invoice_id = i.id
                AND tenant_id = i.tenant_id AND organization_id = i.organization_id
           ) cr ON true
          WHERE i.tenant_id = $1 AND i.organization_id = $2 AND i.customer_id = $3
            AND i.status <> 'draft'
          ORDER BY i.issued_at DESC NULLS LAST, i.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => this.toInvoice(x));
    });
  }

  async getMyInvoice(ctx: TenantContext, invoiceId: string, customerId?: string): Promise<MyInvoiceRow> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);

      // 🔴 THE CUSTOMER PREDICATE IS IN THE *WHERE*, NOT A CHECK AFTERWARDS.
      // Fetching by id and then comparing owners in TypeScript means the row
      // was already read, and a later refactor that forgets the comparison
      // leaks it. Here a foreign invoice simply does not exist.
      const r = await client.query(
        `SELECT i.id, i.invoice_number, i.status, i.currency, i.gross_total,
                i.issued_at, i.due_at, i.settled_at,
                j.job_number, v.registration_number,
                p.paid_total, cr.credited_total
           FROM finance.invoices i
           LEFT JOIN repair.job_cards j ON j.id = i.job_card_id
           LEFT JOIN core.vehicles    v ON v.id = j.vehicle_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS paid_total
               FROM finance.payments
              WHERE invoice_id = i.id
                AND tenant_id = i.tenant_id AND organization_id = i.organization_id
           ) p ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS credited_total
               FROM finance.credit_notes
              WHERE invoice_id = i.id
                AND tenant_id = i.tenant_id AND organization_id = i.organization_id
           ) cr ON true
          WHERE i.id = $4 AND i.tenant_id = $1 AND i.organization_id = $2
            AND i.customer_id = $3 AND i.status <> 'draft'`,
        [ctx.tenantId, ctx.organizationId, cid, invoiceId],
      );
      if (!r.rowCount) {
        throw new NotFoundException(
          'That invoice is not one of yours, or has not been issued yet.',
        );
      }
      const invoice = this.toInvoice(r.rows[0]!);

      const lines = await client.query(
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
        unit: (l.unit as string | null) ?? null,
        unitPrice: String(l.unit_price),
        lineTotal: String(l.line_total),
      }));
      return invoice;
    });
  }

  private toInvoice(x: Record<string, unknown>): MyInvoiceRow {
    const gross = Number(x.gross_total);
    const paid = Number(x.paid_total ?? 0);
    const credited = Number(x.credited_total ?? 0);
    // Never below zero: an overpayment is a refund question, not a negative
    // balance, and showing "-40.00 outstanding" invites the customer to work out
    // what it means.
    const outstanding = Math.max(0, gross - paid - credited);
    const dueAt = x.due_at ? (x.due_at as Date).toISOString() : null;
    return {
      id: x.id as string,
      invoiceNumber: x.invoice_number as string,
      jobNumber: (x.job_number as string | null) ?? null,
      registrationNumber: (x.registration_number as string | null) ?? null,
      status: x.status as string,
      currency: x.currency as string,
      grossTotal: gross.toFixed(2),
      paidTotal: paid.toFixed(2),
      creditedTotal: credited.toFixed(2),
      outstanding: outstanding.toFixed(2),
      issuedAt: x.issued_at ? (x.issued_at as Date).toISOString() : null,
      dueAt,
      settledAt: x.settled_at ? (x.settled_at as Date).toISOString() : null,
      // Overdue means MONEY IS STILL OWED past the date — not merely that the
      // date has passed. A fully paid invoice whose due date is in the past is
      // settled, and telling the customer it is overdue would be false.
      isOverdue: outstanding > 0 && dueAt !== null && new Date(dueAt).getTime() < Date.now(),
    };
  }

  // ── payments ──────────────────────────────────────────────────────────────

  /**
   * What the customer has actually paid.
   *
   * 🔴 THIS SCREEN RECORDS PAYMENTS, IT DOES NOT TAKE THEM. `finance.payments`
   * has no `card_online` method, deliberately: ADR-012 forbids a paid processor,
   * so the product records money the workshop received rather than collecting
   * it. The signpost this replaces promised "pays the workshop from inside the
   * app", which nothing in this system can do — the screen says so plainly
   * instead of rendering a button that cannot work.
   */
  async listMyPayments(ctx: TenantContext, customerId?: string): Promise<MyPaymentRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT p.id, p.invoice_id, p.amount, p.currency, p.payment_method,
                p.reference, p.received_at,
                i.invoice_number, rc.receipt_number,
                COALESCE(rf.refunded_total, 0) AS refunded_total
           FROM finance.payments p
           JOIN finance.invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
           LEFT JOIN finance.receipts rc ON rc.payment_id = p.id
                                        AND rc.tenant_id = p.tenant_id
                                        AND rc.organization_id = p.organization_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount), 0) AS refunded_total
               FROM finance.refunds
              WHERE payment_id = p.id
                AND tenant_id = p.tenant_id AND organization_id = p.organization_id
           ) rf ON true
          WHERE p.tenant_id = $1 AND p.organization_id = $2 AND i.customer_id = $3
          ORDER BY p.received_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        invoiceId: x.invoice_id as string,
        invoiceNumber: x.invoice_number as string,
        amount: Number(x.amount).toFixed(2),
        currency: x.currency as string,
        paymentMethod: x.payment_method as string,
        reference: (x.reference as string | null) ?? null,
        receivedAt: (x.received_at as Date).toISOString(),
        receiptNumber: (x.receipt_number as string | null) ?? null,
        refundedTotal: Number(x.refunded_total).toFixed(2),
      }));
    });
  }

  // ── receipts ──────────────────────────────────────────────────────────────

  async listMyReceipts(ctx: TenantContext, customerId?: string): Promise<MyReceiptRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT rc.id, rc.receipt_number, rc.issued_at,
                p.amount, p.currency, p.payment_method,
                i.invoice_number, j.job_number
           FROM finance.receipts rc
           JOIN finance.payments p ON p.id = rc.payment_id AND p.tenant_id = rc.tenant_id
           JOIN finance.invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
           LEFT JOIN repair.job_cards j ON j.id = i.job_card_id
          WHERE rc.tenant_id = $1 AND rc.organization_id = $2 AND i.customer_id = $3
          ORDER BY rc.issued_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        receiptNumber: x.receipt_number as string,
        invoiceNumber: x.invoice_number as string,
        jobNumber: (x.job_number as string | null) ?? null,
        amount: Number(x.amount).toFixed(2),
        currency: x.currency as string,
        paymentMethod: x.payment_method as string,
        issuedAt: (x.issued_at as Date).toISOString(),
      }));
    });
  }

  // ── quotations ────────────────────────────────────────────────────────────

  /**
   * Every price the workshop has quoted this customer.
   *
   * 🔴 A QUOTATION IS NOT VISIBLE UNTIL A PROPOSAL CARRIES IT TO THE CUSTOMER.
   * `repair.quotations` starts at `draft` and passes through the workshop's own
   * internal approval; the customer sees it only when a `repair_proposals` row
   * reaches `issued`. Listing quotations directly from `repair.quotations` would
   * show the customer prices the workshop is still arguing about internally —
   * including ones it decided not to offer.
   *
   * That is why this joins THROUGH the proposal rather than filtering the
   * quotation's own status: `issued_at` on the proposal is the moment the
   * customer was actually told, and it is the only honest answer to "when were
   * you quoted this?".
   */
  async listMyQuotations(ctx: TenantContext, customerId?: string): Promise<MyQuotationRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT rp.id AS proposal_id, q.id AS quotation_id, rp.version_no, rp.status,
                rp.decision, rp.issued_at, rp.decided_at,
                q.currency, q.valid_until, q.warranty_terms, q.recommended_repair,
                j.job_number, v.registration_number,
                COALESCE(t.total, 0) AS total
           FROM repair.repair_proposals rp
           JOIN repair.quotations q ON q.id = rp.quotation_id AND q.tenant_id = rp.tenant_id
           JOIN repair.job_cards  j ON j.id = q.job_card_id  AND j.tenant_id = q.tenant_id
           LEFT JOIN core.vehicles v ON v.id = j.vehicle_id
           LEFT JOIN LATERAL (
             -- Optional lines are EXCLUDED from the headline figure for the same
             -- reason createInvoiceForJobCard excludes them from the bill: an
             -- option the customer may decline is not part of the price they
             -- were quoted. (No backticks in here -- this is inside a template
             -- literal, and one would end the string.)
             SELECT COALESCE(sum(line_total), 0) AS total
               FROM repair.quotation_lines
              WHERE quotation_id = q.id AND NOT is_optional
                AND tenant_id = q.tenant_id AND organization_id = q.organization_id
           ) t ON true
          WHERE rp.tenant_id = $1 AND rp.organization_id = $2
            AND j.customer_id = $3
            AND rp.status <> 'draft'
          ORDER BY rp.issued_at DESC NULLS LAST, rp.version_no DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => ({
        id: x.quotation_id as string,
        proposalId: x.proposal_id as string,
        jobNumber: (x.job_number as string | null) ?? null,
        registrationNumber: (x.registration_number as string | null) ?? null,
        versionNo: Number(x.version_no),
        status: x.status as string,
        decision: (x.decision as string | null) ?? null,
        currency: x.currency as string,
        total: Number(x.total).toFixed(2),
        validUntil: x.valid_until ? String(x.valid_until).slice(0, 10) : null,
        warrantyTerms: (x.warranty_terms as string | null) ?? null,
        recommendedRepair: (x.recommended_repair as string | null) ?? null,
        issuedAt: x.issued_at ? (x.issued_at as Date).toISOString() : null,
        decidedAt: x.decided_at ? (x.decided_at as Date).toISOString() : null,
        // The one fact the customer actually acts on, computed rather than
        // left for the screen to re-derive from a status string.
        awaitingYou: x.status === 'issued',
      }));
    });
  }

  // ── warranty ──────────────────────────────────────────────────────────────

  /**
   * The warranties covering this customer's completed repairs.
   *
   * ⚠️ `is_active` IS COMPUTED, NOT READ FROM `status`. A policy's stored status
   * moves to `expired` only when something updates it, and nothing runs nightly
   * in this product. Telling a customer a warranty is active because a column
   * was never updated is exactly the "stored flag goes stale" defect
   * `listMaintenance` already avoids — so the date is compared here, live.
   *
   * ⚠️ THE ODOMETER LIMIT IS REPORTED, NOT EVALUATED. Whether the vehicle has
   * passed it depends on a mileage reading nobody has taken since the last
   * visit. The screen shows the limit and lets the customer judge; inventing a
   * verdict from a stale odometer would be a confident wrong answer about
   * whether they are covered.
   */
  async listMyWarrantyPolicies(ctx: TenantContext, customerId?: string): Promise<MyPolicyRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT p.id, p.policy_number, p.cover_summary, p.starts_on, p.expires_on,
                p.expires_at_odometer, p.status,
                j.job_number, v.registration_number,
                (SELECT count(*) FROM warranty.claims cl
                  WHERE cl.policy_id = p.id
                    AND cl.tenant_id = p.tenant_id
                    AND cl.organization_id = p.organization_id) AS claim_count,
                CASE WHEN p.expires_on IS NULL THEN NULL
                     ELSE (p.expires_on - current_date) END AS days_remaining
           FROM warranty.policies p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
           LEFT JOIN core.vehicles v ON v.id = j.vehicle_id
          WHERE p.tenant_id = $1 AND p.organization_id = $2 AND j.customer_id = $3
          ORDER BY p.starts_on DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      return r.rows.map((x) => {
        const days = x.days_remaining === null ? null : Number(x.days_remaining);
        return {
          id: x.id as string,
          policyNumber: x.policy_number as string,
          jobNumber: (x.job_number as string | null) ?? null,
          registrationNumber: (x.registration_number as string | null) ?? null,
          coverSummary: x.cover_summary as string,
          startsOn: String(x.starts_on).slice(0, 10),
          expiresOn: x.expires_on ? String(x.expires_on).slice(0, 10) : null,
          expiresAtOdometer:
            x.expires_at_odometer === null ? null : Number(x.expires_at_odometer),
          status: x.status as string,
          isActive: x.status === 'active' && (days === null || days >= 0),
          daysRemaining: days,
          claimCount: Number(x.claim_count),
        };
      });
    });
  }

  /**
   * The customer's warranty claims, each with the workshop's decisions.
   *
   * ⚠️ THE EVENTS ARE THE RECORD; `claims.status` IS A CACHE OF THEM (043's own
   * words). The customer is shown the events, because "rejected" without the
   * reason and the date is the kind of answer that produces a phone call.
   */
  async listMyWarrantyClaims(ctx: TenantContext, customerId?: string): Promise<MyClaimRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx, customerId);
      const r = await client.query(
        `SELECT cl.id, cl.claim_number, cl.reported_fault, cl.reported_at, cl.status,
                p.policy_number, j.job_number, v.registration_number
           FROM warranty.claims cl
           JOIN warranty.policies p ON p.id = cl.policy_id AND p.tenant_id = cl.tenant_id
           JOIN repair.job_cards  j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
           LEFT JOIN core.vehicles v ON v.id = j.vehicle_id
          WHERE cl.tenant_id = $1 AND cl.organization_id = $2 AND j.customer_id = $3
          ORDER BY cl.reported_at DESC`,
        [ctx.tenantId, ctx.organizationId, cid],
      );
      if (!r.rowCount) return [];

      const ids = r.rows.map((x) => x.id as string);
      // ⚠️ `decided_at`, NOT `created_at` — `warranty.claim_events` has no
      // `created_at` column at all. Guessed column names have cost this
      // repository three defects already; this one was caught by reading
      // `information_schema` before the query ever ran.
      const ev = await client.query(
        `SELECT claim_id, event_kind, reason, note, decided_at
           FROM warranty.claim_events
          WHERE claim_id = ANY($1::uuid[]) AND tenant_id = $2 AND organization_id = $3
          ORDER BY decided_at ASC`,
        [ids, ctx.tenantId, ctx.organizationId],
      );
      const byClaim = new Map<string, { at: string; kind: string; note: string | null }[]>();
      for (const e of ev.rows) {
        const key = e.claim_id as string;
        if (!byClaim.has(key)) byClaim.set(key, []);
        byClaim.get(key)!.push({
          at: (e.decided_at as Date).toISOString(),
          kind: e.event_kind as string,
          // The REASON is what the customer needs when a claim is rejected;
          // the note is the workshop's elaboration. Either may be absent.
          note: (e.reason as string | null) ?? (e.note as string | null) ?? null,
        });
      }

      return r.rows.map((x) => ({
        id: x.id as string,
        claimNumber: x.claim_number as string,
        policyNumber: x.policy_number as string,
        jobNumber: (x.job_number as string | null) ?? null,
        registrationNumber: (x.registration_number as string | null) ?? null,
        reportedFault: x.reported_fault as string,
        reportedAt: (x.reported_at as Date).toISOString(),
        status: x.status as string,
        events: byClaim.get(x.id as string) ?? [],
      }));
    });
  }

  /**
   * Raise a claim against one of the customer's own policies.
   *
   * ⚠️ THE POLICY MUST BE THEIRS. That is checked against the database rather
   * than trusted from the screen — a form that only lists their own warranties
   * is a form, and this is a public HTTP endpoint reachable with any policy id.
   *
   * Expiry is deliberately NOT a barrier here; see the comment at the check.
   */
  async raiseWarrantyClaim(
    ctx: TenantContext,
    input: { policyId: string; reportedFault: string; odometerReading?: number },
  ): Promise<MyClaimRow[]> {
    const echo = await this.db.withTenant(ctx, async (client) => {
      const cid = await resolveCustomerId(client, ctx);

      const policy = await client.query<{ id: string; status: string; expires_on: string | null }>(
        `SELECT p.id, p.status, p.expires_on
           FROM warranty.policies p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
          WHERE p.id = $4 AND p.tenant_id = $1 AND p.organization_id = $2
            AND j.customer_id = $3`,
        [ctx.tenantId, ctx.organizationId, cid, input.policyId],
      );
      if (!policy.rowCount) {
        throw new NotFoundException(
          'That warranty is not one of yours. Your warranties are listed on the Warranty page.',
        );
      }
      // 🔴 THE SAME POLICY RULE `WarrantyService.recordClaim` ALREADY MAKES, not
      // a stricter one invented here.
      //
      // A voided warranty has nothing to claim on. An EXPIRED one still accepts
      // a claim, deliberately: whether cover had run out is the ASSESSMENT's
      // job, and turning the customer away at the counter would leave someone in
      // dispute with no record that they ever asked. My first draft refused
      // anything not `active`, which would have contradicted a reasoned decision
      // already recorded in 043 — and would have hit the customer, who has no
      // counter to argue at.
      const p = policy.rows[0]!;
      if (p.status === 'voided') {
        throw new NotFoundException(
          'That warranty was voided, so there is nothing to claim on. ' +
            'Report the problem as a new request and the workshop can look at the history.',
        );
      }

      // ⚠️ `warranty.next_claim_number()` DOES NOT EXIST. The first draft called
      // it and would have 500'd on the very first claim. Numbers come from
      // `nextWarrantyNumber`, the allocator `WarrantyService` already uses —
      // shared, not copied, because a second allocator is how two desks get the
      // same number.
      const number = await nextWarrantyNumber(
        client, ctx, 'WCL', 'warranty.claims', 'claim_number',
      );

      const created = await client.query<{ id: string }>(
        `INSERT INTO warranty.claims
           (tenant_id, organization_id, policy_id, claim_number, reported_fault,
            odometer_reading, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, input.policyId, number,
          input.reportedFault.trim(), input.odometerReading ?? null, ctx.userId,
        ],
      );

      // The opening event, so the history is complete from the first moment
      // rather than starting at the workshop's first decision. Same shape as
      // `recordClaim`, because the customer's claim and the desk's claim must be
      // the same kind of object.
      await client.query(
        `INSERT INTO warranty.claim_events
           (tenant_id, organization_id, claim_id, event_kind, decided_by)
         VALUES ($1,$2,$3,'submitted',$4)`,
        [ctx.tenantId, ctx.organizationId, created.rows[0]!.id, ctx.userId],
      );

      await this.audit.write(client, ctx, {
        action: 'selfservice.warranty_claim.raised',
        resourceType: 'warranty_claim',
        resourceId: created.rows[0]!.id,
        detail: { policyId: input.policyId },
      });

      // Staff may name the customer again on the read-back; a customer must not.
      return staffEcho(ctx, cid);
    });
    return this.listMyWarrantyClaims(ctx, echo);
  }
}
