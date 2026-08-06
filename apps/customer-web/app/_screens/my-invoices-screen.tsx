import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * YOUR INVOICES — slice 12, `NEXT_SESSION_SCHEDULE.md` A2.
 *
 * 🔴 THIS SCREEN IS THE OTHER HALF OF A SECURITY FIX. On 2026-08-07 a customer
 * could read the WORKSHOP'S ENTIRE INVOICE BOOK, because eleven read methods
 * had no role gate and `customer` is a real membership role inside the same
 * organisation. Closing that did not give the customer their own invoices — it
 * took away the only route to them. `/my/invoices` is the correct route: the
 * same rows, narrowed by a customer predicate the SESSION derives and the
 * request cannot name.
 *
 * ⚠️ DRAFTS ARE NOT SHOWN, and that is a deliberate omission rather than a
 * filter nobody thought about. A draft invoice is the workshop still deciding
 * what to charge; showing it would present an unagreed number as a bill.
 *
 * ⚠️ "OVERDUE" MEANS MONEY IS STILL OWED PAST THE DATE — not that the date has
 * passed. A settled invoice with a due date last month is settled, and badging
 * it overdue would be false.
 *
 * 🔴 `'customer'`, NOT `'workshop'` — the workspace id local testing cannot
 * catch, because `:3000` and `:3001` share one cookie jar.
 */

interface MyInvoiceRow {
  id: string;
  invoiceNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  status: string;
  currency: string;
  grossTotal: string;
  paidTotal: string;
  outstanding: string;
  issuedAt: string | null;
  dueAt: string | null;
  isOverdue: boolean;
}

function state(r: MyInvoiceRow) {
  if (r.isOverdue) return <StatusBadge kind="attention" label="Overdue" />;
  if (r.status === 'paid') return <StatusBadge kind="complete" label="Paid" />;
  if (r.status === 'void') return <StatusBadge kind="blocked" label="Cancelled" />;
  if (r.status === 'part_paid') return <StatusBadge kind="active" label="Part paid" />;
  return <StatusBadge kind="active" label="Awaiting payment" />;
}

function money(amount: string, currency: string) {
  return `${currency} ${amount}`;
}

export async function MyInvoicesScreen() {
  const invoices = await apiGet<MyInvoiceRow[]>('customer', '/my/invoices');

  const header = (
    <PageHeader
      title="Invoices"
      description="Every invoice the workshop has issued to you, what it covers, and what is still outstanding."
    />
  );

  if (!invoices.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={invoices.reason} workspaceId="customer" />
      </>
    );
  }

  if (invoices.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have no invoices"
          description="An invoice appears here once the workshop issues one for a completed repair. Work that is still in progress has not been billed yet."
        />
      </>
    );
  }

  const owing = invoices.data.filter((i) => Number(i.outstanding) > 0);
  const total = owing.reduce((sum, i) => sum + Number(i.outstanding), 0);
  const currency = invoices.data[0]!.currency;

  return (
    <>
      {header}
      <DataTable
        // The caption states the ONE fact a customer opens this page for. A bare
        // row count answers a question nobody asked.
        caption={
          owing.length === 0
            ? `${invoices.data.length} invoices · nothing outstanding`
            : `${invoices.data.length} invoices · ${money(total.toFixed(2), currency)} outstanding across ${owing.length}`
        }
        rows={invoices.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'no', header: 'Invoice', nowrap: true, cell: (r) => r.invoiceNumber },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          {
            key: 'issued',
            header: 'Issued',
            nowrap: true,
            cell: (r) => (r.issuedAt ? r.issuedAt.slice(0, 10) : '—'),
          },
          {
            key: 'due',
            header: 'Due',
            nowrap: true,
            cell: (r) => (r.dueAt ? r.dueAt.slice(0, 10) : '—'),
          },
          {
            key: 'total',
            header: 'Total',
            numeric: true,
            nowrap: true,
            cell: (r) => money(r.grossTotal, r.currency),
          },
          {
            key: 'out',
            header: 'Outstanding',
            numeric: true,
            nowrap: true,
            cell: (r) => money(r.outstanding, r.currency),
          },
          { key: 'state', header: 'Status', cell: (r) => state(r) },
        ]}
      />
    </>
  );
}
