/**
 * Who may bill, take money and give it back — slice 3 of `COMPLETION_PLAN.md`.
 *
 * In its own module like `reception-rules.ts` and `quality-rules.ts`: rules that
 * live apart from a service can be unit-tested without a database and, more
 * usefully, READ without reading a service.
 */

/** `07.txt` pt2 §48 gives reception invoices, receive-payment and receipts. */
const MAY_BILL = [
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'cashier',
] as const;

/**
 * Who may raise and issue an invoice, and record a payment against it.
 *
 * A technician is absent, and so is the storekeeper: §49's tree contains no
 * financial item at all, and `permission-matrix.ts` grants `finance.read` to
 * exactly `workshop_owner`, `reception_staff` and `cashier` among the workshop
 * roles. The manager is included here because §47 owns the collection desk even
 * though its navigation carries no FINANCE group.
 */
export function mayBill(role: string | null | undefined): boolean {
  return MAY_BILL.includes((role ?? '') as (typeof MAY_BILL)[number]);
}

/**
 * Who may give money back.
 *
 * 🔴 NARROWER THAN TAKING IT, deliberately, and this is the one asymmetry in
 * the module. Recording an incoming payment is a clerical act — the money is
 * already on the counter. A refund or a credit note MOVES MONEY OUT of the
 * business on the say-so of one person, and it is the obvious internal-fraud
 * path in any workshop system. So it is the owner or the manager, never the
 * desk, and the reason is recorded with it.
 */
export function mayRefund(role: string | null | undefined): boolean {
  return role === 'workshop_owner' || role === 'workshop_manager';
}

/** Who may hand the keys back. §48's "vehicle release". */
export function mayReleaseVehicle(role: string | null | undefined): boolean {
  return mayBill(role);
}

export class FinanceInputError extends Error {}

/**
 * What an invoice may become, from where.
 *
 * `part_paid` and `paid` are NOT reachable by a status change: they are
 * DERIVED from the payments recorded against the invoice, and set by
 * `InvoiceService` in the same transaction as the payment. A status somebody
 * could set by hand would be a claim about money that no money backs.
 */
export const INVOICE_TRANSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    draft: ['issued', 'void'],
    issued: ['void'],
    part_paid: ['void'],
    // Terminal. A settled invoice is corrected with a credit note.
    paid: [],
    void: [],
  });

export function parseInvoiceTransition(from: string, to: string): string {
  const allowed = INVOICE_TRANSITIONS[from];
  if (!allowed) {
    throw new FinanceInputError(`'${from}' is not an invoice status this workshop uses.`);
  }
  if (from === to) {
    throw new FinanceInputError(`This invoice is already ${from.replace('_', ' ')}.`);
  }
  if (!allowed.includes(to)) {
    if (to === 'paid' || to === 'part_paid') {
      throw new FinanceInputError(
        'An invoice is not marked paid by hand — it becomes paid when a payment is ' +
          'recorded against it. Record the payment instead.',
      );
    }
    if (allowed.length === 0) {
      throw new FinanceInputError(
        `A ${from.replace('_', ' ')} invoice cannot be changed. ` +
          'Issue a credit note against it, which is how a settled invoice is corrected.',
      );
    }
    // Every refusal names what IS possible. A refusal with no reachable
    // alternative is a wall, and it is the most expensive defect class here.
    throw new FinanceInputError(
      `A ${from.replace('_', ' ')} invoice cannot become ${to.replace('_', ' ')}. ` +
        `It can be: ${allowed.join(', ')}.`,
    );
  }
  return to;
}

/**
 * The status an invoice should now be in, given what has been paid.
 *
 * ⚠️ DERIVED, NEVER ACCEPTED FROM A CALLER, and computed from the SUM of
 * payments rather than incremented. An incremented counter drifts the first
 * time anything is retried; a sum cannot.
 *
 * ⚠️ AND IT COMPARES AGAINST gross MINUS CREDIT NOTES. A credit note reduces
 * what is owed, so an invoice for 345 with a 45 credit note is settled by a
 * payment of 300 — treating the gross as the target would leave it forever
 * "part paid" and permanently on the outstanding-balances screen.
 */
export function invoiceStatusFor(input: {
  grossTotal: number;
  paid: number;
  credited: number;
}): 'issued' | 'part_paid' | 'paid' {
  const owed = Math.max(0, round2(input.grossTotal - input.credited));
  const paid = round2(input.paid);
  if (paid <= 0) return 'issued';
  // `>=` rather than `===`: an overpayment settles the invoice. The excess is a
  // matter for a refund, not a reason to leave the invoice looking unpaid.
  if (paid >= owed) return 'paid';
  return 'part_paid';
}

/**
 * Two decimal places, matching `numeric(14,2)` in the database.
 *
 * ⚠️ MONEY ARRIVES HERE AS A JAVASCRIPT NUMBER and floating point cannot hold
 * 0.1 exactly, so 34.5 - 4.5 can differ from 30 in the last bits. This is used
 * only to CHOOSE A STATUS; every amount that is stored or charged is computed
 * by Postgres in `numeric`, which is exact. The display totals are a courtesy,
 * the database's are the truth — the same division `basket.ts` documents.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
