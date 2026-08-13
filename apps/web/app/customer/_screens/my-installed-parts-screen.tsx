import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';

/**
 * PARTS FITTED TO YOUR VEHICLES — slice 13.
 *
 * Every row is a part the workshop actually recorded fitting, reached through
 * `execution_parts_used -> repair_executions -> job_cards`, and the job card is
 * where the customer lives. Nothing here is inferred from an order or a
 * quotation: a part that was quoted and not fitted must not appear on a list
 * headed "fitted to your vehicle".
 *
 * ⚠️ A PART WITH NO FITTED DATE IS SHOWN AS SUCH. The date comes from the
 * repair execution, and an execution still in progress has no completion time.
 * Showing today's date, or hiding the row, would both be lies of a different
 * kind.
 */

interface InstalledPartRow {
  id: string;
  description: string;
  partNumber: string | null;
  quantity: string;
  unit: string | null;
  jobNumber: string | null;
  registrationNumber: string | null;
  fittedOn: string | null;
}

export async function MyInstalledPartsScreen() {
  const parts = await apiGet<InstalledPartRow[]>('customer', '/my/installed-parts');

  const header = (
    <PageHeader
      title="Installed Parts"
      description="Every part the workshop has recorded fitting to your vehicles, with the job it was fitted on."
    />
  );

  if (!parts.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={parts.reason} workspaceId="customer" />
      </>
    );
  }

  if (parts.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No parts recorded yet"
          description="Parts appear here once a repair records fitting them. Work that has been quoted but not yet done will not show — a part that was quoted and not fitted does not belong on this list."
        />
      </>
    );
  }

  const vehicles = new Set(parts.data.map((p) => p.registrationNumber ?? '—')).size;

  return (
    <>
      {header}
      <DataTable
        caption={`${parts.data.length} parts across ${vehicles} vehicle${vehicles === 1 ? '' : 's'}`}
        rows={parts.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'part', header: 'Part', cell: (r) => r.description },
          { key: 'no', header: 'Part number', nowrap: true, cell: (r) => r.partNumber ?? '—' },
          {
            key: 'qty',
            header: 'Qty',
            numeric: true,
            nowrap: true,
            cell: (r) => (r.unit ? `${r.quantity} ${r.unit}` : r.quantity),
          },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          {
            key: 'when',
            header: 'Fitted',
            nowrap: true,
            cell: (r) => (r.fittedOn ? r.fittedOn.slice(0, 10) : 'repair in progress'),
          },
        ]}
      />
    </>
  );
}
