import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  cleanQuantity,
  computeTotals,
  formatOrderNumber,
  fromMinorUnits,
  groupLinesBySupplier,
  isCurrencyCode,
  MAX_LINE_QUANTITY,
  ORDER_EVENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  singleCurrency,
  SUPPLIER_MEMBER_ROLES,
  SUPPLIER_MEMBER_STATUSES,
  toMinorUnits,
  type OrderStatus,
  type PricedLine,
} from './order-rules';
import {
  isOfflinePaymentMethod,
  PaymentProviderNotConfiguredError,
  UnconfiguredPaymentProvider,
} from './payment-provider';

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  partId: 'p1',
  partName: 'Brake pad',
  partBrand: 'Bosch',
  supplierId: 's1',
  quantity: 1,
  unitPriceMinor: 5000,
  lineTotalMinor: 5000,
  currency: 'GHS',
  ...over,
});

describe('money never touches a float', () => {
  it('parses decimal strings into exact minor units', () => {
    expect(toMinorUnits('50.00')).toBe(5000);
    expect(toMinorUnits('0.1')).toBe(10);
    expect(toMinorUnits('0.2')).toBe(20);
    expect(toMinorUnits(12)).toBe(1200);
  });

  it('survives the sum that breaks IEEE-754', () => {
    // 0.1 + 0.2 === 0.30000000000000004 as floats. In minor units it is 30,
    // and `ck_order_line_total_is_consistent` in 022 never sees a drift.
    const total = toMinorUnits('0.1')! + toMinorUnits('0.2')!;
    expect(fromMinorUnits(total)).toBe('0.30');
  });

  it('REJECTS junk rather than coercing it — parseFloat("12abc") is 12', () => {
    expect(toMinorUnits('12abc')).toBeNull();
    expect(toMinorUnits('')).toBeNull();
    expect(toMinorUnits('1.234')).toBeNull(); // more precision than money has
    expect(toMinorUnits(Number.NaN)).toBeNull();
    expect(toMinorUnits(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('round-trips', () => {
    for (const v of ['0.00', '0.05', '9.99', '1234.56']) {
      expect(fromMinorUnits(toMinorUnits(v)!)).toBe(v);
    }
  });
});

describe('totals', () => {
  it('sums lines and adds no delivery fee by default', () => {
    // Delivery is the supplier's own arrangement. A non-zero default would
    // invent a charge the platform has no basis to make.
    const t = computeTotals([line({ lineTotalMinor: 5000 }), line({ lineTotalMinor: 2550 })]);
    expect(t).toEqual({ subtotalMinor: 7550, deliveryFeeMinor: 0, totalMinor: 7550 });
  });

  it('adds a delivery fee when one is supplied', () => {
    const t = computeTotals([line({ lineTotalMinor: 5000 })], 1000);
    expect(t.totalMinor).toBe(6000);
  });
});

describe('one order per supplier', () => {
  it('splits a mixed basket', () => {
    const grouped = groupLinesBySupplier([
      line({ supplierId: 'a' }),
      line({ supplierId: 'b' }),
      line({ supplierId: 'a' }),
    ]);
    expect([...grouped.keys()]).toEqual(['a', 'b']);
    expect(grouped.get('a')).toHaveLength(2);
  });

  it('keeps a single-supplier basket as one order', () => {
    expect(groupLinesBySupplier([line(), line()]).size).toBe(1);
  });
});

describe('currency', () => {
  it('refuses to mix currencies rather than converting', () => {
    // Converting needs a rate, and a rate is a financial decision this
    // platform has no mandate to make.
    expect(singleCurrency([line({ currency: 'GHS' }), line({ currency: 'USD' })])).toBeNull();
  });

  it('accepts a consistent basket', () => {
    expect(singleCurrency([line(), line()])).toBe('GHS');
  });

  it('validates the code shape', () => {
    expect(isCurrencyCode('GHS')).toBe(true);
    expect(isCurrencyCode('ghs')).toBe(false);
    expect(isCurrencyCode('GH')).toBe(false);
  });
});

describe('quantity', () => {
  it('accepts the normal case from a query string', () => {
    expect(cleanQuantity('2')).toBe(2);
  });

  it('rejects zero, negatives, fractions and the absurd', () => {
    for (const v of [0, -1, 1.5, MAX_LINE_QUANTITY + 1, 'x', null]) {
      expect(cleanQuantity(v)).toBeNull();
    }
  });
});

describe('status transitions', () => {
  it('lets a supplier drive fulfilment', () => {
    expect(canTransition('placed', 'confirmed', 'supplier').allowed).toBe(true);
    expect(canTransition('confirmed', 'dispatched', 'supplier').allowed).toBe(true);
    expect(canTransition('dispatched', 'delivered', 'supplier').allowed).toBe(true);
  });

  it('does NOT let a buyer mark their own order delivered', () => {
    // That is the supplier's assertion. A buyer who could make it could claim
    // goods arrived that never did.
    const d = canTransition('dispatched', 'delivered', 'buyer');
    expect(d.allowed).toBe(false);
  });

  it('lets a buyer cancel while the order is still placed or confirmed', () => {
    expect(canTransition('placed', 'cancelled', 'buyer').allowed).toBe(true);
    expect(canTransition('confirmed', 'cancelled', 'buyer').allowed).toBe(true);
  });

  it('closes the buyer cancel window at dispatch, and says what to do instead', () => {
    const d = canTransition('dispatched', 'cancelled', 'buyer');
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/refuse the delivery|return/i);
  });

  it('treats delivered and cancelled as terminal', () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition('delivered', to, 'admin').allowed).toBe(false);
      expect(canTransition('cancelled', to, 'admin').allowed).toBe(false);
    }
  });

  it('refuses a no-op without pretending it worked', () => {
    expect(canTransition('placed', 'placed', 'supplier').allowed).toBe(false);
  });

  it('does not let even an admin drive an ILLEGAL transition', () => {
    // An admin who needs to break the machine is describing a defect in it.
    expect(canTransition('placed', 'delivered', 'admin').allowed).toBe(false);
  });

  /**
   * EVERY refusal names a reachable alternative. Three slices running, a rule
   * whose escape hatch is unreachable has been the most expensive defect class
   * in this repository — the API said "start a new inspection" and the UI had
   * no way to. A refusal that only says "no" is that same wall.
   */
  it('never refuses without telling the caller what they CAN do', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        for (const actor of ['buyer', 'supplier', 'admin'] as const) {
          const d = canTransition(from, to, actor);
          if (!d.allowed) {
            expect(d.reason.length, `${actor}: ${from}->${to}`).toBeGreaterThan(20);
            // A bare "not allowed" fails this: the message must point somewhere.
            expect(d.reason, `${actor}: ${from}->${to}`).toMatch(
              /can go to|can cancel|new order|return|already|cannot/i,
            );
          }
        }
      }
    }
  });
});

describe('payment is a record, and the refusal is not a wall', () => {
  it('reports itself unconfigured rather than pretending', () => {
    expect(new UnconfiguredPaymentProvider().isConfigured()).toBe(false);
  });

  it('refuses in-app payment by naming the path that DOES work', async () => {
    await expect(new UnconfiguredPaymentProvider().createIntent()).rejects.toBeInstanceOf(
      PaymentProviderNotConfiguredError,
    );
    await expect(new UnconfiguredPaymentProvider().createIntent()).rejects.toThrow(
      /settle it directly with the supplier/i,
    );
  });

  it('accepts the settlement methods that need no provider', () => {
    for (const m of ['cash', 'bank_transfer', 'mobile_money']) {
      expect(isOfflinePaymentMethod(m)).toBe(true);
    }
    expect(isOfflinePaymentMethod('card')).toBe(false);
    expect(isOfflinePaymentMethod(null)).toBe(false);
  });
});

describe('order numbers', () => {
  it('is stable and zero-padded', () => {
    expect(formatOrderNumber('20260731', 7)).toBe('AW-20260731-0007');
  });
});

// ── the rules module against the migrations ────────────────────────────────
//
// The constants above are duplicated in SQL CHECK constraints. Two copies of a
// list drift, and the drift is silent until an INSERT fails in production. This
// reads the migration and compares.

describe('order-rules matches what migrations 022 and 023 actually applied', () => {
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    // Fail loudly rather than skip — a silent skip lets the two drift while the
    // suite still reports green.
    expect(sqlPath, `could not locate ${name}`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }

  function checkValues(sql: string, column: string): string[] {
    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
    const body = re.exec(sql)?.[1] ?? '';
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
  }

  const ORDERS = () => migration('022_marketplace_orders.sql');
  const SUPPLIERS = () => migration('023_supplier_accounts.sql');

  it('carries exactly the order statuses the database accepts', () => {
    expect(checkValues(ORDERS(), 'status')).toEqual([...ORDER_STATUSES].sort());
  });

  it('carries exactly the payment statuses the database accepts', () => {
    expect(checkValues(ORDERS(), 'payment_status')).toEqual([...PAYMENT_STATUSES].sort());
  });

  it('carries exactly the event types the database accepts', () => {
    expect(checkValues(ORDERS(), 'event_type')).toEqual([...ORDER_EVENT_TYPES].sort());
  });

  it('carries exactly the supplier member roles and statuses', () => {
    expect(checkValues(SUPPLIERS(), 'member_role')).toEqual([...SUPPLIER_MEMBER_ROLES].sort());
    expect(checkValues(SUPPLIERS(), 'status')).toEqual([...SUPPLIER_MEMBER_STATUSES].sort());
  });

  it('keeps every transition target a real status', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(ORDER_STATUSES).toContain(from as OrderStatus);
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });

  it('names an event type for every status the order can reach', () => {
    // A status change with no corresponding event would be a change with no
    // audit row, and `order_events` is the only account of who did what.
    for (const s of ORDER_STATUSES) {
      expect(ORDER_EVENT_TYPES).toContain(s as never);
    }
  });

  it('still forbids in-app payment in the schema — no provider, no default', () => {
    // If someone adds a DEFAULT to payment_method, a row starts asserting a
    // settlement route nobody chose. That is a spend decision leaking into a
    // migration, so it fails here.
    expect(ORDERS()).toMatch(/payment_method\s+TEXT,/);
    expect(ORDERS()).not.toMatch(/payment_method\s+TEXT\s+[^,]*DEFAULT/i);
  });
});
