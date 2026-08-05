import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { InvoiceStatus, money, day, type InvoiceRow } from './finance-shared';

/**
 * OUTSTANDING BALANCES — what the workshop is owed. Slice 3,
 * `/finance/outstanding-balances`.
 *
 * ⚠️ THE BALANCE IS gross − credited − paid, computed by the API from SUMS over
 * the payment and credit-note rows. Not a stored counter: a counter drifts the
 * first time an insert is retried, and a workshop chasing a debt that was
 * already settled loses a customer.
 *
 * ⚠️ OVERDUE IS SHOWN AS A FACT, NOT A COLOUR. `01 (1).txt` §66 forbids colour
 * as the only signal, and "14 days overdue" is what somebody making a phone call
 * actually needs — a red row tells them to look somewhere else for the number.
 */
export async function OutstandingBalancesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Outstanding Balances');
  const invoices = await apiGet<InvoiceRow[]>('workshop', '/invoices?unpaidOnly=true');

  const header = (
    <PageHeader
      title={title}
      description="Issued invoices with money still owed, oldest due date first. This is the list to work through before chasing anybody."
    />
  );

  if (!invoices.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={invoices.reason} workspaceId="workshop" />
      </>
    );
  }

  if (invoices.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing outstanding"
          description="Every issued invoice has been settled by a payment or a credit note. Nothing to chase."
        />
      </>
    );
  }

  const now = Date.now();
  const daysOverdue = (due: string | null): number | null => {
    if (!due) return null;
    const ms = now - new Date(due).getTime();
    return ms > 0 ? Math.floor(ms / 86_400_000) : null;
  };

  // Oldest due first, and invoices with no due date last — they are not late,
  // they are simply open.
  const ordered = [...invoices.data].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return a.createdAt.localeCompare(b.createdAt);
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  });

  const total = ordered.reduce((sum, i) => sum + Number(i.balance), 0);
  const overdue = ordered.filter((i) => (daysOverdue(i.dueAt) ?? 0) > 0);
  const overdueTotal = overdue.reduce((sum, i) => sum + Number(i.balance), 0);
  const currency = ordered[0]!.currency;

  return (
    <>
      {header}

      <p style={{ fontSize: '0.9375rem' }}>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {money(total.toFixed(2), currency)}
        </strong>{' '}
        owed across {ordered.length} invoice{ordered.length === 1 ? '' : 's'}
        {overdue.length > 0 ? (
          <>
            {' — of which '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(overdueTotal.toFixed(2), currency)}
            </strong>{' '}
            is past its due date.
          </>
        ) : (
          ' — none past its due date.'
        )}
      </p>

      <DataTable
        caption="Outstanding balances"
        summary={`${overdue.length} overdue of ${ordered.length}`}
        rowKey={(i) => i.id}
        rows={ordered}
        columns={[
          { key: 'number', header: 'Invoice', nowrap: true, cell: (i) => i.invoiceNumber },
          { key: 'customer', header: 'Customer', cell: (i) => i.customerName ?? '—' },
          { key: 'vehicle', header: 'Vehicle', secondary: true, nowrap: true,
            cell: (i) => i.registrationNumber ?? '—' },
          { key: 'invoiced', header: 'Invoiced', numeric: true, nowrap: true, secondary: true,
            cell: (i) => money(i.grossTotal, i.currency) },
          { key: 'paid', header: 'Paid', numeric: true, nowrap: true, secondary: true,
            cell: (i) => money(i.paidTotal, i.currency) },
          { key: 'balance', header: 'Owed', numeric: true, nowrap: true,
            cell: (i) => money(i.balance, i.currency) },
          { key: 'due', header: 'Due', numeric: true, nowrap: true, cell: (i) => day(i.dueAt) },
          {
            key: 'age', header: 'Overdue',
            cell: (i) => {
              const d = daysOverdue(i.dueAt);
              if (d === null) return i.dueAt ? 'Not yet due' : 'No due date';
              // The NUMBER, not a colour. It is what the phone call is about.
              return <StatusBadge kind="blocked" label={`${d} day${d === 1 ? '' : 's'} overdue`} />;
            },
          },
          { key: 'status', header: 'Status', secondary: true,
            cell: (i) => <InvoiceStatus status={i.status} /> },
        ]}
      />
    </>
  );
}
