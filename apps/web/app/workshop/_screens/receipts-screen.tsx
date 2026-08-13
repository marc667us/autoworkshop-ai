import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { PAYMENT_METHOD_LABEL, money, when, type PaymentRow } from './finance-shared';

/**
 * RECEIPTS — every payment this workshop has taken, and the number issued
 * against it. Slice 3, `/collection-and-payment/receipts`.
 *
 * ⚠️ ONE RECEIPT PER PAYMENT, ENFORCED IN THE DATABASE (`uq_receipt_payment`).
 * A second would be a REPRINT, which is a printing act rather than a new
 * financial record — and a workshop that could mint two receipt numbers for one
 * payment could show a customer one and its books the other.
 *
 * ⚠️ A ROW WITH NO RECEIPT NUMBER IS A DEFECT, NOT AN OMISSION, so it is
 * flagged rather than left blank. `recordPayment` writes the payment and its
 * receipt in the SAME transaction, so a payment without one can only mean the
 * row predates that guarantee or was written outside the service.
 */
export async function ReceiptsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Receipts');
  const payments = await apiGet<PaymentRow[]>('workshop', '/payments');

  const header = (
    <PageHeader
      title={title}
      description="Every payment recorded at this workshop, with the receipt number given to the customer. Receipts cannot be edited or deleted."
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
          title="No payments yet"
          description="Recording a payment on the collection desk issues its receipt in the same step, and it appears here."
        />
      </>
    );
  }

  const missing = payments.data.filter((p) => !p.receipt_number).length;

  return (
    <>
      {header}
      <DataTable
        caption="Receipts"
        summary={
          missing > 0
            ? `${payments.data.length} payments · ⚠️ ${missing} with no receipt number`
            : `${payments.data.length} payments, all with receipts`
        }
        rowKey={(p) => p.id}
        rows={payments.data}
        columns={[
          {
            key: 'receipt', header: 'Receipt', nowrap: true,
            cell: (p) =>
              p.receipt_number ?? <StatusBadge kind="blocked" label="No receipt issued" />,
          },
          { key: 'when', header: 'Taken', numeric: true, nowrap: true,
            cell: (p) => when(p.received_at) },
          { key: 'invoice', header: 'Invoice', nowrap: true, cell: (p) => p.invoice_number },
          { key: 'customer', header: 'Customer', cell: (p) => p.customer_name ?? '—' },
          { key: 'amount', header: 'Amount', numeric: true, nowrap: true,
            cell: (p) => money(p.amount, p.currency) },
          {
            key: 'method', header: 'How', secondary: true,
            cell: (p) => PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method,
          },
          { key: 'ref', header: 'Reference', secondary: true, cell: (p) => p.reference ?? '—' },
          {
            key: 'refunded', header: 'Refunded', numeric: true, nowrap: true,
            // Shown on the receipt line, because a receipt whose money was later
            // returned is the single most confusing thing in a workshop's books
            // if the two facts live on different screens.
            cell: (p) => (Number(p.refunded) > 0 ? money(p.refunded, p.currency) : '—'),
          },
          { key: 'by', header: 'Taken by', secondary: true,
            cell: (p) => p.received_by_name ?? '—' },
        ]}
      />
      <p style={{ fontSize: '0.8125rem', opacity: 0.8 }}>
        Use your browser&rsquo;s print command for a customer copy. Payments and receipts are
        append-only: a mistake is corrected with a refund or a credit note, never by editing
        the record.
      </p>
    </>
  );
}
