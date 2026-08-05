/**
 * The basket — browser state, deliberately, until the moment it becomes orders.
 *
 * ⚠️ WHY THERE IS NO `catalogue.baskets` TABLE. A basket belongs to somebody who
 * may not have signed in yet: the marketplace is public (021), so a visitor
 * browses and picks parts BEFORE they have an account. A server-side basket
 * would need either a row for every anonymous visitor, or a sign-in wall in
 * front of the part they just found — and the wall is exactly what the public
 * landing page exists to remove.
 *
 * So the basket lives in `localStorage` and survives the sign-in round trip. The
 * first server-side record of any of this is the ORDER, which is owned, priced
 * and audited.
 *
 * ⚠️ IT STORES PART IDS AND QUANTITIES, NEVER PRICES. A price kept here would be
 * a price the browser could edit. `OrderService.priceParts` re-reads every price
 * from `catalogue.parts` inside the transaction that writes the order, so what
 * is displayed below is a courtesy and what is charged is the catalogue's.
 * If the two disagree, the catalogue wins and the checkout says so.
 */

export const BASKET_KEY = 'aw.basket.v1';

export interface BasketItem {
  partId: string;
  quantity: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the basket, tolerating anything.
 *
 * `localStorage` is user-writable and survives deployments, so this parses
 * defensively: a stale or hand-edited value must produce an EMPTY basket rather
 * than throw during render and blank the page.
 */
export function readBasket(): BasketItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BASKET_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): BasketItem | null => {
        if (typeof entry !== 'object' || entry === null) return null;
        const { partId, quantity } = entry as Record<string, unknown>;
        if (typeof partId !== 'string' || !UUID.test(partId)) return null;
        const q = Number(quantity);
        if (!Number.isInteger(q) || q < 1 || q > 999) return null;
        return { partId, quantity: q };
      })
      .filter((v): v is BasketItem => v !== null)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function write(items: BasketItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BASKET_KEY, JSON.stringify(items));
  // Same-tab listeners; the native `storage` event only fires in OTHER tabs, so
  // without this the header count would not move when you add from this one.
  window.dispatchEvent(new CustomEvent('aw:basket'));
}

/** Add, or increase an existing line rather than duplicating it. */
export function addToBasket(partId: string, quantity = 1): void {
  const items = readBasket();
  const existing = items.find((i) => i.partId === partId);
  if (existing) existing.quantity = Math.min(999, existing.quantity + quantity);
  else items.push({ partId, quantity });
  write(items);
}

export function setQuantity(partId: string, quantity: number): void {
  const items = readBasket().map((i) =>
    i.partId === partId ? { ...i, quantity: Math.max(1, Math.min(999, quantity)) } : i,
  );
  write(items);
}

export function removeFromBasket(partId: string): void {
  write(readBasket().filter((i) => i.partId !== partId));
}

export function clearBasket(): void {
  write([]);
}

export function basketCount(items: readonly BasketItem[] = readBasket()): number {
  return items.reduce((n, i) => n + i.quantity, 0);
}
