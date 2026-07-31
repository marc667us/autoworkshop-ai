import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import {
  canTransition,
  cleanQuantity,
  computeTotals,
  formatOrderNumber,
  fromMinorUnits,
  groupLinesBySupplier,
  MAX_ORDER_LINES,
  ORDER_STATUSES,
  singleCurrency,
  toMinorUnits,
  type OrderActor,
  type OrderStatus,
  type PricedLine,
} from './order-rules';
import { isOfflinePaymentMethod } from './payment-provider';

export interface CartItemInput {
  partId: unknown;
  quantity: unknown;
}

export interface DeliveryInput {
  recipient: unknown;
  phone: unknown;
  address: unknown;
}

/**
 * Marketplace orders.
 *
 * ⚠️ EVERY METHOD RUNS THROUGH `withUser`, NOT `withTenant`. An order is owned
 * by its BUYER (migration 022) or reachable by a SUPPLIER MEMBER (023), and
 * neither is a tenant. `withUser` sets `app.user_id` transaction-locally and
 * leaves `app.tenant_id` unset, so RLS answers on identity and every
 * tenant-owned table stays empty for these requests.
 *
 * The service never adds `WHERE buyer_user_id = $currentUser` to a read. It
 * does not need to — the policy is the filter, and duplicating it in SQL would
 * create a second place to forget. What the service owns is the RULES: which
 * transitions are legal, what a cart may contain, and what the customer is
 * charged.
 */
@Injectable()
export class OrderService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Price a cart from the LIVE catalogue, then freeze it.
   *
   * ⚠️ THE CLIENT SENDS PART IDS AND QUANTITIES, NEVER PRICES. A price that
   * arrives from the browser is a price the buyer chose. Everything monetary
   * below is read from `catalogue.parts` inside the same transaction that
   * writes the order.
   */
  async placeOrder(
    userId: string,
    items: readonly CartItemInput[],
    delivery: DeliveryInput,
  ): Promise<{ orders: Array<{ id: string; orderNumber: string; total: string }> }> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(
        'Your basket is empty. Add a part from the marketplace before checking out.',
      );
    }
    if (items.length > MAX_ORDER_LINES) {
      throw new BadRequestException(
        `An order can hold at most ${MAX_ORDER_LINES} different parts. ` +
          'Split the rest into a second order.',
      );
    }

    const recipient = cleanRequiredText(delivery?.recipient, 'delivery recipient');
    const phone = cleanRequiredText(delivery?.phone, 'delivery phone number');
    const address = cleanRequiredText(delivery?.address, 'delivery address');

    // Collapse duplicates up front. Two lines for the same part would each pass
    // validation and then violate nothing, leaving the buyer with a confusing
    // order rather than an error.
    const wanted = new Map<string, number>();
    for (const item of items) {
      const partId = typeof item?.partId === 'string' ? item.partId.trim() : '';
      if (!UUID.test(partId)) {
        throw new BadRequestException('That part could not be recognised.');
      }
      const quantity = cleanQuantity(item?.quantity);
      if (quantity === null) {
        throw new BadRequestException(
          'Quantity must be a whole number of at least 1. Adjust it and try again.',
        );
      }
      wanted.set(partId, (wanted.get(partId) ?? 0) + quantity);
    }

    return this.db.withUser(userId, async (client) => {
      const priced = await this.priceParts(client, wanted);

      const currency = singleCurrency(priced);
      if (currency === null) {
        // Converting would need a rate, and a rate is a financial decision this
        // platform has no mandate to make.
        throw new BadRequestException(
          'Your basket mixes currencies. Order the items in each currency ' +
            'separately — the marketplace does not convert between them.',
        );
      }

      const created: Array<{ id: string; orderNumber: string; total: string }> = [];
      const datePart = await this.today(client);
      let sequence = await this.nextSequence(client, datePart);

      for (const [supplierId, lines] of groupLinesBySupplier(priced)) {
        const totals = computeTotals(lines);
        const orderNumber = formatOrderNumber(datePart, sequence);
        sequence += 1;

        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO catalogue.orders (
             order_number, buyer_user_id, supplier_id, supplier_name,
             status, currency, subtotal, delivery_fee, total,
             delivery_recipient, delivery_phone, delivery_address
           ) VALUES ($1,$2,$3,
             (SELECT name FROM catalogue.suppliers WHERE id = $3),
             'placed',$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            orderNumber,
            userId,
            supplierId,
            currency,
            fromMinorUnits(totals.subtotalMinor),
            fromMinorUnits(totals.deliveryFeeMinor),
            fromMinorUnits(totals.totalMinor),
            recipient,
            phone,
            address,
          ],
        );
        const orderId = rows[0]!.id;

        for (const l of lines) {
          await client.query(
            `INSERT INTO catalogue.order_lines (
               order_id, part_id, part_name, part_brand,
               quantity, unit_price, currency, line_total
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              orderId,
              l.partId,
              l.partName,
              l.partBrand,
              l.quantity,
              fromMinorUnits(l.unitPriceMinor),
              l.currency,
              fromMinorUnits(l.lineTotalMinor),
            ],
          );
        }

        await this.recordEvent(client, orderId, 'placed', userId, `Order ${orderNumber} placed`);

        created.push({
          id: orderId,
          orderNumber,
          total: fromMinorUnits(totals.totalMinor),
        });
      }

      return { orders: created };
    });
  }

  /** The buyer's own orders. RLS decides which — this adds no predicate. */
  async listMyOrders(userId: string): Promise<unknown[]> {
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT o.id, o.order_number, o.supplier_name, o.status, o.currency,
                o.total, o.payment_status, o.placed_at,
                o.delivery_tracking_reference,
                count(l.id)::int AS line_count
           FROM catalogue.orders o
           LEFT JOIN catalogue.order_lines l ON l.order_id = o.id
          GROUP BY o.id
          ORDER BY o.placed_at DESC
          LIMIT 200`,
      );
      return rows;
    });
  }

  /**
   * The supplier inbox.
   *
   * Reachable only because migration 023 gave suppliers accounts. The query is
   * the same shape as the buyer's; the POLICY is what makes them different
   * lists, which is the point of putting the rule in the database.
   */
  async listSupplierOrders(userId: string): Promise<unknown[]> {
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT o.id, o.order_number, o.status, o.currency, o.total,
                o.payment_status, o.placed_at, o.delivery_recipient,
                o.delivery_phone, o.delivery_address,
                o.delivery_tracking_reference
           FROM catalogue.orders o
          WHERE EXISTS (SELECT 1 FROM catalogue.supplier_users su
                         WHERE su.supplier_id = o.supplier_id
                           AND su.user_id = $1 AND su.status = 'active')
          ORDER BY o.placed_at DESC
          LIMIT 200`,
        [userId],
      );
      return rows;
    });
  }

  /** One order with its lines and history. 404 when RLS hides it — never 403. */
  async getOrder(userId: string, orderId: string): Promise<unknown> {
    if (!UUID.test(orderId)) throw new NotFoundException('order not found');
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, order_number, supplier_name, status, currency,
                subtotal, delivery_fee, total, payment_status, payment_method,
                payment_reference, delivery_recipient, delivery_phone,
                delivery_address, delivery_tracking_reference, delivery_notes,
                cancelled_reason, placed_at
           FROM catalogue.orders WHERE id = $1`,
        [orderId],
      );
      const order = rows[0];
      // ⚠️ 404, NOT 403. A 403 would confirm the order exists to somebody with
      // no right to know that, which is an enumeration oracle.
      if (!order) throw new NotFoundException('order not found');

      const lines = await client.query(
        `SELECT part_id, part_name, part_brand, quantity, unit_price, currency, line_total
           FROM catalogue.order_lines WHERE order_id = $1 ORDER BY created_at`,
        [orderId],
      );
      const events = await client.query(
        `SELECT event_type, detail, created_at FROM catalogue.order_events
          WHERE order_id = $1 ORDER BY created_at DESC`,
        [orderId],
      );
      return { ...order, lines: lines.rows, events: events.rows };
    });
  }

  /**
   * Move an order along.
   *
   * ⚠️ `FOR UPDATE` ON THE READ, because two people can act on one order at the
   * same time: the buyer cancelling while the supplier confirms. Without the
   * lock both read `placed`, both decide their transition is legal, and the
   * later write wins silently — the buyer sees "cancelled" and the supplier
   * ships.
   */
  async changeStatus(
    userId: string,
    orderId: string,
    to: unknown,
    reason?: unknown,
  ): Promise<{ status: OrderStatus }> {
    if (!UUID.test(orderId)) throw new NotFoundException('order not found');
    if (!isOrderStatus(to)) {
      throw new BadRequestException(
        `Unknown status. An order can be: ${ORDER_STATUSES.join(', ')}.`,
      );
    }

    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query<{
        id: string;
        status: OrderStatus;
        buyer_user_id: string;
        supplier_id: string;
      }>(
        `SELECT id, status, buyer_user_id, supplier_id
           FROM catalogue.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const order = rows[0];
      if (!order) throw new NotFoundException('order not found');

      const actor = await this.actorFor(client, userId, order);
      const decision = canTransition(order.status, to, actor);
      if (!decision.allowed) throw new BadRequestException(decision.reason);

      if (to === 'cancelled') {
        const text = typeof reason === 'string' ? reason.trim() : '';
        if (text.length === 0) {
          // The schema refuses this too (`ck_order_cancelled_reason`); catching
          // it here is what turns a constraint violation into an answer.
          throw new BadRequestException(
            'Say why the order is being cancelled — the other party will see it.',
          );
        }
        await client.query(
          `UPDATE catalogue.orders SET status = $2, cancelled_reason = $3, updated_at = now()
            WHERE id = $1`,
          [orderId, to, text.slice(0, 500)],
        );
      } else {
        await client.query(
          `UPDATE catalogue.orders SET status = $2, updated_at = now() WHERE id = $1`,
          [orderId, to],
        );
      }

      await this.recordEvent(client, orderId, to, userId, describeChange(order.status, to));
      return { status: to };
    });
  }

  /**
   * Record the supplier's own tracking reference and delivery note.
   *
   * ⚠️ A SEPARATE ENDPOINT FROM `changeStatus`, DELIBERATELY. Dispatching and
   * recording a waybill are different acts: a supplier corrects a mistyped
   * reference on an already-dispatched order without re-dispatching it, and
   * folding tracking into the status call would make that impossible — or worse,
   * would accept the field and silently ignore it, which is what the first
   * version of the supplier screen did.
   *
   * FREE TEXT, and it stays free text. Delivery is the supplier's own system
   * (migration 022), so this is whatever they use to find the consignment.
   * Parsing it into carrier states would invent states nothing here observes.
   *
   * ⚠️ THE COLUMN RULE IS NOT ENFORCED HERE. Migration 023's
   * `trg_orders_supplier_scope` decides what a supplier may change; this method
   * simply does not offer the other columns. If it tried, the trigger would
   * raise `insufficient_privilege`. RLS picks the ROW, the trigger picks the
   * COLUMNS, and this is only the convenient path to both.
   */
  async setTracking(
    userId: string,
    orderId: string,
    trackingReference: unknown,
    notes: unknown,
  ): Promise<{ trackingReference: string | null }> {
    if (!UUID.test(orderId)) throw new NotFoundException('order not found');

    const ref =
      typeof trackingReference === 'string' && trackingReference.trim() !== ''
        ? trackingReference.trim().slice(0, 200)
        : null;
    const note =
      typeof notes === 'string' && notes.trim() !== '' ? notes.trim().slice(0, 500) : null;

    if (ref === null && note === null) {
      throw new BadRequestException(
        'Give a tracking reference or a delivery note — whatever the customer ' +
          'would quote to find this consignment.',
      );
    }

    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query<{ id: string; status: OrderStatus }>(
        `SELECT id, status FROM catalogue.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      if (!rows[0]) throw new NotFoundException('order not found');
      if (rows[0].status === 'cancelled') {
        throw new BadRequestException(
          'This order was cancelled, so there is nothing to track.',
        );
      }

      // COALESCE so sending only one of the two does not blank the other.
      await client.query(
        `UPDATE catalogue.orders
            SET delivery_tracking_reference = COALESCE($2, delivery_tracking_reference),
                delivery_notes = COALESCE($3, delivery_notes),
                updated_at = now()
          WHERE id = $1`,
        [orderId, ref, note],
      );

      await this.recordEvent(
        client,
        orderId,
        'tracking_updated',
        userId,
        ref ? `Tracking reference ${ref}` : 'Delivery note updated',
      );

      return { trackingReference: ref };
    });
  }

  /**
   * Record a settlement that happened OUTSIDE this application.
   *
   * ⚠️ THIS IS THE WHOLE PAYMENT STORY TODAY, AND IT IS COMPLETE, NOT A STUB.
   * No provider is configured and none is proposed — see `payment-provider.ts`.
   * Cash, bank transfer and mobile money are recorded here, audited in
   * `order_events`, and reconcilable. Enabling in-app settlement is the owner's
   * decision alone.
   */
  async recordPayment(
    userId: string,
    orderId: string,
    method: unknown,
    reference?: unknown,
  ): Promise<{ paymentStatus: string }> {
    if (!UUID.test(orderId)) throw new NotFoundException('order not found');
    if (!isOfflinePaymentMethod(method)) {
      throw new BadRequestException(
        'Record how the order was settled: cash, bank_transfer or mobile_money. ' +
          'In-app payment is not enabled on this deployment.',
      );
    }

    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query<{ id: string; status: OrderStatus }>(
        `SELECT id, status FROM catalogue.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      if (!rows[0]) throw new NotFoundException('order not found');
      if (rows[0].status === 'cancelled') {
        throw new BadRequestException(
          'This order was cancelled, so a payment cannot be recorded against ' +
            'it. If money did change hands, record a refund instead.',
        );
      }

      const ref = typeof reference === 'string' ? reference.trim().slice(0, 200) : null;
      await client.query(
        `UPDATE catalogue.orders
            SET payment_status = 'paid', payment_method = $2,
                payment_reference = $3, updated_at = now()
          WHERE id = $1`,
        [orderId, method, ref],
      );
      await this.recordEvent(
        client,
        orderId,
        'payment_recorded',
        userId,
        `Settled by ${method}${ref ? ` (ref ${ref})` : ''}`,
      );
      return { paymentStatus: 'paid' };
    });
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Read live prices for the requested parts.
   *
   * The WHERE clause repeats the marketplace's publication rule — a part is
   * buyable only if it AND its supplier are published. RLS already hides
   * unpublished rows, so this is belt and braces; what it adds is a specific
   * error instead of a silently shorter basket.
   */
  private async priceParts(
    client: PoolClient,
    wanted: ReadonlyMap<string, number>,
  ): Promise<PricedLine[]> {
    const ids = [...wanted.keys()];
    const { rows } = await client.query<{
      id: string;
      name: string;
      brand: string | null;
      price: string | null;
      currency: string;
      supplier_id: string;
    }>(
      `SELECT p.id, p.name, p.brand, p.price, p.currency, p.supplier_id
         FROM catalogue.parts p
         JOIN catalogue.suppliers s ON s.id = p.supplier_id
        WHERE p.id = ANY($1::uuid[]) AND p.is_published AND s.is_published`,
      [ids],
    );

    if (rows.length !== ids.length) {
      throw new BadRequestException(
        'One of the parts in your basket is no longer available. Remove it and ' +
          'try again — the rest of your basket is unaffected.',
      );
    }

    return rows.map((r) => {
      const unitPriceMinor = toMinorUnits(r.price);
      if (unitPriceMinor === null || unitPriceMinor < 0) {
        // A part with no price is a catalogue defect, not a free part.
        throw new BadRequestException(
          `"${r.name}" has no price set, so it cannot be ordered yet. ` +
            'Contact the supplier for a quote.',
        );
      }
      const quantity = wanted.get(r.id)!;
      return {
        partId: r.id,
        partName: r.name,
        partBrand: r.brand,
        supplierId: r.supplier_id,
        quantity,
        unitPriceMinor,
        lineTotalMinor: unitPriceMinor * quantity,
        currency: r.currency,
      } satisfies PricedLine;
    });
  }

  /** Is this caller acting as the buyer, a supplier member, or platform admin? */
  private async actorFor(
    client: PoolClient,
    userId: string,
    order: { buyer_user_id: string; supplier_id: string },
  ): Promise<OrderActor> {
    if (order.buyer_user_id === userId) return 'buyer';
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT catalogue.current_user_supplies($1) AS ok`,
      [order.supplier_id],
    );
    if (rows[0]?.ok) return 'supplier';
    // Reachable only for platform admin, because RLS returned the row at all.
    return 'admin';
  }

  private async recordEvent(
    client: PoolClient,
    orderId: string,
    eventType: string,
    actorUserId: string,
    detail: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO catalogue.order_events (order_id, event_type, actor_user_id, detail)
       VALUES ($1,$2,$3,$4)`,
      [orderId, eventType, actorUserId, detail],
    );
  }

  private async today(client: PoolClient): Promise<string> {
    // From the DATABASE, not the API host. Two API instances in different
    // timezones would otherwise mint order numbers for different days.
    const { rows } = await client.query<{ d: string }>(
      `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') AS d`,
    );
    return rows[0]!.d;
  }

  private async nextSequence(client: PoolClient, datePart: string): Promise<number> {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM catalogue.orders
        WHERE order_number LIKE $1`,
      [`AW-${datePart}-%`],
    );
    return Number(rows[0]!.n) + 1;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function cleanRequiredText(value: unknown, what: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length === 0) {
    throw new BadRequestException(`A ${what} is needed so the supplier can deliver.`);
  }
  return text.slice(0, 500);
}

function describeChange(from: OrderStatus, to: OrderStatus): string {
  return `Status changed from ${from} to ${to}`;
}
