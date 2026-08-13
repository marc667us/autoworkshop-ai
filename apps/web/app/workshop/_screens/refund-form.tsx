'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { issueRefundAction } from './finance-actions';
import { PAYMENT_METHOD_LABEL } from './finance-shared';

/**
 * Return money against one payment.
 *
 * ⚠️ THE REASON IS REQUIRED, and not merely because the column is NOT NULL. A
 * refund is the one action in this product that moves money out of the business
 * on one person's authority; the reason is what makes it answerable afterwards,
 * and a refund nobody has to justify is the shape internal fraud takes.
 *
 * ⚠️ IT WARNS THAT THE REFUND CANNOT BE UNDONE, BEFORE IT IS SENT.
 * `finance.refunds` is append-only — `trg_refund_immutable` refuses UPDATE and
 * DELETE — so a mistyped amount stays on the books forever. Saying so afterwards
 * would be an apology, not a warning.
 *
 * The over-refund limit is enforced by `trg_refund_limit` in Postgres, because
 * it spans rows and a CHECK cannot see them. This form shows what is left as a
 * courtesy; the database is the control.
 */
export function RefundForm({
  paymentId,
  currency,
  maxRefundable,
  revalidate,
  summary,
}: {
  paymentId: string;
  currency: string;
  maxRefundable: string;
  revalidate: string;
  summary: React.ReactNode;
}) {
  const amountId = useId();
  const reasonId = useId();
  const methodId = useId();

  const [amount, setAmount] = useState(maxRefundable);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field: React.CSSProperties = {
    // Form controls do not inherit the page typeface.
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

      {done ? (
        <p role="status" style={{ margin: 0, fontSize: '0.875rem', color: themeVar.statusSuccess }}>
          Refund recorded. It cannot be edited or removed — correct it with a further payment if
          it was wrong.
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const value = Number(amount);
            if (!Number.isFinite(value) || value <= 0) {
              setError('Enter the amount being returned.');
              return;
            }
            if (!reason.trim()) {
              setError('Say why this money is being returned. The reason is kept with the refund.');
              return;
            }
            setBusy(true);
            setError(null);
            const result = await issueRefundAction(
              paymentId,
              { amount: value, reason: reason.trim(), refundMethod: method },
              revalidate,
            );
            setBusy(false);
            if (result.ok) setDone(true);
            else setError(result.error);
          }}
          style={{ display: 'grid', gap: '0.5rem' }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ display: 'grid', gap: '0.25rem' }}>
              <label htmlFor={amountId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                Amount ({currency}, up to {maxRefundable})
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
                How it is being returned
              </label>
              <select
                id={methodId}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                disabled={busy}
                style={field}
              >
                {['cash', 'bank_transfer', 'cheque', 'mobile_money', 'card_terminal', 'other'].map(
                  (m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <label htmlFor={reasonId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              Why — <strong>required, and kept permanently with the refund</strong>
            </label>
            <input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              disabled={busy}
              style={field}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={busy}
              style={{ ...field, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Recording…' : 'Record the refund — this cannot be undone'}
            </button>
          </div>
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
