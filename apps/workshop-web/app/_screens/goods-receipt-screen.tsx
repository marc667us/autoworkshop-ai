import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { receiveGoodsAction } from './parts-actions';

/**
 * GOODS RECEIPT — booking a delivery in. Slice 4,
 * `/parts-and-supply/goods-receipt`.
 *
 * ── 🔴 THE RECEIPT AND THE STOCK MOVEMENT ARE ONE TRANSACTION ──────────────
 *
 * `PartsService.receiveGoods` writes the receipt and the movements together. A
 * receipt recorded without the stock arriving on the shelf is the single most
 * confusing state a store can be in: the paperwork says it came and the shelf
 * says it did not, and nobody can tell which is wrong.
 *
 * ── ⚠️ ONE LINE PER RECEIPT ON THIS SCREEN, AND THAT IS A REAL LIMIT ───────
 *
 * The API takes up to 200 lines; this form books ONE part at a time. A
 * multi-line receipt needs add/remove row handling that is worth building when
 * a workshop asks for it, and a form that pretended to take several while
 * sending one would be worse than a form that is honest about taking one. Book
 * a multi-part delivery as several receipts against the same delivery note.
 */

interface ReceiptRow {
  id: string;
  receipt_number: string;
  order_number: string | null;
  supplier_name: string | null;
  delivery_note_reference: string | null;
  notes: string | null;
  received_by_name: string | null;
  received_at: string;
}

interface StockOption { stockItemId: string; partNumber: string; name: string; unit: string }

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function GoodsReceiptScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Goods Receipt');

  const [receipts, stock] = await Promise.all([
    apiGet<ReceiptRow[]>('workshop', '/goods-receipts'),
    apiGet<StockOption[]>('workshop', '/stock'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Deliveries booked in. Recording a receipt puts the stock on the shelf in the same step — the paperwork and the shelf can never disagree."
    />
  );

  if (!receipts.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={receipts.reason} workspaceId="workshop" />
      </>
    );
  }

  return (
    <>
      {header}

      {receipts.data.length === 0 ? (
        <EmptyState
          title="No deliveries booked in yet"
          description="Book a delivery in and the stock appears on the inventory screen immediately."
        />
      ) : (
        <DataTable
          caption="Goods receipts"
          summary={`${receipts.data.length} deliver${receipts.data.length === 1 ? 'y' : 'ies'}`}
          rowKey={(r) => r.id}
          rows={receipts.data}
          columns={[
            { key: 'no', header: 'Receipt', nowrap: true, cell: (r) => r.receipt_number },
            { key: 'when', header: 'Received', numeric: true, nowrap: true,
              cell: (r) => when(r.received_at) },
            { key: 'order', header: 'Against order', nowrap: true,
              cell: (r) => r.order_number ?? 'No order' },
            { key: 'supplier', header: 'Supplier', cell: (r) => r.supplier_name ?? '—' },
            { key: 'note', header: 'Delivery note', secondary: true,
              cell: (r) => r.delivery_note_reference ?? '—' },
            { key: 'by', header: 'Booked in by', secondary: true,
              cell: (r) => r.received_by_name ?? '—' },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Book a delivery in</h2>
      {!stock.ok || stock.data.length === 0 ? (
        <EmptyState
          title="Add the part to stock first"
          description="A delivery is booked against a stock line, so the workshop knows where it goes on the shelf. Add the part on the Inventory screen."
        />
      ) : (
        <>
          <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: 0 }}>
            One part per receipt. For a delivery with several parts, book each one against the
            same delivery-note reference.
          </p>
          <FormShell action={receiveGoodsAction} successPrefix="Booked in">
            <Field label="Part" htmlFor="stockItemId">
              <Select
                id="stockItemId"
                name="stockItemId"
                required
                options={stock.data.map((s) => ({
                  value: s.stockItemId,
                  label: `${s.partNumber} — ${s.name}`,
                }))}
              />
            </Field>
            <Field label="How many arrived" htmlFor="quantity">
              <TextInput id="quantity" name="quantity" type="number" min={0.001} step="0.001" required />
            </Field>
            <Field
              label="Delivery note reference"
              hint="The supplier's number, so the two records can be matched later."
              htmlFor="deliveryNoteReference"
            >
              <TextInput id="deliveryNoteReference" name="deliveryNoteReference" maxLength={200} />
            </Field>
            <Field label="Notes" hint="Damage, shortfalls, anything worth remembering." htmlFor="notes">
              <TextInput id="notes" name="notes" maxLength={2000} />
            </Field>
            <SubmitButton>Book it in</SubmitButton>
          </FormShell>
        </>
      )}
    </>
  );
}
