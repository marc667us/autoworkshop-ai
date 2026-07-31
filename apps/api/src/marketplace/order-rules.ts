/**
 * Pure rules for marketplace orders (migrations 022 and 023).
 *
 * Separated from the service, like every other `*-rules.ts` here, so the
 * decisions can be tested without a database. Nothing in this file is async and
 * nothing touches Postgres.
 *
 * ⚠️ MONEY IS NEVER A FLOAT IN THIS FILE. Every amount arrives as a decimal
 * STRING and is converted to integer minor units before any arithmetic. The
 * reason is not theoretical: `0.1 + 0.2 !== 0.3` in IEEE-754, and an order
 * whose lines do not sum to its total is refused by
 * `ck_order_line_total_is_consistent` in migration 022 — so a rounding drift
 * here surfaces as a failed INSERT rather than a wrong number, which is the
 * better failure but still a failure.
 */

/**
 * Order lifecycle. MUST match `ck_order_status` in migration 022 — the drift
 * test in `order-rules.spec.ts` reads the migration and compares.
 *
 * Every value is one the platform or the supplier can actually assert. There is
 * no `out_for_delivery` because nothing in this system observes it, and a state
 * we cannot set is a state an order gets stuck in.
 */
export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'dispatched',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** MUST match `ck_order_payment_status` in migration 022. */
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** MUST match `ck_order_event_type` in migration 022. */
export const ORDER_EVENT_TYPES = [
  'placed',
  'confirmed',
  'dispatched',
  'delivered',
  'cancelled',
  'payment_recorded',
  'payment_refunded',
  'tracking_updated',
  'note_added',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/** MUST match `ck_supplier_member_role` in migration 023. */
export const SUPPLIER_MEMBER_ROLES = ['owner', 'staff'] as const;

/** MUST match `ck_supplier_member_status` in migration 023. */
export const SUPPLIER_MEMBER_STATUSES = ['active', 'revoked'] as const;

/** Nobody may order more than this of one part in one go. */
export const MAX_LINE_QUANTITY = 999;
/** Nor put more than this many distinct parts in one order. */
export const MAX_ORDER_LINES = 50;

/**
 * WHO may move an order to WHICH status.
 *
 * ⚠️ THE SUPPLIER DRIVES FULFILMENT, THE BUYER ONLY CANCELS, AND NEITHER MAY
 * REVERSE THE OTHER. Modelled as an explicit table rather than a chain of ifs
 * because the interesting cases are the absences: a buyer cannot mark their own
 * order `delivered` (that is the supplier's assertion), and a supplier cannot
 * un-cancel an order the buyer cancelled.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['delivered'],
  // Terminal. A delivered order that was wrong becomes a return, which is its
  // own record — rewriting the status would erase that it was ever delivered.
  delivered: [],
  cancelled: [],
};

export type OrderActor = 'buyer' | 'supplier' | 'admin';

/**
 * ⚠️ A CANCELLED ORDER IS NOT UNDONE, IT IS CLOSED. `cancelled` appears for the
 * buyer only from `placed` and `confirmed`: once the supplier has dispatched,
 * the goods are in transit and the resolution is a return, not a cancellation.
 * Letting a buyer cancel a dispatched order would leave a supplier out of pocket
 * with no record of why.
 */
const ACTOR_TRANSITIONS: Readonly<Record<OrderActor, readonly OrderStatus[]>> = {
  buyer: ['cancelled'],
  supplier: ['confirmed', 'dispatched', 'delivered', 'cancelled'],
  // Admin is not unconstrained: support may drive any legal transition, but not
  // an illegal one. An admin who needs to break the machine is describing a
  // defect in the machine.
  admin: [...ORDER_STATUSES],
};

export interface TransitionRefusal {
  allowed: false;
  reason: string;
}
export interface TransitionAllowed {
  allowed: true;
}
export type TransitionDecision = TransitionAllowed | TransitionRefusal;

/**
 * May `actor` move an order from `from` to `to`?
 *
 * ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. This repository has paid for
 * that rule three slices running: an API that says "not allowed" and stops
 * leaves the caller with a wall and no door. If you add a refusal here, open the
 * screen and do the thing the message suggests.
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
): TransitionDecision {
  if (from === to) {
    return {
      allowed: false,
      reason: `This order is already ${from}. Nothing to change.`,
    };
  }

  // ⚠️ THE BUYER'S CLOSED CANCEL WINDOW IS ANSWERED FIRST, AND THE ORDER OF
  // THESE BRANCHES IS THE WHOLE POINT.
  //
  // This block used to sit BELOW the generic legality check, which made it
  // unreachable: a buyer cancelling a dispatched order fell into the generic
  // branch and was told "It can go to: delivered" — advice the buyer is not
  // permitted to act on, because only a supplier may mark an order delivered.
  // A refusal that recommends an impossible action is worse than one that
  // recommends nothing, and it is the same defect class this repository has
  // paid for three slices running. Caught by the "never refuses without telling
  // the caller what they CAN do" test, which is why that test exists.
  if (actor === 'buyer' && to === 'cancelled' && (from === 'dispatched' || from === 'delivered')) {
    return {
      allowed: false,
      reason:
        `This order has already been ${from}, so it can no longer be cancelled. ` +
        'Refuse the delivery, or raise a return against the order once it arrives.',
    };
  }

  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    // ⚠️ ADVISE ONLY WHAT *THIS ACTOR* MAY ACTUALLY DO. Listing every legal
    // onward status regardless of who is asking is how the bug above happened.
    const onward = ALLOWED_TRANSITIONS[from].filter((s) =>
      ACTOR_TRANSITIONS[actor].includes(s),
    );
    if (ALLOWED_TRANSITIONS[from].length === 0) {
      return {
        allowed: false,
        reason:
          `An order that is ${from} is closed and cannot change status. ` +
          (from === 'delivered'
            ? 'If the goods were wrong, raise a return against this order — ' +
              'that keeps the record that it was delivered.'
            : 'Place a new order if it is still needed.'),
      };
    }
    if (onward.length === 0) {
      return {
        allowed: false,
        reason:
          `An order that is ${from} cannot go to ${to}, and there is nothing ` +
          `you can move it to from here — the supplier drives it from this ` +
          `point. You will see it change as they work it.`,
      };
    }
    return {
      allowed: false,
      reason:
        `An order that is ${from} cannot go straight to ${to}. ` +
        `You can move it to: ${onward.join(' or ')}.`,
    };
  }

  if (!ACTOR_TRANSITIONS[actor].includes(to)) {
    return {
      allowed: false,
      reason:
        actor === 'buyer'
          ? `Only the supplier can mark an order ${to}. You can cancel it ` +
            `while it is still placed or confirmed.`
          : `A ${actor} cannot move an order to ${to}.`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Money.
// ---------------------------------------------------------------------------

/**
 * Parse a decimal money string into integer minor units.
 *
 * Rejects rather than coerces. `Number('12abc')` is NaN but `parseFloat('12abc')`
 * is 12, and a price that silently becomes a different price is the worst
 * possible outcome here.
 */
export function toMinorUnits(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    value = value.toFixed(2);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const [whole, frac = ''] = trimmed.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Render integer minor units back as the decimal string Postgres expects. */
export function fromMinorUnits(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

export interface CartLineInput {
  partId: string;
  quantity: number;
}

export interface PricedLine {
  partId: string;
  partName: string;
  partBrand: string | null;
  supplierId: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: string;
}

/**
 * Quantity must be a positive whole number within the cap.
 *
 * Accepts a number or a numeric string, because a query string always arrives
 * as a string and rejecting `'2'` would be rejecting the normal case.
 */
export function cleanQuantity(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_LINE_QUANTITY) return null;
  return n;
}

export interface OrderTotals {
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
}

/**
 * Sum priced lines.
 *
 * ⚠️ THE DELIVERY FEE IS A PARAMETER AND DEFAULTS TO ZERO, because delivery is
 * the supplier's own arrangement (022) and this platform does not price it.
 * Defaulting it to anything else would invent a charge.
 */
export function computeTotals(
  lines: readonly PricedLine[],
  deliveryFeeMinor = 0,
): OrderTotals {
  const subtotalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  return {
    subtotalMinor,
    deliveryFeeMinor,
    totalMinor: subtotalMinor + deliveryFeeMinor,
  };
}

/**
 * ⚠️ ONE ORDER PER SUPPLIER — see migration 022's header. A basket spanning
 * three suppliers becomes three orders, because each supplier delivers and is
 * paid separately and no party could own a combined one. Grouping is therefore
 * a RULE, not a presentation choice, and it lives here so the service and any
 * future screen agree on it.
 *
 * Returns a Map so the caller's iteration order is the insertion order of the
 * cart, which keeps the resulting order numbers stable for a given basket.
 */
export function groupLinesBySupplier(
  lines: readonly PricedLine[],
): Map<string, PricedLine[]> {
  const bySupplier = new Map<string, PricedLine[]>();
  for (const line of lines) {
    const existing = bySupplier.get(line.supplierId);
    if (existing) existing.push(line);
    else bySupplier.set(line.supplierId, [line]);
  }
  return bySupplier;
}

/**
 * ⚠️ MIXED CURRENCIES IN ONE ORDER ARE REFUSED, NOT CONVERTED. Converting would
 * require a rate, and a rate is a financial decision this platform has no
 * mandate to make — it would also have to be snapshotted, disclosed and
 * reconciled. `catalogue.orders.currency` is a single column precisely because
 * an order has one currency.
 */
export function singleCurrency(lines: readonly PricedLine[]): string | null {
  if (lines.length === 0) return null;
  const first = lines[0]!.currency;
  return lines.every((l) => l.currency === first) ? first : null;
}

/** Shape check only — the codes the product supports are a service concern. */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

/**
 * Human order reference.
 *
 * Generated in the service rather than the database so the format can change
 * without a migration — 022 stores it as a plain unique TEXT for that reason.
 * `sequence` is expected to come from something monotonic; the caller owns
 * uniqueness, and the UNIQUE constraint is what actually enforces it.
 */
export function formatOrderNumber(datePart: string, sequence: number): string {
  return `AW-${datePart}-${String(sequence).padStart(4, '0')}`;
}
