import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';

/**
 * YOUR PAYMENTS — slice 12.
 *
 * ── 🔴 THIS SCREEN DELIBERATELY DOES NOT TAKE A PAYMENT ────────────────────
 *
 * The signpost it replaces promised "Pays the workshop from inside the app and
 * records what you have paid." The first half of that sentence CANNOT BE BUILT
 * in this product: ADR-012 forbids a paid dependency, and `finance.payments`
 * has no `card_online` method for exactly that reason — its own migration says
 * "this product RECORDS a payment rather than taking one. A method the workshop
 * cannot honour would be a promise the screen makes and the desk cannot keep."
 *
 * So this screen ships the half that is real and SAYS SO about the half that is
 * not, in the page description where the customer will actually read it. A "Pay
 * now" button that opened nothing would be the disconnected mock page `05.txt`
 * §2 forbids, and would be worse than the signpost — a signpost at least tells
 * the truth.
 *
 * ⚠️ THE ADVISORY IS IN THE `PageHeader` DESCRIPTION rather than a notice
 * component. `@autoworkshop/ui` has no Callout, and inventing one for a single
 * screen would put a second notice style into a design system that has one.
 *
 * ⚠️ REFUNDS ARE SHOWN AGAINST THE PAYMENT THEY REVERSE, not as separate rows.
 * A refund is money going back out against money that came in; listing it
 * standalone reads as a second payment.
 *
 * 🔴 `'customer'`, NOT `'workshop'` — the workspace id local testing cannot
 * catch, because `:3000` and `:3001` share one cookie jar.
 */

interface MyPaymentRow {
  id: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  reference: string | null;
  receivedAt: string;
  receiptNumber: string | null;
  refundedTotal: string;
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  mobile_money: 'Mobile money',
  card_terminal: 'Card at the workshop',
  credit_note: 'Credit note',
  other: 'Other',
};

const DESCRIPTION =
  'Every payment the workshop has recorded against your invoices. Payment is made directly to ' +
  'the workshop — cash, bank transfer, mobile money or card at the counter. This page is the ' +
  'record of what they have received; it does not take payment itself.';

export async function MyPaymentsScreen() {
  const payments = await apiGet<MyPaymentRow[]>('customer', '/my/payments');

  const header = <PageHeader title="Payments" description={DESCRIPTION} />;

  if (!payments.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={payments.reason} workspaceId="customer" />
      </>
    );
  }

  if (payments.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No payments recorded yet"
          description="Once the workshop records a payment against one of your invoices it appears here, with its receipt."
        />
      </>
    );
  }

  const total = payments.data.reduce(
    (sum, p) => sum + Number(p.amount) - Number(p.refundedTotal),
    0,
  );
  const currency = payments.data[0]!.currency;

  return (
    <>
      {header}
      <DataTable
        caption={`${payments.data.length} payments · ${currency} ${total.toFixed(2)} received net of refunds`}
        rows={payments.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'when', header: 'Date', nowrap: true, cell: (r) => r.receivedAt.slice(0, 10) },
          { key: 'inv', header: 'Invoice', nowrap: true, cell: (r) => r.invoiceNumber },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            nowrap: true,
            cell: (r) => `${r.currency} ${r.amount}`,
          },
          {
            key: 'method',
            header: 'Method',
            cell: (r) => METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod,
          },
          { key: 'ref', header: 'Reference', cell: (r) => r.reference ?? '—' },
          {
            key: 'receipt',
            header: 'Receipt',
            nowrap: true,
            cell: (r) => r.receiptNumber ?? 'not issued',
          },
          {
            key: 'refund',
            header: 'Refunded',
            numeric: true,
            nowrap: true,
            cell: (r) => (Number(r.refundedTotal) > 0 ? `${r.currency} ${r.refundedTotal}` : '—'),
          },
        ]}
      />
    </>
  );
}
