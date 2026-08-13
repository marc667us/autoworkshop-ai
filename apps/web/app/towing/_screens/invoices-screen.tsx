import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, DataTable } from '@autoworkshop/ui';
import { Badge, INVOICE_BADGE, money, when } from './shared';

export const dynamic = 'force-dynamic';

interface TowingInvoice {
  id: string;
  invoiceNumber: string;
  currency: string;
  calloutFee: string | null;
  distanceCharge: string | null;
  otherCharges: string | null;
  total: string | null;
  status: string;
  issuedAt: string | null;
  reference: string;
  contactName: string;
}

/**
 * `/operations/invoices` — billing for recoveries.
 *
 * ⚠️ SEPARATE FROM `finance.invoices`, and migration 074's header says why:
 * that table requires a `job_card_id`, and a roadside recovery has no job card.
 * Inventing a phantom one to reuse the table would corrupt the workshop's own
 * reporting. The two reconcile at the ledger, not in the schema.
 *
 * ⚠️ AMOUNTS ARE STRINGS ALL THE WAY THROUGH. node-pg returns NUMERIC as a
 * string because it does not fit a double without loss; parsing it here to
 * format it would reintroduce exactly the error the column type prevents.
 */
export function InvoicesScreen() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Recovery billing. Raise one from a completed recovery; rates come from Settings."
      />
      <Suspense fallback={<LoadingState label="Loading invoices…" />}>
        <Rows />
      </Suspense>
    </>
  );
}

async function Rows() {
  const result = await apiGet<TowingInvoice[]>('towing', '/towing/invoices');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Complete a recovery, then raise its invoice from Completed Recoveries. Set the call-out fee and per-km rate on Settings first, or every invoice totals zero."
      />
    );
  }

  const drafts = result.data.filter((i) => i.status === 'draft').length;

  return (
    <DataTable
      caption="Towing invoices"
      summary={`${result.data.length} invoice${result.data.length === 1 ? '' : 's'} · ${drafts} not yet issued`}
      rows={result.data}
      rowKey={(i) => i.id}
      columns={[
        { key: 'no', header: 'Invoice', nowrap: true, cell: (i) => i.invoiceNumber },
        { key: 'ref', header: 'Recovery', nowrap: true, cell: (i) => i.reference },
        { key: 'who', header: 'Customer', cell: (i) => i.contactName },
        {
          key: 'callout',
          header: 'Call-out',
          numeric: true,
          nowrap: true,
          cell: (i) => money(i.calloutFee, i.currency),
        },
        {
          key: 'distance',
          header: 'Distance',
          numeric: true,
          nowrap: true,
          cell: (i) => money(i.distanceCharge, i.currency),
        },
        {
          key: 'other',
          header: 'Other',
          numeric: true,
          nowrap: true,
          cell: (i) => money(i.otherCharges, i.currency),
        },
        {
          key: 'total',
          header: 'Total',
          numeric: true,
          nowrap: true,
          cell: (i) => <strong>{money(i.total, i.currency)}</strong>,
        },
        { key: 'issued', header: 'Issued', numeric: true, nowrap: true, cell: (i) => when(i.issuedAt) },
        {
          key: 'status',
          header: 'Status',
          nowrap: true,
          cell: (i) => <Badge map={INVOICE_BADGE} value={i.status} />,
        },
      ]}
    />
  );
}
