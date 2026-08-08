import { ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * The workshop's Request for Parts — the WORKSHOP → SUPPLIER edge.
 *
 * Owner, 2026-08-07: *"a major object and value proposition of the app is
 * connecting vehicle owners with need to repair with workshops and vehicle part
 * suppliers, this is a win win for all."* 058 built the customer→workshop edge;
 * this is the same shape one step along the chain.
 *
 * ⚠️ NOT `parts.purchase_orders`, AND THE REASON IS NOT PREFERENCE. That table
 * carries migration 054's RESTRICTIVE `org_restrict` policy, and RESTRICTIVE
 * policies are AND-ed — so a supplier, being a different organisation, can never
 * read one. See `059_supplier_requests.sql`. A purchase order is also a
 * different thing: the workshop's INTERNAL record of what it ordered, not an ask
 * somebody may decline.
 *
 * ⚠️ TWO PARTIES WRITE THIS ROW, AND RLS CANNOT SAY WHICH COLUMNS EACH MAY
 * TOUCH. The policy decides WHO may write; this service decides WHAT each side
 * may change — the supplier quotes or declines, the workshop accepts or cancels.
 * That split is deliberate and is why both layers exist (CLAUDE.md §8).
 */

export interface SupplierRequestRow {
  id: string;
  supplierId: string;
  supplierName: string;
  organizationId: string;
  partDescription: string;
  quantity: number;
  neededBy: string | null;
  notes: string | null;
  status: string;
  quoteMinor: number | null;
  quoteCurrency: string | null;
  quoteLeadDays: number | null;
  declineReason: string | null;
  createdAt: string;
  respondedAt: string | null;
}

const COLUMNS = `
  sr.id, sr.supplier_id, s.name AS supplier_name, sr.organization_id,
  sr.part_description, sr.quantity, sr.needed_by, sr.notes, sr.status,
  sr.quote_minor, sr.quote_currency, sr.quote_lead_days, sr.decline_reason,
  sr.created_at, sr.responded_at`;

function toRow(r: Record<string, unknown>): SupplierRequestRow {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r['id'] as string,
    supplierId: r['supplier_id'] as string,
    supplierName: r['supplier_name'] as string,
    organizationId: r['organization_id'] as string,
    partDescription: r['part_description'] as string,
    quantity: Number(r['quantity']),
    neededBy: r['needed_by'] === null ? null : String(r['needed_by']),
    notes: (r['notes'] as string | null) ?? null,
    status: r['status'] as string,
    quoteMinor: num(r['quote_minor']),
    quoteCurrency: (r['quote_currency'] as string | null) ?? null,
    quoteLeadDays: num(r['quote_lead_days']),
    declineReason: (r['decline_reason'] as string | null) ?? null,
    createdAt: String(r['created_at']),
    respondedAt: r['responded_at'] === null ? null : String(r['responded_at']),
  };
}

/** Who may ask a supplier for a part. A customer is not on this list, and the
 *  RLS INSERT policy refuses them independently. */
const MAY_ASK = new Set([
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'storekeeper',
  'platform_administrator',
]);

@Injectable()
export class SupplierRequestService {
  constructor(private readonly db: DatabaseService) {}

  /** The workshop's own asks, across every supplier. */
  async listForWorkshop(ctx: TenantContext): Promise<SupplierRequestRow[]> {
    // 🔴 STAFF ONLY. `customer` is a real role inside this same
    // organisation and RLS cannot tell it apart from staff — see
    // `authz/workshop-roles.ts`. Their OWN records are a different query.
    //
    // ⚠️ THIS ROW CARRIES THE SUPPLIER'S QUOTED PRICE. `quote_minor` is what
    // the workshop PAYS for a part; the customer is later billed a marked-up
    // figure through `finance.invoices`. Handing a customer the procurement
    // conversation — who was asked, what they answered, and how fast — hands
    // them the workshop's margin on every job. `notes` is free text written
    // between staff and a supplier, and nothing about it is customer-facing.
    //
    // ⚠️ THE ROLE CHECK ON `create`/`decide` (`MAY_ASK`) NEVER COVERED THIS.
    // It is a write list; every write was gated and the read was not — the
    // exact asymmetry `authz/workshop-roles.ts` was written about. Migration
    // 062 adds the matching `<> 'customer'` clause to the SELECT policy that
    // 059's INSERT and UPDATE policies already carried, so this is stated in
    // both layers rather than in the service alone.
    assertWorkshopStaff(ctx, 'The workshop parts-request record');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query(
        `SELECT ${COLUMNS}
           FROM parts.supplier_requests sr
           JOIN catalogue.suppliers s ON s.id = sr.supplier_id
          WHERE sr.tenant_id = $1 AND sr.organization_id = $2
          ORDER BY sr.created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * The SUPPLIER's inbox.
   *
   * ⚠️ NO ORGANISATION PREDICATE, DELIBERATELY, AND IT IS NOT AN OVERSIGHT. A
   * supplier is not an organisation in this schema — `catalogue.suppliers` is a
   * platform-wide directory, which is exactly what makes it a marketplace rather
   * than a per-workshop address book. The RLS SELECT policy narrows this to the
   * suppliers the caller actually works for, via `catalogue.supplier_users`.
   * Adding an org filter here would return nothing, for ever.
   */
  async listForSupplier(ctx: TenantContext, status?: string): Promise<SupplierRequestRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query(
        `SELECT ${COLUMNS}
           FROM parts.supplier_requests sr
           JOIN catalogue.suppliers s ON s.id = sr.supplier_id
          WHERE ($1::text IS NULL OR sr.status = $1)
          ORDER BY sr.created_at DESC`,
        [status ?? null],
      );
      return rows.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /** Ask a supplier for a part. */
  async create(
    ctx: TenantContext,
    input: {
      supplierId: string;
      partId?: string;
      partDescription: string;
      quantity: number;
      neededBy?: string;
      notes?: string;
      jobCardId?: string;
    },
  ): Promise<SupplierRequestRow> {
    if (!MAY_ASK.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not raise a parts request`);
    }
    return this.db.withTenant(ctx, async (client) => {
      // The supplier must be a PUBLISHED directory entry. An unpublished or
      // deleted supplier is not somebody a workshop can transact with, and
      // letting the id through would produce a request nobody ever reads.
      const s = await client.query(
        `SELECT 1 FROM catalogue.suppliers WHERE id = $1 AND is_published`,
        [input.supplierId],
      );
      if (s.rowCount === 0) throw new NotFoundException('That supplier was not found.');

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO parts.supplier_requests
           (tenant_id, organization_id, requested_by, supplier_id, part_id,
            part_description, quantity, needed_by, notes, job_card_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, ctx.userId, input.supplierId,
          input.partId ?? null, input.partDescription.trim(), input.quantity,
          input.neededBy ?? null, input.notes ?? null, input.jobCardId ?? null,
        ],
      );
      const created = await client.query(
        `SELECT ${COLUMNS} FROM parts.supplier_requests sr
           JOIN catalogue.suppliers s ON s.id = sr.supplier_id WHERE sr.id = $1`,
        [inserted.rows[0]!.id],
      );
      return toRow(created.rows[0]! as Record<string, unknown>);
    });
  }

  /**
   * The SUPPLIER answers: a quote, or a decline with a reason.
   *
   * ⚠️ ONLY FROM `new`. A supplier may not re-price a request the workshop has
   * already accepted — that is a renegotiation, and it must not look like an
   * edit. The database agrees: `accepted` requires a quote, so silently changing
   * one underneath an acceptance would leave the workshop believing a different
   * price had been agreed.
   */
  async respond(
    ctx: TenantContext,
    id: string,
    input: { quoteMinor?: number; quoteCurrency?: string; quoteLeadDays?: number; declineReason?: string },
  ): Promise<SupplierRequestRow> {
    const declining = input.declineReason !== undefined && input.quoteMinor === undefined;
    if (!declining && (input.quoteMinor === undefined || !input.quoteCurrency)) {
      throw new ForbiddenException('A quote needs a price and a currency, or say why you are declining.');
    }
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<{ id: string }>(
        `UPDATE parts.supplier_requests
            SET status = $2,
                quote_minor = $3, quote_currency = $4, quote_lead_days = $5,
                decline_reason = $6,
                responded_by = $7, responded_at = now()
          WHERE id = $1 AND status = 'new'
        RETURNING id`,
        [
          id,
          declining ? 'declined' : 'quoted',
          declining ? null : input.quoteMinor,
          declining ? null : (input.quoteCurrency ?? null),
          declining ? null : (input.quoteLeadDays ?? null),
          declining ? (input.declineReason ?? null) : null,
          ctx.userId,
        ],
      );
      if (rows.rowCount === 0) {
        // RLS has already narrowed this to requests sent to a supplier the
        // caller works for, so "not found" here means answered already or not
        // theirs — one message, because distinguishing them would confirm the
        // existence of another supplier's request.
        throw new NotFoundException('That request is no longer awaiting an answer.');
      }
      const after = await client.query(
        `SELECT ${COLUMNS} FROM parts.supplier_requests sr
           JOIN catalogue.suppliers s ON s.id = sr.supplier_id WHERE sr.id = $1`,
        [id],
      );
      return toRow(after.rows[0]! as Record<string, unknown>);
    });
  }

  /**
   * The WORKSHOP accepts a quote, or cancels its own request.
   *
   * ⚠️ A SUPPLIER MUST NOT REACH THIS. The RLS UPDATE policy lets both parties
   * write the row — it cannot express "these columns are yours" — so the role
   * check here is what stops a supplier accepting its own quote on the
   * workshop's behalf. This is the half of the rule that RLS structurally cannot
   * carry, which is precisely why it is stated twice.
   */
  async decide(
    ctx: TenantContext,
    id: string,
    input: { decision: 'accepted' | 'cancelled' },
  ): Promise<SupplierRequestRow> {
    if (!MAY_ASK.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not decide a parts request`);
    }
    return this.db.withTenant(ctx, async (client) => {
      // Scoped to the asking organisation, so a supplier user reaching this
      // route matches nothing even before the role check above.
      const rows = await client.query<{ id: string }>(
        `UPDATE parts.supplier_requests
            SET status = $4
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = $5
        RETURNING id`,
        [
          id, ctx.tenantId, ctx.organizationId, input.decision,
          // Accepting is only meaningful on a QUOTED request; cancelling is only
          // meaningful on one nobody has answered yet. The database refuses an
          // acceptance with no quote independently.
          input.decision === 'accepted' ? 'quoted' : 'new',
        ],
      );
      if (rows.rowCount === 0) {
        throw new ConflictException(
          input.decision === 'accepted'
            ? 'That request has no quote to accept, or it has already been decided.'
            : 'That request has already been answered and can no longer be cancelled.',
        );
      }
      const after = await client.query(
        `SELECT ${COLUMNS} FROM parts.supplier_requests sr
           JOIN catalogue.suppliers s ON s.id = sr.supplier_id WHERE sr.id = $1`,
        [id],
      );
      return toRow(after.rows[0]! as Record<string, unknown>);
    });
  }
}
