import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

export interface StockRow {
  stockItemId: string;
  partNumber: string;
  name: string;
  brand: string | null;
  unit: string;
  unitCost: string | null;
  currency: string;
  reorderLevel: number | null;
  shelfLocation: string | null;
  isActive: boolean;
  onHand: string;
  reserved: string;
  available: string;
  needsReorder: boolean;
}

/**
 * `07.txt` pt2 §50 — "Parts catalogue, inventory, reservation, issue, return and
 * procurement" is the STOREKEEPER's role, and the owner and manager oversee it.
 */
const MAY_MOVE_STOCK = [
  'workshop_owner',
  'workshop_manager',
  'storekeeper',
] as const;

/**
 * Who may ASK for a part. Deliberately wide — a technician who cannot raise a
 * requisition writes it on a scrap of paper, and the workshop loses the record.
 */
const MAY_REQUISITION = [
  'workshop_owner',
  'workshop_manager',
  'storekeeper',
  'technician',
  'workshop_supervisor',
  'reception_staff',
] as const;

/**
 * Parts, stock and procurement — slice 4 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 ON-HAND IS NEVER STORED, ONLY SUMMED ────────────────────────────────
 *
 * There is no `quantity_on_hand` column, deliberately. Every change is a signed
 * row in `parts.stock_movements` and the figure is `sum(quantity)`, read through
 * the `parts.stock_on_hand` view. The same refusal slice 3 made about a stored
 * `paid_total`: a counter drifts the first time a write is retried, and a
 * workshop whose system says four alternators when the shelf holds three has a
 * system nobody believes. A ledger can also answer "why is it that number",
 * which a counter never can.
 *
 * ── ⚠️ RESERVED IS NOT CONSUMED ────────────────────────────────────────────
 *
 * Holding a part for tomorrow does not take it off the shelf. AVAILABLE =
 * on-hand − reserved, and issuing converts a reservation into a movement.
 *
 * ⚠️ Every query carries tenant_id AND organization_id — RLS here is
 * tenant-wide and a tenant holds more than one organisation.
 */
@Injectable()
export class PartsService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayMove(ctx: TenantContext): void {
    if (!MAY_MOVE_STOCK.includes((ctx.activeRole ?? '') as (typeof MAY_MOVE_STOCK)[number])) {
      throw new ForbiddenException(
        'Moving stock is the storekeeper’s job, with the workshop manager or owner. ' +
          'You can still raise a requisition for what you need.',
      );
    }
  }

  // ── stock ─────────────────────────────────────────────────────────────────

  /**
   * What is on the shelf.
   *
   * ⚠️ READS THE VIEW, never the tables. `parts.stock_on_hand` is declared
   * `security_invoker = true` so RLS applies to the caller — a view owned by the
   * table owner would otherwise hand every tenant's stock to anyone who could
   * select from it, which is the classic place RLS is lost by accident.
   */
  async listStock(
    ctx: TenantContext,
    opts: { needsReorderOnly?: boolean; q?: string } = {},
  ): Promise<StockRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT * FROM parts.stock_on_hand
          WHERE tenant_id = $1 AND organization_id = $2
            AND is_active
            AND (NOT $3::boolean OR needs_reorder)
            AND ($4::text IS NULL OR part_number ILIKE '%'||$4||'%' OR name ILIKE '%'||$4||'%')
          ORDER BY needs_reorder DESC, name ASC`,
        [ctx.tenantId, ctx.organizationId, opts.needsReorderOnly ?? false, opts.q || null],
      );
      return rows.rows.map((r) => ({
        stockItemId: r.stock_item_id as string,
        partNumber: r.part_number as string,
        name: r.name as string,
        brand: (r.brand as string) ?? null,
        unit: r.unit as string,
        unitCost: r.unit_cost === null ? null : String(r.unit_cost),
        currency: r.currency as string,
        reorderLevel: r.reorder_level === null ? null : Number(r.reorder_level),
        shelfLocation: (r.shelf_location as string) ?? null,
        isActive: r.is_active as boolean,
        onHand: String(r.on_hand),
        reserved: String(r.reserved),
        available: String(r.available),
        needsReorder: r.needs_reorder as boolean,
      }));
    });
  }

  async createStockItem(
    ctx: TenantContext,
    input: {
      partNumber: string; name: string; brand?: string; unit?: string;
      unitCost?: number; reorderLevel?: number; shelfLocation?: string;
      openingQuantity?: number;
    },
  ): Promise<StockRow> {
    this.assertMayMove(ctx);
    const id = await this.db.withTenant(ctx, async (client) => {
      let created;
      try {
        created = await client.query<{ id: string }>(
          `INSERT INTO parts.stock_items
             (tenant_id, organization_id, part_number, name, brand, unit,
              unit_cost, reorder_level, shelf_location, created_by)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6,'each'),$7,$8,$9,$10)
           RETURNING id`,
          [ctx.tenantId, ctx.organizationId, input.partNumber.trim(), input.name.trim(),
           input.brand ?? null, input.unit ?? null, input.unitCost ?? null,
           input.reorderLevel ?? null, input.shelfLocation ?? null, ctx.userId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(
            `This workshop already stocks part number "${input.partNumber.trim()}".`,
          );
        }
        throw error;
      }

      // An opening balance is a MOVEMENT like any other, so the ledger explains
      // the number from its first row rather than starting mid-story.
      if (input.openingQuantity && input.openingQuantity > 0) {
        await client.query(
          `INSERT INTO parts.stock_movements
             (tenant_id, organization_id, stock_item_id, quantity, movement_kind, recorded_by)
           VALUES ($1,$2,$3,$4,'opening_balance',$5)`,
          [ctx.tenantId, ctx.organizationId, created.rows[0]!.id, input.openingQuantity, ctx.userId],
        );
      }
      return created.rows[0]!.id;
    });

    const all = await this.listStock(ctx);
    const row = all.find((r) => r.stockItemId === id);
    if (!row) throw new NotFoundException('stock item could not be read back');
    return row;
  }

  /**
   * Record a movement.
   *
   * ⚠️ IT REFUSES TO TAKE OUT MORE THAN IS AVAILABLE, and reads `available`
   * (on-hand − reserved) rather than on-hand: issuing stock somebody else is
   * holding for tomorrow's job is how a workshop discovers at 8am that the part
   * has gone.
   *
   * ⚠️ A `stock_take` IS EXEMPT, deliberately. A stock take records what is
   * ACTUALLY on the shelf, and the whole point is that the system was wrong — a
   * correction that could not go negative would be a system refusing to be
   * corrected. The reason is required by the database.
   */
  async recordMovement(
    ctx: TenantContext,
    input: {
      stockItemId: string; quantity: number; movementKind: string;
      jobCardId?: string; reason?: string;
    },
  ): Promise<StockRow> {
    this.assertMayMove(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const current = await client.query<{ available: string; name: string; unit: string }>(
        `SELECT available, name, unit FROM parts.stock_on_hand
          WHERE stock_item_id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [input.stockItemId, ctx.tenantId, ctx.organizationId],
      );
      if (!current.rowCount) throw new NotFoundException('no such stock item');

      if (input.quantity < 0 && input.movementKind !== 'stock_take') {
        const available = Number(current.rows[0]!.available);
        if (Math.abs(input.quantity) > available) {
          throw new BadRequestException(
            `There are only ${available} ${current.rows[0]!.unit} of ${current.rows[0]!.name} ` +
              'free — the rest is on the shelf but reserved for another job. Release a ' +
              'reservation, or record a stock take if the shelf says something different.',
          );
        }
      }

      await client.query(
        `INSERT INTO parts.stock_movements
           (tenant_id, organization_id, stock_item_id, quantity, movement_kind,
            job_card_id, reason, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ctx.tenantId, ctx.organizationId, input.stockItemId, input.quantity,
         input.movementKind, input.jobCardId ?? null, input.reason?.trim() ?? null, ctx.userId],
      );
    });

    const all = await this.listStock(ctx);
    const row = all.find((r) => r.stockItemId === input.stockItemId);
    if (!row) throw new NotFoundException('stock item could not be read back');
    return row;
  }

  // ── reservations ──────────────────────────────────────────────────────────

  async listReservations(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT r.*, si.part_number, si.name, si.unit, j.job_number,
                u.display_name AS reserved_by_name
           FROM parts.reservations r
           JOIN parts.stock_items si ON si.id = r.stock_item_id
           LEFT JOIN repair.job_cards j ON j.id = r.job_card_id
           LEFT JOIN identity.users  u ON u.id = r.reserved_by
          WHERE r.tenant_id = $1 AND r.organization_id = $2
          ORDER BY CASE WHEN r.status = 'held' THEN 0 ELSE 1 END, r.reserved_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  async reserve(
    ctx: TenantContext,
    input: { stockItemId: string; jobCardId: string; quantity: number },
  ): Promise<void> {
    this.assertMayMove(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const current = await client.query<{ available: string; name: string; unit: string }>(
        `SELECT available, name, unit FROM parts.stock_on_hand
          WHERE stock_item_id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [input.stockItemId, ctx.tenantId, ctx.organizationId],
      );
      if (!current.rowCount) throw new NotFoundException('no such stock item');

      const available = Number(current.rows[0]!.available);
      if (input.quantity > available) {
        throw new BadRequestException(
          `Only ${available} ${current.rows[0]!.unit} of ${current.rows[0]!.name} can be held — ` +
            'the rest is already reserved or not on the shelf. Raise a requisition for the difference.',
        );
      }

      await client.query(
        `INSERT INTO parts.reservations
           (tenant_id, organization_id, stock_item_id, job_card_id, quantity, reserved_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, ctx.organizationId, input.stockItemId, input.jobCardId,
         input.quantity, ctx.userId],
      );
    });
  }

  /**
   * Settle a reservation.
   *
   * `issued` converts it into a real movement in the SAME transaction — the two
   * facts must not be able to disagree. `released` simply frees it.
   */
  async settleReservation(
    ctx: TenantContext,
    reservationId: string,
    input: { status: 'issued' | 'released'; releaseReason?: string },
  ): Promise<void> {
    this.assertMayMove(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const held = await client.query<{
        stock_item_id: string; job_card_id: string; quantity: string;
      }>(
        `SELECT stock_item_id, job_card_id, quantity FROM parts.reservations
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 AND status = 'held'`,
        [reservationId, ctx.tenantId, ctx.organizationId],
      );
      if (!held.rowCount) {
        throw new ConflictException('That reservation is no longer held — somebody has settled it.');
      }

      if (input.status === 'released' && !input.releaseReason?.trim()) {
        throw new BadRequestException(
          'Say why the reservation is being released. Somebody held that part for a reason.',
        );
      }

      await client.query(
        `UPDATE parts.reservations
            SET status = $4, release_reason = $5, settled_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [reservationId, ctx.tenantId, ctx.organizationId, input.status,
         input.releaseReason?.trim() ?? null],
      );

      if (input.status === 'issued') {
        // The part physically leaves the shelf now, so the ledger says so — in
        // the same transaction, because a reservation marked issued with no
        // movement behind it would silently inflate the stock figure.
        await client.query(
          `INSERT INTO parts.stock_movements
             (tenant_id, organization_id, stock_item_id, quantity, movement_kind,
              job_card_id, recorded_by)
           VALUES ($1,$2,$3,$4,'issue_to_job',$5,$6)`,
          [ctx.tenantId, ctx.organizationId, held.rows[0]!.stock_item_id,
           -Number(held.rows[0]!.quantity), held.rows[0]!.job_card_id, ctx.userId],
        );
      }
    });
  }

  // ── requisitions ──────────────────────────────────────────────────────────

  async listRequisitions(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT rq.*, si.part_number, j.job_number,
                u.display_name AS requested_by_name, d.display_name AS decided_by_name
           FROM parts.purchase_requisitions rq
           LEFT JOIN parts.stock_items si ON si.id = rq.stock_item_id
           LEFT JOIN repair.job_cards   j ON j.id = rq.job_card_id
           LEFT JOIN identity.users     u ON u.id = rq.requested_by
           LEFT JOIN identity.users     d ON d.id = rq.decided_by
          WHERE rq.tenant_id = $1 AND rq.organization_id = $2
          ORDER BY CASE WHEN rq.status = 'requested' THEN 0 ELSE 1 END, rq.requested_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  async raiseRequisition(
    ctx: TenantContext,
    input: {
      description: string; quantity: number; stockItemId?: string;
      jobCardId?: string; neededBy?: string;
    },
  ): Promise<void> {
    if (!MAY_REQUISITION.includes((ctx.activeRole ?? '') as (typeof MAY_REQUISITION)[number])) {
      throw new ForbiddenException('Your role cannot raise a parts requisition.');
    }
    await this.db.withTenant(ctx, async (client) => {
      const number = await this.nextNumber(client, ctx, 'REQ');
      await client.query(
        `INSERT INTO parts.purchase_requisitions
           (tenant_id, organization_id, requisition_number, stock_item_id, description,
            quantity, job_card_id, needed_by, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ctx.tenantId, ctx.organizationId, number, input.stockItemId ?? null,
         input.description.trim(), input.quantity, input.jobCardId ?? null,
         input.neededBy ?? null, ctx.userId],
      );
    });
  }

  /**
   * Approve or reject a requisition.
   *
   * ⚠️ NARROWER THAN RAISING ONE — approving commits the workshop's money. Same
   * asymmetry as recording a payment versus issuing a refund.
   */
  async decideRequisition(
    ctx: TenantContext,
    requisitionId: string,
    input: { status: 'approved' | 'rejected' | 'cancelled'; reason?: string },
  ): Promise<void> {
    this.assertMayMove(ctx);
    if (input.status === 'rejected' && !input.reason?.trim()) {
      throw new BadRequestException(
        'Say why the requisition is rejected. Somebody asked for that part because a job needs it.',
      );
    }
    await this.db.withTenant(ctx, async (client) => {
      const result = await client.query(
        `UPDATE parts.purchase_requisitions
            SET status = $4, decision_reason = $5, decided_by = $6, decided_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = 'requested'`,
        [requisitionId, ctx.tenantId, ctx.organizationId, input.status,
         input.reason?.trim() ?? null, ctx.userId],
      );
      if (!result.rowCount) {
        throw new ConflictException('That requisition has already been decided.');
      }
    });
  }

  // ── purchase orders and receipts ──────────────────────────────────────────

  async listPurchaseOrders(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT po.*,
                (SELECT COALESCE(sum(line_total),0) FROM parts.purchase_order_lines l
                  WHERE l.purchase_order_id = po.id) AS total,
                (SELECT count(*) FROM parts.purchase_order_lines l
                  WHERE l.purchase_order_id = po.id) AS line_count,
                (SELECT count(*) FROM parts.goods_receipts g
                  WHERE g.purchase_order_id = po.id) AS receipt_count
           FROM parts.purchase_orders po
          WHERE po.tenant_id = $1 AND po.organization_id = $2
          ORDER BY po.created_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  async listGoodsReceipts(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT g.*, po.order_number, po.supplier_name, u.display_name AS received_by_name
           FROM parts.goods_receipts g
           LEFT JOIN parts.purchase_orders po ON po.id = g.purchase_order_id
           LEFT JOIN identity.users u ON u.id = g.received_by
          WHERE g.tenant_id = $1 AND g.organization_id = $2
          ORDER BY g.received_at DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  /**
   * Book a delivery in.
   *
   * ⚠️ THE RECEIPT AND THE MOVEMENTS ARE ONE TRANSACTION. A receipt recorded
   * without the stock arriving on the shelf is the single most confusing state
   * a store can be in: the paperwork says it came and the shelf says it did not.
   */
  async receiveGoods(
    ctx: TenantContext,
    input: {
      purchaseOrderId?: string;
      deliveryNoteReference?: string;
      notes?: string;
      lines: Array<{ stockItemId: string; quantity: number }>;
    },
  ): Promise<void> {
    this.assertMayMove(ctx);
    if (input.lines.length === 0) {
      throw new BadRequestException('A goods receipt with nothing on it records nothing.');
    }
    await this.db.withTenant(ctx, async (client) => {
      const number = await this.nextNumber(client, ctx, 'GRN');
      const receipt = await client.query<{ id: string }>(
        `INSERT INTO parts.goods_receipts
           (tenant_id, organization_id, receipt_number, purchase_order_id,
            delivery_note_reference, notes, received_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, number, input.purchaseOrderId ?? null,
         input.deliveryNoteReference ?? null, input.notes ?? null, ctx.userId],
      );

      for (const line of input.lines) {
        if (line.quantity <= 0) {
          throw new BadRequestException('A received quantity must be more than zero.');
        }
        await client.query(
          `INSERT INTO parts.stock_movements
             (tenant_id, organization_id, stock_item_id, quantity, movement_kind,
              goods_receipt_id, recorded_by)
           VALUES ($1,$2,$3,$4,'goods_receipt',$5,$6)`,
          [ctx.tenantId, ctx.organizationId, line.stockItemId, line.quantity,
           receipt.rows[0]!.id, ctx.userId],
        );
      }

      if (input.purchaseOrderId) {
        await client.query(
          `UPDATE parts.purchase_orders SET status = 'received', updated_at = now()
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
              AND status IN ('sent','part_received','draft')`,
          [input.purchaseOrderId, ctx.tenantId, ctx.organizationId],
        );
      }
    });
  }

  // ── tools ─────────────────────────────────────────────────────────────────

  async listTools(ctx: TenantContext): Promise<Array<Record<string, unknown>>> {
    return this.db.withTenant(ctx, async (client) => {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT * FROM parts.tools
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY
            -- Anything needing attention first: a tool past its calibration date
            -- produces measurements a repair is then judged on.
            CASE WHEN calibration_due_on IS NOT NULL AND calibration_due_on < CURRENT_DATE
                 THEN 0 ELSE 1 END,
            name ASC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return rows.rows;
    });
  }

  async createTool(
    ctx: TenantContext,
    input: { assetTag: string; name: string; toolType?: string; location?: string; calibrationDueOn?: string },
  ): Promise<void> {
    this.assertMayMove(ctx);
    await this.db.withTenant(ctx, async (client) => {
      try {
        await client.query(
          `INSERT INTO parts.tools
             (tenant_id, organization_id, asset_tag, name, tool_type, location,
              calibration_due_on, created_by)
           VALUES ($1,$2,$3,$4,COALESCE($5,'hand_tool'),$6,$7,$8)`,
          [ctx.tenantId, ctx.organizationId, input.assetTag.trim(), input.name.trim(),
           input.toolType ?? null, input.location ?? null, input.calibrationDueOn ?? null,
           ctx.userId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(`Asset tag "${input.assetTag.trim()}" is already in use.`);
        }
        throw error;
      }
    });
  }

  private async nextNumber(
    client: { query: <T>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    ctx: TenantContext,
    prefix: 'REQ' | 'GRN' | 'PO',
  ): Promise<string> {
    const table =
      prefix === 'REQ' ? 'parts.purchase_requisitions'
      : prefix === 'GRN' ? 'parts.goods_receipts'
      : 'parts.purchase_orders';
    const column =
      prefix === 'REQ' ? 'requisition_number'
      : prefix === 'GRN' ? 'receipt_number'
      : 'order_number';
    // Table and column come from a closed set above and are never caller text.
    await client.query(`SELECT 1 FROM identity.organizations WHERE id = $1 FOR UPDATE`, [
      ctx.organizationId,
    ]);
    const rows = await client.query<{ next: string }>(
      `SELECT COALESCE(max(substring(${column} from '[0-9]+$')::bigint), 0) + 1 AS next
         FROM ${table} WHERE organization_id = $1 AND ${column} LIKE $2`,
      [ctx.organizationId, `${prefix}-%`],
    );
    return `${prefix}-${String(rows.rows[0]!.next).padStart(6, '0')}`;
  }
}
