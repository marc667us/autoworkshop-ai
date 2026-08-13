import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';
import Link from 'next/link';
import { navLabelFor } from './nav-label';

/**
 * MARKETPLACE, from inside the workshop. Slice 4,
 * `/parts-and-suppliers/marketplace` and `/parts-and-supply/marketplace`.
 *
 * ── 🔴 IT DOES NOT RE-IMPLEMENT THE CATALOGUE ──────────────────────────────
 *
 * The parts catalogue, its filters, the VIN search and the basket all already
 * exist on the public landing page at `/`, which a signed-in member of staff can
 * reach from the wordmark. Building a second catalogue here would be exactly
 * what `/marketplace`'s own header warns against: "a second, subtly different
 * catalogue that can disagree with the public one".
 *
 * So this screen does the part the public page cannot: it puts the marketplace
 * IN THE WORKSHOP'S CONTEXT — what is running low and therefore worth buying,
 * and a way straight into the catalogue with the basket the owner asked for.
 *
 * ⚠️ THE LOW-STOCK LIST IS THE POINT. A storekeeper opening "Marketplace" wants
 * to know what to buy, not to browse. Sending them to a search box with no
 * starting point is how a screen gets used once.
 */

interface StockRow {
  stockItemId: string;
  partNumber: string;
  name: string;
  brand: string | null;
  unit: string;
  available: string;
  reorderLevel: number | null;
  needsReorder: boolean;
}

interface Stats {
  parts: number;
  suppliers: number;
  countries: number;
}

export async function PartsMarketplaceScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Marketplace');

  const [low, stats] = await Promise.all([
    apiGet<StockRow[]>('workshop', '/stock?needsReorderOnly=true'),
    apiGet<Stats>('workshop', '/public/stats'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Buying parts. The catalogue, the vehicle search and the basket live on the public marketplace — this screen is what this workshop needs from it."
    />
  );

  if (!low.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={low.reason} workspaceId="workshop" />
      </>
    );
  }

  return (
    <>
      {header}

      <p style={{ fontSize: '0.9375rem' }}>
        <Link href="/">Open the parts marketplace</Link> — search by vehicle, compare supplier prices,
        and add what you need to the basket.
        {stats.ok ? (
          <>
            {' '}
            <span style={{ opacity: 0.85 }}>
              {stats.data.parts} parts from {stats.data.suppliers} suppliers across{' '}
              {stats.data.countries} countries.
            </span>
          </>
        ) : null}
      </p>

      <h2 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>What this workshop is running low on</h2>
      {low.data.length === 0 ? (
        <EmptyState
          title="Nothing is below its reorder level"
          description="Stock lines with a reorder level set are watched automatically. Anything that falls to or below it appears here — and on the Inventory screen."
        />
      ) : (
        <DataTable
          caption="Low stock"
          summary={`${low.data.length} line${low.data.length === 1 ? '' : 's'} at or below the reorder level`}
          rowKey={(s) => s.stockItemId}
          rows={low.data}
          columns={[
            { key: 'part', header: 'Part', nowrap: true, cell: (s) => s.partNumber },
            { key: 'name', header: 'Description',
              cell: (s) => (s.brand ? `${s.name} — ${s.brand}` : s.name) },
            { key: 'available', header: 'Available', numeric: true, nowrap: true,
              cell: (s) => `${s.available} ${s.unit}` },
            { key: 'level', header: 'Reorder at', numeric: true, nowrap: true,
              cell: (s) => (s.reorderLevel === null ? '—' : String(s.reorderLevel)) },
            {
              key: 'find', header: '',
              // Straight into the catalogue with the part number already
              // searched — a storekeeper should not have to retype it.
              cell: (s) => <a href={`/?q=${encodeURIComponent(s.partNumber)}`}>Find it</a>,
            },
          ]}
        />
      )}

      <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: '1.5rem' }}>
        Orders placed through the basket are recorded, not paid for in the app (ADR-012). Once a
        supplier confirms, record the delivery on the Goods Receipt screen and the stock lands on
        the Inventory list.
      </p>
    </>
  );
}
