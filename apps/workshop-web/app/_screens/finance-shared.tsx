import { StatusBadge } from '@autoworkshop/ui';

/**
 * The pieces every slice 3 screen shares.
 *
 * ⚠️ ONE FORMATTER, ONE STATUS MAP, ONE "no card payment" NOTICE. Eight screens
 * render money and invoice status; eight copies would disagree the first time
 * one was edited, and a workshop reading two different totals for the same
 * invoice on two screens has no reason to trust either.
 */

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  jobCardId: string;
  jobNumber: string | null;
  customerName: string | null;
  registrationNumber: string | null;
  status: string;
  currency: string;
  netTotal: string;
  taxTotal: string;
  grossTotal: string;
  paidTotal: string;
  creditedTotal: string;
  refundedTotal: string;
  balance: string;
  dueAt: string | null;
  issuedAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  payment_method: string;
  reference: string | null;
  received_at: string;
  received_by_name: string | null;
  invoice_number: string;
  invoice_id: string;
  customer_name: string | null;
  receipt_number: string | null;
  receipt_issued_at: string | null;
  refunded: string;
}

/**
 * Money, as text.
 *
 * ⚠️ THE AMOUNT ARRIVES AS A STRING AND IS NOT PARSED INTO A NUMBER. Postgres
 * `numeric` is exact and JavaScript's `number` is not; converting here to
 * "format it" would reintroduce the rounding the database was chosen to avoid.
 * `toFixed(2)` on the string's own value is only ever cosmetic padding.
 */
export function money(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toFixed(2)}`;
}

export function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function day(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('sv-SE');
  } catch {
    return iso;
  }
}

const INVOICE_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  draft: 'draft',
  issued: 'attention',
  part_paid: 'active',
  paid: 'complete',
  void: 'blocked',
};

/** Text as well as colour — `01 (1).txt` §66 forbids colour as the only signal. */
export function InvoiceStatus({ status }: { status: string }) {
  return <StatusBadge kind={INVOICE_TONE[status] ?? 'draft'} label={status.replace('_', ' ')} />;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  mobile_money: 'Mobile money',
  card_terminal: 'Card terminal',
  credit_note: 'Credit note',
  other: 'Other',
};

/**
 * The honest notice, on every screen that touches money.
 *
 * 🔴 THIS IS NOT BOILERPLATE. ADR-012 forbids a paid card processor, so this
 * product RECORDS a payment rather than taking one — and a billing screen that
 * did not say so would let a workshop believe the system had charged somebody.
 * `payment_method` has a `card_terminal` value for a machine the workshop
 * already owns and NO `card_online`, for the same reason.
 */
export function NoCardPaymentNotice() {
  return (
    <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: 0 }}>
      Payments here are <strong>recorded, not taken</strong> — this system does not charge a
      card. Mark what actually arrived at the desk: cash, a transfer, a cheque, mobile money,
      or a card machine the workshop already has.
    </p>
  );
}
