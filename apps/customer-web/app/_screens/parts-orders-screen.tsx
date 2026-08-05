import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { BasketPanel } from '@autoworkshop/marketplace-ui';
import { loadBasketAction, placeOrderAction } from './parts-order-actions';

/**
 * My Parts Orders — the buyer's half of Slice A (migrations 022 and 023).
 *
 * ⚠️ THIS IS THE FIRST SCREEN IN THE PRODUCT THAT IS NOT TENANT-SCOPED. Every
 * other customer screen reads tenant-owned data through `TenantGuard`; these
 * orders are owned by the USER, so the API route behind this page uses
 * `UserGuard` and `withUser`. A vehicle owner with no workshop affiliation sees
 * their orders here, which is precisely who the marketplace is for.
 *
 * The list applies NO owner predicate of its own. It does not need one: the RLS
 * policy on `catalogue.orders` is the filter, and repeating it in a query would
 * create a second place to forget it.
 */

export const dynamic = 'force-dynamic';

interface OrderRow {
  id: string;
  order_number: string;
  supplier_name: string;
  status: string;
  currency: string;
  total: string;
  payment_status: string;
  placed_at: string;
  delivery_tracking_reference: string | null;
  line_count: number;
}

/**
 * Map an order status onto the shared badge vocabulary.
 *
 * ⚠️ `StatusBadge` HAS A FIXED SET OF KINDS and inventing one renders nothing,
 * so every branch here resolves to a real kind. `cancelled` is `blocked` rather
 * than `danger` because a cancellation is a normal outcome, not an error.
 */
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
  // Fixed locale, not the server's. An order date that renders differently on
  // two machines is the kind of thing that gets reported as a data bug.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PartsOrdersScreen() {
  return (
    <>
      <PageHeader
        title="My Parts Orders"
        description="Parts you have ordered from suppliers in the marketplace. You deal directly with each supplier, who delivers with their own system."
      />
      {/*
        The basket renders ABOVE the history and disappears when empty, so the
        page is a checkout when you have something in it and a record when you
        do not. It is a client component — see basket.ts for why a basket is
        browser state until it becomes orders.
      */}
      <BasketPanel loadParts={loadBasketAction} placeOrder={placeOrderAction} />
      <Suspense fallback={<LoadingState label="Loading your orders…" />}>
        <OrderList />
      </Suspense>
    </>
  );
}

async function OrderList() {
  const result = await apiGet<OrderRow[]>('customer', '/marketplace/orders');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="customer" />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Browse the parts marketplace, add what you need to your basket, and your orders will appear here with their delivery status."
      />
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
      {result.data.map((o) => (
        <li
          key={o.id}
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.surfaceRaised,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
            <span
              style={{
                // An order number is quoted to a supplier character by
                // character — same reasoning as a number plate, §2845.
                fontFamily: primitive.fontFamily.mono,
                fontWeight: 600,
                color: themeVar.textPrimary,
              }}
            >
              {o.order_number}
            </span>
            <span style={{ color: themeVar.textPrimary }}>{o.supplier_name}</span>
            <span style={{ marginLeft: 'auto' }}>
              <StatusBadge kind={badgeKind(o.status)} label={o.status} />
            </span>
          </div>

          <p
            style={{
              margin: `${primitive.space[2]} 0 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {when(o.placed_at)} · {o.line_count} {o.line_count === 1 ? 'item' : 'items'} ·{' '}
            <span style={{ color: themeVar.textPrimary, fontWeight: 600 }}>
              {o.currency} {o.total}
            </span>{' '}
            ·{' '}
            {/*
              Payment is stated plainly rather than shown as a button. No payment
              provider is configured — that is the owner's decision — so what the
              product can honestly offer is a RECORD of a settlement made
              directly with the supplier.
            */}
            {o.payment_status === 'paid' ? 'paid' : 'not yet paid'}
            {o.delivery_tracking_reference
              ? ` · tracking ${o.delivery_tracking_reference}`
              : ''}
          </p>

          {o.status === 'placed' && (
            <p
              style={{
                margin: `${primitive.space[2]} 0 0 0`,
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              Waiting for {o.supplier_name} to confirm. You can still cancel it until they do.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
