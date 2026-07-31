/**
 * The payment provider boundary — DELIBERATELY WITH NOTHING BEHIND IT.
 *
 * ⚠️ READ THIS BEFORE ADDING A PROVIDER. The absence of an implementation is
 * the design, not an unfinished edge. Choosing a payment provider is a SPEND
 * decision and it belongs to the owner alone (CLAUDE.md §1: never introduce a
 * paid or mandatory paid service, never propose that the owner spends money).
 * Nothing in this file names a provider, and nothing in this file should.
 *
 * ADR-015 bring-your-own-connection is the governing rule: every external
 * capability is an interface with a zero-cost default and a tenant-configurable
 * adapter, and a tenant that configures nothing still gets a working
 * application. That is exactly what this is.
 *
 * WHAT WORKS TODAY WITH NO PROVIDER AT ALL: the buyer places the order, and the
 * payment is RECORDED — unpaid, or settled by cash, bank transfer or mobile
 * money, entered after the fact. `catalogue.orders` carries `payment_status`,
 * `payment_method` and `payment_reference` for exactly that, with
 * `payment_method` NULLABLE AND WITHOUT A DEFAULT so that no row ever asserts a
 * payment route nobody chose. That is a complete, auditable, zero-cost
 * settlement flow — it is not a placeholder for one.
 *
 * WHAT A FUTURE PROVIDER WOULD ADD: moving the money inside the app, rather
 * than recording that it moved elsewhere. When the owner decides to enable one,
 * it is a class that implements `PaymentProvider` plus per-tenant credentials
 * held in tenant settings — never in the platform's own secrets. No call site
 * changes, which is the whole point of declaring the shape now.
 */

/** What the caller wants to charge, in minor-unit-free decimal terms. */
export interface PaymentIntentRequest {
  orderId: string;
  orderNumber: string;
  /** ISO-4217 alpha code, matching `catalogue.orders.currency`. */
  currency: string;
  /** The order total. Decimal string, never a float — money is never binary. */
  amount: string;
}

/** Where to send the payer, and what to reconcile against afterwards. */
export interface PaymentIntentResult {
  /** Provider's own identifier, stored as `orders.payment_reference`. */
  reference: string;
  /** Where the payer completes the payment, if the provider redirects. */
  redirectUrl?: string;
}

/**
 * Implemented by a real provider if and when the owner chooses one.
 *
 * Deliberately narrow. A provider that needs more than this to work is a
 * provider that is reaching into the domain, and the domain rules live in
 * `order.service.ts`, not in an adapter.
 */
export interface PaymentProvider {
  /** A stable, human-meaningful name, recorded on the order for audit. */
  readonly name: string;
  /** False when the adapter exists but is not configured for this deployment. */
  isConfigured(): boolean;
  createIntent(request: PaymentIntentRequest): Promise<PaymentIntentResult>;
}

/** Raised when a caller asks for in-app payment and none is configured. */
export class PaymentProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderNotConfiguredError';
  }
}

/**
 * The default, and currently the ONLY, provider: none.
 *
 * ⚠️ IT REFUSES, AND THE REFUSAL NAMES A REACHABLE ALTERNATIVE — the rule this
 * repository has paid for three slices running. "Payment is unavailable" would
 * be a wall: the buyer would have no idea that they can place the order right
 * now and settle it directly with the supplier, which is the owner's stated
 * model anyway ("user deal direct with supplier"). So the message says what to
 * do instead, and `recordSettlement` below is that path, present and working.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  createIntent(): Promise<PaymentIntentResult> {
    return Promise.reject(
      new PaymentProviderNotConfiguredError(
        'In-app payment is not enabled on this deployment. Place the order and ' +
          'settle it directly with the supplier — record the payment against the ' +
          'order as cash, bank transfer or mobile money once it is made.',
      ),
    );
  }
}

/** The settlement methods that need no provider and no integration. */
export const OFFLINE_PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'mobile_money',
] as const;

export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export function isOfflinePaymentMethod(
  value: unknown,
): value is OfflinePaymentMethod {
  return (
    typeof value === 'string' &&
    (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(value)
  );
}
