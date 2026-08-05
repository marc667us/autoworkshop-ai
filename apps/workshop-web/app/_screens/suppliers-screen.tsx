import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';
import Link from 'next/link';
import { navLabelFor } from './nav-label';

/**
 * SUPPLIERS — who this workshop buys from. Slice 4.
 *
 * Mounted at §46 `/parts-and-suppliers/suppliers`, §34
 * `/parts-and-supply/suppliers` and §48 `/parts/supplier-inquiries`.
 *
 * ── ⚠️ READ-ONLY, AND THAT IS NOT A GAP ────────────────────────────────────
 *
 * The supplier directory is the MARKETPLACE's, not this workshop's: suppliers
 * register themselves, publish their own catalogue, and appear here because they
 * are selling. A workshop cannot create a supplier record any more than it can
 * create a shop. What it CAN do is order from them, and that is the procurement
 * screen.
 *
 * ⚠️ A supplier the workshop buys from off the marketplace — the shop down the
 * road — is recorded on the PURCHASE ORDER as `supplier_name`, not here. That is
 * why `parts.purchase_orders.supplier_id` is nullable while `supplier_name` is
 * not: the order always knows who it went to, even when the marketplace does not
 * know them.
 *
 * ── 🔴 THERE IS NO SUPPLIER-DIRECTORY ENDPOINT, AND THIS SCREEN SAYS SO ────
 *
 * The first version of this file called `/public/suppliers`. THAT ENDPOINT DOES
 * NOT EXIST — `public.controller.ts` serves parts, facets, mechanics, stats and
 * VIN, and nothing else. It would have shipped a screen whose main table was
 * permanently empty for a reason no reader could have guessed.
 *
 * Caught by grepping the controller before believing the call. So the screen
 * shows what this workshop ACTUALLY KNOWS — its own orders, grouped by supplier
 * — and points at the public marketplace for the directory, which is where the
 * directory really lives. Naming the limit beats an empty table.
 */

interface PurchaseOrderRow {
  id: string;
  supplier_name: string;
  supplier_id: string | null;
  status: string;
  currency: string;
  total: string;
  created_at: string;
}

export async function SuppliersScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Suppliers');

  const orders = await apiGet<PurchaseOrderRow[]>('workshop', '/purchase-orders');

  const header = (
    <PageHeader
      title={title}
      description="Suppliers selling on the marketplace, and what this workshop has ordered from each. Suppliers register themselves — a workshop orders from them rather than creating them."
    />
  );

  // Spend per supplier, from the workshop's OWN orders — not from anything the
  // marketplace reports about itself.
  const spendBySupplier = new Map<string, { total: number; count: number; currency: string }>();
  if (orders.ok) {
    for (const o of orders.data) {
      if (o.status === 'cancelled') continue;
      const key = o.supplier_name;
      const prev = spendBySupplier.get(key) ?? { total: 0, count: 0, currency: o.currency };
      spendBySupplier.set(key, {
        total: prev.total + Number(o.total ?? 0),
        count: prev.count + 1,
        currency: o.currency,
      });
    }
  }

  return (
    <>
      {header}

      <h2 style={{ fontSize: '1rem' }}>What this workshop has ordered</h2>
      {!orders.ok ? (
        <ApiFailure reason={orders.reason} workspaceId="workshop" />
      ) : spendBySupplier.size === 0 ? (
        <EmptyState
          title="Nothing ordered yet"
          description="Parts bought through the marketplace basket, or ordered by telephone and recorded on the procurement screen, appear here grouped by supplier."
        />
      ) : (
        <DataTable
          caption="Spend by supplier"
          summary={`${spendBySupplier.size} supplier${spendBySupplier.size === 1 ? '' : 's'}`}
          rowKey={(row) => row[0]}
          rows={[...spendBySupplier.entries()]}
          columns={[
            { key: 'name', header: 'Supplier', cell: (row) => row[0] },
            { key: 'orders', header: 'Orders', numeric: true, nowrap: true,
              cell: (row) => String(row[1].count) },
            {
              key: 'total', header: 'Spend', numeric: true, nowrap: true,
              cell: (row) => `${row[1].currency} ${row[1].total.toFixed(2)}`,
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Finding a supplier</h2>
      <p style={{ fontSize: '0.875rem' }}>
        The supplier directory lives on the public marketplace, where suppliers register and
        publish their own catalogue — this product has no private supplier list, deliberately,
        because a second directory would eventually disagree with the public one.{' '}
        <Link href="/">Browse the marketplace</Link> to search parts by vehicle and compare prices,
        then add what you need to the basket.
      </p>

      <p style={{ fontSize: '0.8125rem', opacity: 0.85 }}>
        Buying from a supplier that is not on the marketplace is fine — record the order on the
        Procurement screen and type their name. The order always knows who it went to.
      </p>
    </>
  );
}
