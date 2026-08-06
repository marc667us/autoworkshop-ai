import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';

/**
 * YOUR RECEIPTS — slice 12.
 *
 * ⚠️ A RECEIPT IS A ROW, NOT A FLAG ON A PAYMENT. Migration 042 made it its own
 * table because a receipt has its own number and its own issue time, and
 * because "was a receipt given?" is a question a workshop is asked. So a
 * payment with no receipt shows on the Payments page and NOT here — which is
 * the honest answer, and the reason that page names the receipt number or says
 * "not issued".
 *
 * ⚠️ NO DOWNLOAD BUTTON. The signpost promised "downloadable"; nothing in this
 * product renders a receipt document today. A button that produced nothing
 * would be the disconnected mock page `05.txt` §2 forbids, so the page shows the
 * receipt's own details — number, date, amount, method, invoice — which is what
 * a customer needs to quote it, and says where to get a printed copy.
 */

interface MyReceiptRow {
  id: string;
  receiptNumber: string;
  invoiceNumber: string;
  jobNumber: string | null;
  amount: string;
  currency: string;
  paymentMethod: string;
  issuedAt: string;
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

export async function MyReceiptsScreen() {
  const receipts = await apiGet<MyReceiptRow[]>('customer', '/my/receipts');

  const header = (
    <PageHeader
      title="Receipts"
      description="A receipt for every payment the workshop has issued one for. Quote the receipt number if you need a printed copy."
    />
  );

  if (!receipts.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={receipts.reason} workspaceId="customer" />
      </>
    );
  }

  if (receipts.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No receipts yet"
          description="A receipt appears here when the workshop issues one against a payment. If you have paid and no receipt is listed, ask the workshop to issue one."
        />
      </>
    );
  }

  const total = receipts.data.reduce((sum, r) => sum + Number(r.amount), 0);
  const currency = receipts.data[0]!.currency;

  return (
    <>
      {header}
      <DataTable
        caption={`${receipts.data.length} receipts · ${currency} ${total.toFixed(2)} receipted`}
        rows={receipts.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'no', header: 'Receipt', nowrap: true, cell: (r) => r.receiptNumber },
          { key: 'when', header: 'Issued', nowrap: true, cell: (r) => r.issuedAt.slice(0, 10) },
          { key: 'inv', header: 'Invoice', nowrap: true, cell: (r) => r.invoiceNumber },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
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
        ]}
      />
    </>
  );
}
