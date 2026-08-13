'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { recordPaymentAction } from './finance-actions';
import { PAYMENT_METHOD_LABEL } from './finance-shared';

/**
 * Take a payment against one invoice, at the desk.
 *
 * A client component because the outcome is rendered IN PLACE beside the
 * invoice it belongs to — there is one of these per outstanding invoice, and a
 * full-page form would mean either a screen per invoice or a form that has to
 * be told which one it is about.
 *
 * ── 🔴 IT SHOWS THE RECEIPT NUMBER, AND THAT IS THE POINT ──────────────────
 *
 * The customer is standing there. `recordPayment` mints the receipt in the same
 * transaction as the payment — a payment that produced no receipt would leave
 * the desk with nothing to hand over — so the number comes straight back and is
 * displayed rather than buried in a list the person would have to go and find.
 *
 * ── ⚠️ THE AMOUNT DEFAULTS TO THE BALANCE, NOT TO ZERO ─────────────────────
 *
 * Most payments settle the invoice, so the common case should need no typing.
 * It is still an input, because a deposit or a part payment is ordinary and a
 * fixed amount would force the desk to write those on paper.
 *
 * ⚠️ THE ROLE CHECK IS NOT HERE. `mayBill` is enforced in `FinanceService`, so
 * somebody shown this box who may not use it gets the API's own sentence —
 * which names who CAN. Hiding the box instead would leave a reader unable to
 * tell whether nobody had paid or whether they simply cannot see the control.
 */
export function PaymentDesk({
  invoiceId,
  invoiceNumber,
  currency,
  balance,
  revalidate,
  summary,
}: {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  balance: string;
  revalidate: string;
  summary: React.ReactNode;
}) {
  const amountId = useId();
  const methodId = useId();
  const refId = useId();

  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const field: React.CSSProperties = {
    // Form controls do NOT inherit the page typeface. Omitting this is how a
    // filter bar ends up in a different face from its page — the defect the
    // 2026-08-05 design pass found across the whole product.
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    padding: '0.375rem 0.5rem',
    borderRadius: '0.375rem',
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
  };

  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: '0.5rem',
        padding: '0.875rem',
        display: 'grid',
        gap: '0.625rem',
      }}
    >
      <div style={{ fontSize: '0.9375rem' }}>{summary}</div>

      {receipt ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: '0.9375rem', color: themeVar.statusSuccess }}
        >
          Payment recorded. <strong>Receipt {receipt}</strong> — give this number to the customer.
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const value = Number(amount);
            if (!Number.isFinite(value) || value <= 0) {
              setError('Enter the amount that was actually handed over.');
              return;
            }
            setBusy(true);
            setError(null);
            const result = await recordPaymentAction(
              invoiceId,
              {
                amount: value,
                paymentMethod: method,
                ...(reference.trim() ? { reference: reference.trim() } : {}),
              },
              revalidate,
            );
            setBusy(false);
            if (result.ok) setReceipt(result.receiptNumber);
            else setError(result.error);
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}
        >
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <label htmlFor={amountId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Amount ({currency})
            </label>
            <input
              id={amountId}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              disabled={busy}
              style={{ ...field, width: '8rem', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>

          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <label htmlFor={methodId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              How it arrived
            </label>
            <select
              id={methodId}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={busy}
              style={{ ...field }}
            >
              {/* `credit_note` is deliberately absent: applying a credit is a
                  credit-note action, not a payment, and offering it here would
                  let the desk record money that never arrived. */}
              {['cash', 'bank_transfer', 'cheque', 'mobile_money', 'card_terminal', 'other'].map(
                (m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ),
              )}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <label htmlFor={refId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Reference
            </label>
            <input
              id={refId}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Transfer id, cheque no."
              disabled={busy}
              style={{ ...field, width: '11rem' }}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{
              ...field,
              cursor: busy ? 'default' : 'pointer',
              fontWeight: 600,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Recording…' : `Record payment for ${invoiceNumber}`}
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
