import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * FIND PARTS — slice 14.
 *
 * The workshop's OWN shelf, answered from `parts.stock_on_hand` — the view that
 * already computes on-hand, reserved and available from the movement ledger.
 * Re-deriving those numbers here would be a second answer to "how many are
 * there", and the two would disagree the first time a movement was written by
 * anything else.
 *
 * ⚠️ AVAILABLE, NOT ON-HAND, IS THE NUMBER A TECHNICIAN NEEDS. Five on the
 * shelf with five reserved for other jobs is zero for the person asking "can I
 * fit this today?". Both are shown, and availability is what the row is sorted
 * and badged by.
 *
 * ⚠️ THIS IS NOT THE MARKETPLACE. `catalogue` is what suppliers sell; this is
 * what the workshop physically has. A technician who confuses the two orders a
 * part that is already on the shelf.
 */

interface StockSearchRow {
  stockItemId: string;
  partNumber: string;
  name: string;
  brand: string | null;
  unit: string | null;
  shelfLocation: string | null;
  onHand: string;
  reserved: string;
  available: string;
  needsReorder: boolean;
}

export async function FindPartsScreen({ q }: { q?: string }) {
  const parts = await apiGet<StockSearchRow[]>(
    'workshop',
    `/plan-work/find-parts${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  );

  const header = (
    <PageHeader
      title="Find Parts"
      description="What is on the workshop's own shelves right now. “Available” is on-hand minus what other jobs have reserved."
    />
  );

  if (!parts.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={parts.reason} workspaceId="workshop" />
      </>
    );
  }

  if (parts.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title={q ? `Nothing on the shelf matches “${q}”` : 'No stock recorded'}
          description={
            q
              ? 'Try the part number, the name, or the brand. Nothing here means nothing in the workshop’s own stock — the marketplace is a different question.'
              : 'Stock appears here once it is received. Until then the shelf is genuinely empty rather than unrecorded.'
          }
        />
      </>
    );
  }

  const usable = parts.data.filter((p) => Number(p.available) > 0).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${parts.data.length} stock lines · ${usable} with stock available now`}
        rows={parts.data}
        rowKey={(r) => r.stockItemId}
        columns={[
          { key: 'pn', header: 'Part number', nowrap: true, cell: (r) => r.partNumber },
          { key: 'name', header: 'Part', cell: (r) => r.name },
          { key: 'brand', header: 'Brand', cell: (r) => r.brand ?? '—' },
          { key: 'where', header: 'Shelf', nowrap: true, cell: (r) => r.shelfLocation ?? '—' },
          {
            key: 'avail',
            header: 'Available',
            numeric: true,
            nowrap: true,
            cell: (r) => (r.unit ? `${r.available} ${r.unit}` : r.available),
          },
          {
            key: 'onhand',
            header: 'On hand',
            numeric: true,
            nowrap: true,
            // Shown beside available so a zero is explicable: "five here, five
            // spoken for" is a different conversation from "none here".
            cell: (r) => `${r.onHand} (${r.reserved} reserved)`,
          },
          {
            key: 'state',
            header: '',
            cell: (r) =>
              Number(r.available) > 0 ? (
                <StatusBadge kind="complete" label="In stock" />
              ) : r.needsReorder ? (
                <StatusBadge kind="attention" label="Reorder" />
              ) : (
                <StatusBadge kind="blocked" label="None free" />
              ),
          },
        ]}
      />
    </>
  );
}
