import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { RefundForm } from './refund-form';
import { PAYMENT_METHOD_LABEL, money, when, type PaymentRow } from './finance-shared';

/**
 * REFUNDS — money going back out. Slice 3, `/finance/refunds`.
 *
 * ── 🔴 A REFUND IS NOT A CREDIT NOTE ───────────────────────────────────────
 *
 * A CREDIT NOTE reduces what is OWED. A REFUND returns what was PAID.
 * Conflating them is how a workshop's books stop balancing, so they are
 * different tables, different routes and — here — different screens. The credit
 * note lives with the invoice; this screen only handles money that has already
 * come in.
 *
 * ── ⚠️ NARROWER THAN TAKING PAYMENT, DELIBERATELY ──────────────────────────
 *
 * `mayRefund` is the owner or the workshop manager only, while reception and
 * the cashier may take money. That asymmetry is the point: recording an
 * incoming payment is clerical — the money is on the counter. A refund moves
 * money OUT on one person's say-so, which is the obvious internal-fraud path in
 * any workshop system. The reason is required and stored with it.
 *
 * ⚠️ The rule is enforced in `FinanceService`, not by hiding this screen. A
 * viewer who may not refund sees the form and gets the API's own sentence,
 * which names who can — hiding it would leave them unable to tell whether no
 * refund was possible or whether they simply could not see the control.
 */
export async function RefundsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Refunds');
  const payments = await apiGet<PaymentRow[]>('workshop', '/payments');

  const header = (
    <PageHeader
      title={title}
      description="Money returned to customers, against the payment it came in on. A refund can never exceed what was actually paid — the database refuses it."
    />
  );

  if (!payments.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={payments.reason} workspaceId="workshop" />
      </>
    );
  }

  if (payments.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No payments to refund"
          description="A refund is issued against a payment that was actually received. None has been recorded yet."
        />
      </>
    );
  }

  const refundable = payments.data.filter((p) => Number(p.refunded) < Number(p.amount));
  const refunded = payments.data.filter((p) => Number(p.refunded) > 0);

  return (
    <>
      {header}

      {refunded.length > 0 ? (
        <DataTable
          caption="Refunds already issued"
          summary={`${refunded.length} payment${refunded.length === 1 ? '' : 's'} partly or fully refunded`}
          rowKey={(p) => p.id}
          rows={refunded}
          columns={[
            { key: 'receipt', header: 'Receipt', nowrap: true,
              cell: (p) => p.receipt_number ?? '—' },
            { key: 'invoice', header: 'Invoice', nowrap: true, cell: (p) => p.invoice_number },
            { key: 'customer', header: 'Customer', cell: (p) => p.customer_name ?? '—' },
            { key: 'paid', header: 'Paid', numeric: true, nowrap: true,
              cell: (p) => money(p.amount, p.currency) },
            { key: 'back', header: 'Refunded', numeric: true, nowrap: true,
              cell: (p) => money(p.refunded, p.currency) },
            { key: 'when', header: 'Taken', numeric: true, secondary: true, nowrap: true,
              cell: (p) => when(p.received_at) },
          ]}
        />
      ) : null}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Issue a refund</h2>
      {refundable.length === 0 ? (
        <EmptyState
          title="Every payment has been fully refunded"
          description="There is nothing left to return. A refund cannot exceed what was paid."
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          {refundable.map((p) => (
            <li key={p.id}>
              <RefundForm
                paymentId={p.id}
                currency={p.currency}
                // What is left, not what was paid — offering the full amount on
                // a partly-refunded payment invites a refusal the desk could
                // have been spared.
                maxRefundable={(Number(p.amount) - Number(p.refunded)).toFixed(2)}
                revalidate={route}
                summary={
                  <>
                    <strong>{p.receipt_number ?? 'no receipt'}</strong> · {p.invoice_number} ·{' '}
                    {p.customer_name ?? 'no customer'}
                    <br />
                    <span style={{ fontSize: '0.8125rem', opacity: 0.85 }}>
                      {money(p.amount, p.currency)} by{' '}
                      {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method} on{' '}
                      {when(p.received_at)}
                      {Number(p.refunded) > 0
                        ? ` · ${money(p.refunded, p.currency)} already returned`
                        : ''}
                    </span>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
