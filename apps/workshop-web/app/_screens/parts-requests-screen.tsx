import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  PageHeader, LoadingState, EmptyState, StatusBadge, FormShell, Field, Select, TextInput,
} from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { askSupplierAction, decideSupplierRequestAction } from './ask-supplier-actions';

/**
 * The WORKSHOP's side of the parts marketplace — ask a supplier, read the quote,
 * accept or cancel.
 *
 * Owner, 2026-08-07: the product exists to connect *"vehicle owners with need to
 * repair with workshops and vehicle part suppliers"*. The customer→workshop edge
 * is 058; this is the second edge, and without it the parts marketplace is a
 * catalogue you can browse and not a marketplace you can transact in.
 *
 * ⚠️ NOT A PURCHASE ORDER. `parts.purchase_orders` is the workshop's internal
 * record of what it has ordered; this is the ASK, sent to somebody who has not
 * agreed and may decline. That table also carries migration 054's RESTRICTIVE
 * org policy, which a supplier can never satisfy — see `059_supplier_requests.sql`.
 */
export const dynamic = 'force-dynamic';

interface PartsRequest {
  id: string;
  supplierName: string;
  partDescription: string;
  quantity: number;
  neededBy: string | null;
  status: string;
  quoteMinor: number | null;
  quoteCurrency: string | null;
  quoteLeadDays: number | null;
  declineReason: string | null;
}

interface Supplier {
  id: string;
  name: string;
  city?: string | null;
}

const BADGE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  new: 'draft',
  quoted: 'attention',   // a quote is waiting on US — that is the actionable one
  accepted: 'complete',
  declined: 'blocked',
  cancelled: 'draft',
};

/** Minor units back to something a person reads — the inverse of the conversion
 *  the supplier's quote form performs, kept in sight of it. */
function money(minor: number | null, currency: string | null): string {
  if (minor === null) return '—';
  return `${currency ?? ''} ${(minor / 100).toFixed(2)}`.trim();
}

const BTN: React.CSSProperties = {
  height: '2.25rem',
  padding: `0 ${primitive.space[3]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
  cursor: 'pointer',
};

export function WorkshopPartsRequestsScreen() {
  return (
    <>
      <PageHeader
        title="Parts Requests"
        description="Ask a supplier in the marketplace for a part, and accept the quote that suits you."
      />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const [requests, suppliers] = await Promise.all([
    apiGet<PartsRequest[]>('workshop', '/supplier-requests'),
    // The PUBLIC directory — the same suppliers the marketplace lists. A
    // workshop can ask one it has no prior relationship with, which is the whole
    // point of a marketplace.
    apiGet<Supplier[]>('workshop', '/public/suppliers'),
  ]);

  if (!requests.ok) return <ApiFailure reason={requests.reason} workspaceId="workshop" />;

  return (
    <>
      {/* THE ASK. Placed above the list: the reason somebody opens this screen
          is usually to raise a request, not to read old ones. */}
      {suppliers.ok && suppliers.data.length > 0 ? (
        <section style={{ marginBottom: primitive.space[6] }}>
          <FormShell
            action={askSupplierAction}
            successPrefix="Sent — your request reference is"
            successHref={{ href: '/parts-and-supply/parts-requests', label: 'Back to parts requests' }}
          >
            <Field label="Which supplier?" htmlFor="supplierId">
              <Select
                id="supplierId"
                name="supplierId"
                required
                options={suppliers.data.map((s) => ({
                  value: s.id,
                  label: s.city ? `${s.name} — ${s.city}` : s.name,
                }))}
              />
            </Field>
            <Field
              label="What do you need?"
              hint="Describe the part and the vehicle. Most requests are not a catalogue line, and the detail is what gets the right part."
              htmlFor="partDescription"
            >
              <TextInput id="partDescription" name="partDescription" required maxLength={500} />
            </Field>
            <Field label="How many?" htmlFor="quantity">
              <TextInput id="quantity" name="quantity" type="number" required defaultValue="1" />
            </Field>
            <Field label="Needed by" hint="Optional." htmlFor="neededBy">
              <TextInput id="neededBy" name="neededBy" type="date" />
            </Field>
            <Field label="Anything else?" hint="Optional — VIN, engine code, or a photo reference." htmlFor="notes">
              <TextInput id="notes" name="notes" maxLength={2000} />
            </Field>
          </FormShell>
        </section>
      ) : (
        <EmptyState
          title="No suppliers listed yet"
          description="Parts requests go to suppliers in the marketplace directory. None are published yet, so there is nobody to ask."
        />
      )}

      <h2 style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        Your requests
      </h2>

      {requests.data.length === 0 ? (
        <EmptyState title="Nothing asked yet" description="Requests you send to suppliers appear here with their replies." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
          {requests.data.map((r) => (
            <li
              key={r.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: primitive.radius.lg,
                padding: primitive.space[4],
                background: themeVar.surfaceRaised,
              }}
            >
              <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: themeVar.textPrimary }}>
                  {r.quantity} × {r.partDescription}
                </span>
                <span style={{ color: themeVar.textSecondary }}>{r.supplierName}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusBadge kind={BADGE[r.status] ?? 'draft'} label={r.status} />
                </span>
              </div>

              {r.status === 'quoted' || r.status === 'accepted' ? (
                <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
                  Quoted {money(r.quoteMinor, r.quoteCurrency)}
                  {r.quoteLeadDays !== null ? ` · ${r.quoteLeadDays} day lead time` : ''}
                </p>
              ) : null}

              {r.declineReason ? (
                <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  Declined: {r.declineReason}
                </p>
              ) : null}

              {/*
                Accept only a QUOTED request; cancel only an unanswered one. The
                API enforces both independently — accepting requires a quote to
                accept, so a workshop can never believe a price was agreed when
                none was given.
              */}
              {r.status === 'quoted' || r.status === 'new' ? (
                <form action={decideSupplierRequestAction} style={{ display: 'flex', gap: primitive.space[2], marginTop: primitive.space[3] }}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    name="decision"
                    value={r.status === 'quoted' ? 'accepted' : 'cancelled'}
                    style={BTN}
                  >
                    {r.status === 'quoted' ? 'Accept this quote' : 'Cancel request'}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
