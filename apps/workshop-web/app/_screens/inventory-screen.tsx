import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createStockItemAction } from './parts-actions';

/**
 * INVENTORY — what is actually on this workshop's shelf. Slice 4.
 *
 * Mounted at §46 `/parts-and-suppliers/inventory`, §34 `/parts-and-supply/parts-depot`
 * and §48 `/parts/parts-status`: three trees, three names, one question.
 *
 * ── 🔴 THIS IS NOT THE MARKETPLACE CATALOGUE ───────────────────────────────
 *
 * `catalogue.parts` is what SUPPLIERS list for sale, and its `in_stock` means
 * "the supplier says they have it". This is the workshop's own shelf. Merging
 * the two would let a supplier's stock level answer "can I fit this today?"
 *
 * ── 🔴 ON HAND IS SUMMED FROM THE LEDGER, NEVER STORED ─────────────────────
 *
 * There is no `quantity_on_hand` column. Every change is a signed row in
 * `parts.stock_movements` and this reads `parts.stock_on_hand`, which sums them.
 * A counter drifts the first time a write is retried, and a workshop whose
 * system says four alternators when the shelf holds three has a system nobody
 * believes. It also makes "why is it that number" answerable.
 *
 * ── ⚠️ THREE NUMBERS, NOT ONE ──────────────────────────────────────────────
 *
 * ON HAND is what is physically there. RESERVED is what is spoken for.
 * AVAILABLE is the difference, and it is the only one that answers "can I use
 * this now". Showing on-hand alone is how two jobs get promised the same part.
 */

interface StockRow {
  stockItemId: string;
  partNumber: string;
  name: string;
  brand: string | null;
  unit: string;
  unitCost: string | null;
  currency: string;
  reorderLevel: number | null;
  shelfLocation: string | null;
  onHand: string;
  reserved: string;
  available: string;
  needsReorder: boolean;
}

export async function InventoryScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Inventory');
  const stock = await apiGet<StockRow[]>('workshop', '/stock');

  const header = (
    <PageHeader
      title={title}
      description="The workshop's own stock. On hand is what is physically there, reserved is what is spoken for, and available is what you can actually use today."
    />
  );

  if (!stock.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={stock.reason} workspaceId="workshop" />
      </>
    );
  }

  const low = stock.data.filter((s) => s.needsReorder);

  return (
    <>
      {header}

      {stock.data.length === 0 ? (
        <EmptyState
          title="Nothing on the shelf yet"
          description="Add the parts this workshop keeps. Give each one a reorder level and the list will tell you when it is running out."
        />
      ) : (
        <DataTable
          caption="Stock"
          summary={
            low.length > 0
              ? `${low.length} at or below its reorder level · ${stock.data.length} lines`
              : `${stock.data.length} lines, none low`
          }
          rowKey={(s) => s.stockItemId}
          rows={stock.data}
          columns={[
            { key: 'part', header: 'Part', nowrap: true, cell: (s) => s.partNumber },
            {
              key: 'name', header: 'Description',
              cell: (s) => (s.brand ? `${s.name} — ${s.brand}` : s.name),
            },
            { key: 'where', header: 'Shelf', secondary: true, cell: (s) => s.shelfLocation ?? '—' },
            { key: 'onhand', header: 'On hand', numeric: true, nowrap: true,
              cell: (s) => `${s.onHand} ${s.unit}` },
            { key: 'reserved', header: 'Reserved', numeric: true, nowrap: true, secondary: true,
              cell: (s) => (Number(s.reserved) === 0 ? '—' : s.reserved) },
            {
              key: 'available', header: 'Available', numeric: true, nowrap: true,
              // The number that answers "can I use this now".
              cell: (s) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{s.available}</strong>,
            },
            {
              key: 'reorder', header: 'Reorder',
              cell: (s) =>
                s.reorderLevel === null ? (
                  // No level set is NOT the same as "fine" — say so rather than
                  // rendering a reassuring blank.
                  <span style={{ opacity: 0.7 }}>No level set</span>
                ) : s.needsReorder ? (
                  <StatusBadge kind="blocked" label={`At or below ${s.reorderLevel}`} />
                ) : (
                  <StatusBadge kind="complete" label={`Above ${s.reorderLevel}`} />
                ),
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Add a part to stock</h2>
      <FormShell action={createStockItemAction} successPrefix="Added">
        <Field label="Part number" hint="How this workshop refers to it." htmlFor="partNumber">
          <TextInput id="partNumber" name="partNumber" required maxLength={120} />
        </Field>
        <Field label="Description" htmlFor="name">
          <TextInput id="name" name="name" required maxLength={300} />
        </Field>
        <Field label="Brand" htmlFor="brand">
          <TextInput id="brand" name="brand" maxLength={120} />
        </Field>
        <Field label="Unit" hint="each, litre, metre…" htmlFor="unit">
          <TextInput id="unit" name="unit" maxLength={40} defaultValue="each" />
        </Field>
        <Field label="What it costs the workshop" hint="Not what the customer is charged — that comes from the quotation." htmlFor="unitCost">
          <TextInput id="unitCost" name="unitCost" type="number" min={0} step="0.01" />
        </Field>
        <Field label="Reorder level" hint="Tell you when available falls to this. Leave blank if you would rather not be told." htmlFor="reorderLevel">
          <TextInput id="reorderLevel" name="reorderLevel" type="number" min={0} />
        </Field>
        <Field label="Shelf location" htmlFor="shelfLocation">
          <TextInput id="shelfLocation" name="shelfLocation" maxLength={120} />
        </Field>
        <Field label="How many are on the shelf now" hint="Recorded as an opening balance, so the ledger explains the number from its first row." htmlFor="openingQuantity">
          <TextInput id="openingQuantity" name="openingQuantity" type="number" min={0} />
        </Field>
        <SubmitButton>Add the part</SubmitButton>
      </FormShell>
    </>
  );
}
