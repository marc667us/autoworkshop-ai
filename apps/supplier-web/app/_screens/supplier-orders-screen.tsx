import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { OrderControls } from './order-controls';

/**
 * The supplier order inbox — the seller's half of Slice A.
 *
 * ⚠️ THIS SCREEN IS THE REASON MIGRATION 023 EXISTS. Until 2026-07-31 a
 * supplier could not sign in at all: 021 defined a supplier as a catalogue
 * entity with "no tenant, no users, no job cards", which was right for a
 * catalogue and wrong the moment 022 gave them orders to act on. 023 added
 * `catalogue.supplier_users`, and this is the screen it was added for.
 *
 * ⚠️ IT CALLS THE SAME ENDPOINT SHAPE THE BUYER'S SCREEN DOES, AND THE POLICY
 * IS WHAT MAKES THEM DIFFERENT LISTS. That is the property worth having: there
 * is no supplier-only query that could drift from the buyer's, and no WHERE
 * clause in this app that a mistake could widen. A revoked member sees nothing
 * — proven in verify/023 check 4, against a membership row that still exists.
 *
 * ⚠️ THE BUYER'S DELIVERY DETAILS ARE SHOWN, AND THAT IS INTENDED. You cannot
 * deliver to an address you cannot read. What is NOT here is the buyer's
 * account: no email, no other orders, no vehicle or workshop record. The order
 * carries only the recipient, phone and address the buyer gave FOR THIS
 * DELIVERY — the same consented-copy principle 021 used for the mechanic
 * directory.
 */

export const dynamic = 'force-dynamic';

interface SupplierOrder {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  total: string;
  payment_status: string;
  placed_at: string;
  delivery_recipient: string;
  delivery_phone: string;
  delivery_address: string;
  delivery_tracking_reference: string | null;
}

function badgeKind(status: string): 'draft' | 'active' | 'complete' | 'blocked' {
  switch (status) {
    case 'placed':
      return 'draft';
    case 'confirmed':
    case 'dispatched':
      return 'active';
    case 'delivered':
      return 'complete';
    default:
      return 'blocked';
  }
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function SupplierOrdersScreen() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders placed with you in the marketplace. Confirm what you can supply, then dispatch it with your own delivery arrangements."
      />
      <Suspense fallback={<LoadingState label="Loading your orders…" />}>
        <OrderList />
      </Suspense>
    </>
  );
}

async function OrderList() {
  const result = await apiGet<SupplierOrder[]>('supplier', '/marketplace/supplier/orders');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="supplier" />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="When a customer orders one of your published parts from the marketplace, it appears here with their delivery details."
      />
    );
  }

  // Newest first is already the API's order. Orders still needing action are
  // NOT re-sorted to the top: a list whose order changes as you work it is a
  // list where you lose your place.
  const open = result.data.filter((o) => o.status === 'placed').length;

  return (
    <>
      {open > 0 && (
        <p style={{ margin: `0 0 ${primitive.space[4]} 0`, color: themeVar.textPrimary }}>
          <strong>
            {open} {open === 1 ? 'order is' : 'orders are'} waiting for you to confirm.
          </strong>{' '}
          <span style={{ color: themeVar.textSecondary }}>
            The customer can still cancel until you do.
          </span>
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
        {result.data.map((o) => (
          <li
            key={o.id}
            style={{
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.lg,
              padding: primitive.space[4],
              background: themeVar.surfaceRaised,
              display: 'grid',
              gap: primitive.space[2],
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
              <span
                style={{
                  // Quoted character by character between two businesses.
                  fontFamily: primitive.fontFamily.mono,
                  fontWeight: 600,
                  color: themeVar.textPrimary,
                }}
              >
                {o.order_number}
              </span>
              <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {when(o.placed_at)}
              </span>
              <span style={{ color: themeVar.textPrimary, fontWeight: 600 }}>
                {o.currency} {o.total}
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <StatusBadge kind={badgeKind(o.status)} label={o.status} />
              </span>
            </div>

            <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
              Deliver to <strong style={{ color: themeVar.textPrimary }}>{o.delivery_recipient}</strong>
              {' · '}
              <span style={{ fontFamily: primitive.fontFamily.mono }}>{o.delivery_phone}</span>
              <br />
              {o.delivery_address}
            </div>

            <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
              {/*
                Payment is a RECORD, not something this screen can take. No
                provider is configured — the customer settles with you directly
                and one of you records it against the order.
              */}
              {o.payment_status === 'paid'
                ? 'Customer has recorded this as paid.'
                : 'Not yet recorded as paid — the customer pays you directly.'}
              {o.delivery_tracking_reference
                ? ` · tracking ${o.delivery_tracking_reference}`
                : ''}
            </div>

            <OrderControls
              orderId={o.id}
              status={o.status}
              trackingReference={o.delivery_tracking_reference}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
