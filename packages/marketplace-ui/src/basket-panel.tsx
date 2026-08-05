'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import {
  clearBasket,
  readBasket,
  removeFromBasket,
  setQuantity,
  type BasketItem,
} from './basket';

/** A part as the checkout needs it. Mirrors `/public/parts/by-ids`. */
export interface BasketPart {
  id: string;
  partNumber: string;
  name: string;
  brand: string | null;
  price: string | null;
  currency: string;
  supplierId: string;
  supplierName: string;
}

export interface PlaceResult {
  ok: boolean;
  message: string;
  /** One order per SUPPLIER — a mixed basket produces several. */
  orders?: Array<{ id: string; orderNumber: string; total: string }>;
}

export interface BasketPanelProps {
  /**
   * The two server actions, INJECTED rather than imported.
   *
   * 🔴 THIS IS THE WHOLE REASON THE PANEL CAN BE SHARED, and it is the same
   * shape as `renderAddToBasket` on the landing. Both actions call `apiGet` /
   * `apiPost` with a WORKSPACE ID, and the workspace differs per app:
   * `customer-web` reads `authjs.session-token.customer`, the apex reads
   * `.workshop`. A shared component that imported one app's actions would carry
   * that app's workspace into the other — the exact bug this repository has
   * recorded THREE times, which passes every local test because
   * `localhost:3000` and `:3001` share one cookie jar, and fails only in
   * production.
   *
   * Injecting them means neither app can be wrong by accident: each passes its
   * own, and the panel never names a workspace at all.
   */
  loadParts: (ids: string[]) => Promise<BasketPart[]>;
  placeOrder: (
    items: Array<{ partId: string; quantity: number }>,
    delivery: { recipient: string; phone: string; address: string },
  ) => Promise<PlaceResult>;
  /** Where "see your orders" points. Per-app, because the route differs. */
  ordersHref?: string;
}

/**
 * The basket and checkout.
 *
 * A client component because a basket is browser state until it becomes orders
 * — see `basket.ts` for why there is no `catalogue.baskets` table.
 *
 * ⚠️ THE PRICES SHOWN HERE ARE READ FROM THE CATALOGUE, NOT FROM THE BASKET.
 * `localStorage` holds part ids and quantities only, so nothing the user can
 * edit reaches the money. The totals below are a courtesy; what is CHARGED is
 * recomputed by `OrderService.priceParts` inside the transaction that writes
 * the order. If the two ever disagree, the catalogue wins.
 */

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

/** Same parse as the API's, so the displayed total matches what it will charge. */
function toMinor(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, frac = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function BasketPanel({ loadParts, placeOrder, ordersHref }: BasketPanelProps) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [parts, setParts] = useState<BasketPart[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    const next = readBasket();
    setItems(next);
    if (next.length === 0) {
      setParts([]);
      setLoaded(true);
      return;
    }
    void loadParts(next.map((i) => i.partId)).then((p) => {
      setParts(p);
      setLoaded(true);
    });
    // `loadParts` IS a dependency now that it is a prop rather than a module
    // import — the empty array was correct only while it was imported.
    //
    // ⚠️ SAFE ONLY BECAUSE BOTH CALLERS PASS A STABLE REFERENCE: a `'use server'`
    // action imported at module scope, never an inline arrow. An inline function
    // would be a new value every render and this would refetch the basket in a
    // loop. If a third mount ever passes one, wrap it in `useCallback` there —
    // that is the fix, not deleting this dependency again.
  }, [loadParts]);

  useEffect(() => {
    refresh();
    // Both events: `storage` fires only in OTHER tabs, `aw:basket` is dispatched
    // by this tab's own writes. Without the second, adding a part from the
    // marketplace in this tab would not update the panel.
    window.addEventListener('storage', refresh);
    window.addEventListener('aw:basket', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('aw:basket', refresh);
    };
  }, [refresh]);

  // ⚠️ RENDER NOTHING UNTIL LOADED, rather than an empty basket. Server-rendered
  // HTML has no access to localStorage, so showing "your basket is empty" before
  // the effect runs would flash the wrong answer at somebody who has ten items.
  if (!loaded) return null;
  if (items.length === 0) return null;

  const byId = new Map(parts.map((p) => [p.id, p]));
  const missing = items.filter((i) => !byId.has(i.partId));
  const available = items.filter((i) => byId.has(i.partId));

  // One order per supplier — a rule, not a presentation choice (migration 022).
  const suppliers = new Set(available.map((i) => byId.get(i.partId)!.supplierId));

  const currencies = new Set(available.map((i) => byId.get(i.partId)!.currency));
  const mixedCurrency = currencies.size > 1;

  let totalMinor = 0;
  let unpriced = false;
  for (const i of available) {
    const m = toMinor(byId.get(i.partId)!.price);
    if (m === null) unpriced = true;
    else totalMinor += m * i.quantity;
  }
  const currency = currencies.size === 1 ? [...currencies][0]! : '';

  const canPlace =
    available.length > 0 &&
    !mixedCurrency &&
    !unpriced &&
    recipient.trim() !== '' &&
    phone.trim() !== '' &&
    address.trim() !== '' &&
    !pending;

  function place() {
    startTransition(async () => {
      const res = await placeOrder(
        available.map((i) => ({ partId: i.partId, quantity: i.quantity })),
        { recipient: recipient.trim(), phone: phone.trim(), address: address.trim() },
      );
      setResult({ ok: res.ok, message: res.message });
      if (res.ok) {
        clearBasket();
        refresh();
      }
    });
  }

  return (
    <section
      aria-label="Basket"
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
        marginBottom: primitive.space[6],
        display: 'grid',
        gap: primitive.space[3],
      }}
    >
      <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        Your basket
      </h2>

      {missing.length > 0 && (
        // Named rather than silently dropped: the buyer chose it, so they are
        // told it went and given the control to clear it.
        <p role="status" style={{ margin: 0, color: themeVar.statusDanger, fontSize: primitive.fontSize.sm }}>
          {missing.length === 1 ? 'One part is' : `${missing.length} parts are`} no longer
          available and {missing.length === 1 ? 'has' : 'have'} been left out of the total.
          {' '}
          {missing.map((m) => (
            <button
              key={m.partId}
              type="button"
              onClick={() => {
                removeFromBasket(m.partId);
                refresh();
              }}
              style={linkButton}
            >
              Remove it
            </button>
          ))}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
        {available.map((i) => {
          const p = byId.get(i.partId)!;
          const unit = toMinor(p.price);
          return (
            <li
              key={i.partId}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: primitive.space[3],
                alignItems: 'center',
                paddingBottom: primitive.space[2],
                borderBottom: `1px solid ${themeVar.borderDefault}`,
              }}
            >
              <span style={{ color: themeVar.textPrimary, flex: '1 1 12rem' }}>
                {p.name}
                {p.brand ? ` · ${p.brand}` : ''}
                <br />
                <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  {p.supplierName}
                  {unit === null ? ' · no price set' : ` · ${money(unit, p.currency)} each`}
                </span>
              </span>

              <label style={{ display: 'flex', alignItems: 'center', gap: primitive.space[2] }}>
                <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>Qty</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={i.quantity}
                  onChange={(e) => {
                    setQuantity(i.partId, Number(e.target.value));
                    refresh();
                  }}
                  style={{ width: '4.5rem', padding: primitive.space[1] }}
                />
              </label>

              <span style={{ minWidth: '6rem', textAlign: 'right', color: themeVar.textPrimary }}>
                {unit === null ? '—' : money(unit * i.quantity, p.currency)}
              </span>

              <button type="button" onClick={() => { removeFromBasket(i.partId); refresh(); }} style={linkButton}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      {mixedCurrency && (
        <p role="alert" style={{ margin: 0, color: themeVar.statusDanger, fontSize: primitive.fontSize.sm }}>
          Your basket mixes currencies ({[...currencies].join(', ')}). Order the items in each
          currency separately — the marketplace does not convert between them.
        </p>
      )}

      {unpriced && (
        <p role="alert" style={{ margin: 0, color: themeVar.statusDanger, fontSize: primitive.fontSize.sm }}>
          One of these parts has no price set, so it cannot be ordered yet. Remove it, or
          contact the supplier for a quote.
        </p>
      )}

      {!mixedCurrency && !unpriced && (
        <p style={{ margin: 0, fontWeight: 600, color: themeVar.textPrimary }}>
          Total {money(totalMinor, currency)}
          {suppliers.size > 1 && (
            // Said BEFORE they press the button, not after their list grows.
            <span style={{ fontWeight: 400, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              {' '}— this will become {suppliers.size} separate orders, one per supplier,
              because each supplier delivers and is paid separately.
            </span>
          )}
        </p>
      )}

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
        <legend style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Where should the supplier deliver?
        </legend>
        <input
          aria-label="Recipient name"
          placeholder="Recipient name"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          style={field}
        />
        <input
          aria-label="Phone number"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={field}
        />
        <textarea
          aria-label="Delivery address"
          placeholder="Delivery address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          style={field}
        />
      </fieldset>

      {/*
        ⚠️ NO "PAY NOW" BUTTON, AND THE PAGE SAYS WHY RATHER THAN SHOWING A
        DISABLED ONE. A greyed-out payment button implies a capability that does
        not exist. No payment provider is configured — that decision is the
        owner's alone — so the honest flow is: place the order, settle directly
        with the supplier, record the settlement against the order.
      */}
      <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        You pay the supplier directly — by cash, bank transfer or mobile money. Once you
        have paid, record it against the order so both of you have the same record.
      </p>

      <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={place} disabled={!canPlace} style={primaryButton(canPlace)}>
          {pending ? 'Placing…' : 'Place order'}
        </button>
        <button
          type="button"
          onClick={() => { clearBasket(); refresh(); setResult(null); }}
          style={linkButton}
        >
          Empty basket
        </button>
      </div>

      {result && (
        <p
          role="status"
          style={{
            margin: 0,
            color: result.ok ? themeVar.statusSuccess : themeVar.statusDanger,
          }}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}

const field: React.CSSProperties = {
  padding: primitive.space[2],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
  font: 'inherit',
};

const linkButton: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  color: themeVar.textSecondary,
  textDecoration: 'underline',
  cursor: 'pointer',
  font: 'inherit',
};

function primaryButton(enabled: boolean): React.CSSProperties {
  return {
    padding: `${primitive.space[2]} ${primitive.space[4]}`,
    borderRadius: primitive.radius.md,
    border: 0,
    background: enabled ? themeVar.actionPrimary : themeVar.borderDefault,
    color: enabled ? primitive.color.grey[0] : themeVar.textSecondary,
    cursor: enabled ? 'pointer' : 'not-allowed',
    font: 'inherit',
    fontWeight: 600,
  };
}
