'use server';

import { revalidatePath } from 'next/cache';
import { apiGet, apiPatch, apiPost } from '@autoworkshop/next-shell';

export interface PlaceResult {
  ok: boolean;
  message: string;
  /** One order per SUPPLIER — a mixed basket produces several. */
  orders?: Array<{ id: string; orderNumber: string; total: string }>;
}

interface Placed {
  orders: Array<{ id: string; orderNumber: string; total: string }>;
}

/**
 * Place the basket.
 *
 * ⚠️ ONLY PART IDS AND QUANTITIES CROSS THIS BOUNDARY. No price, no total, no
 * supplier. The API re-prices everything from `catalogue.parts` inside the
 * transaction that writes the order, so a tampered basket buys the same parts at
 * the same prices — or fails, if a part stopped being published.
 *
 * The buyer is taken from the validated token by `UserGuard`, never from here,
 * and migration 022's `buyer_insert` WITH CHECK refuses any other value.
 */
export async function placeOrderAction(
  items: Array<{ partId: string; quantity: number }>,
  delivery: { recipient: string; phone: string; address: string },
): Promise<PlaceResult> {
  const result = await apiPost<Placed>('customer', '/marketplace/orders', {
    items,
    delivery,
  });

  if (!result.ok) {
    // ⚠️ THE API'S OWN MESSAGE IS PREFERRED WHEN IT HAS ONE, because it is the
    // specific one — "that part is no longer available", "your basket mixes
    // currencies". Replacing it with a generic string here would throw away the
    // only sentence that tells the buyer what to DO.
    const message =
      result.reason === 'invalid'
        ? (result.message ??
          'Some details were not accepted. Check the delivery fields and try again.')
        : result.reason === 'unauthenticated'
          ? 'Sign in to place your order. Your basket is kept.'
          : result.reason === 'forbidden'
            ? 'Your account may not place orders.'
            : 'The order could not be placed just now. Nothing was charged and your basket is unchanged.';
    return { ok: false, message };
  }

  revalidatePath('/parts-and-warranty/parts-orders');

  const count = result.data.orders.length;
  return {
    ok: true,
    // Say plainly that a mixed basket became several orders, BEFORE the buyer
    // wonders why their list has three rows. Migration 022's header explains
    // why: each supplier delivers and is paid separately.
    message:
      count === 1
        ? `Order ${result.data.orders[0]!.orderNumber} placed.`
        : `${count} orders placed — one for each supplier, because each delivers separately.`,
    orders: result.data.orders,
  };
}

/** Cancel, with the reason the schema and the other party both require. */
export async function cancelOrderAction(
  orderId: string,
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  const result = await apiPatch<{ status: string }>(
    'customer',
    `/marketplace/orders/${orderId}/status`,
    { status: 'cancelled', reason },
  );

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === 'invalid'
          ? (result.message ?? 'That order could not be cancelled.')
          : 'The order could not be cancelled just now.',
    };
  }

  revalidatePath('/parts-and-warranty/parts-orders');
  return { ok: true, message: 'Order cancelled.' };
}

/**
 * Record a settlement made outside the app.
 *
 * There is no "pay now" counterpart, and that is the design: no payment provider
 * is configured, and choosing one is the owner's decision alone. Cash, bank
 * transfer and mobile money are recorded here and audited on the order.
 */
export async function recordPaymentAction(
  orderId: string,
  method: string,
  reference: string,
): Promise<{ ok: boolean; message: string }> {
  const result = await apiPatch<{ paymentStatus: string }>(
    'customer',
    `/marketplace/orders/${orderId}/payment`,
    { method, reference },
  );

  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === 'invalid'
        ? (result.message ?? 'That payment could not be recorded.')
        : 'The payment could not be recorded just now.',
    };
  }

  revalidatePath('/parts-and-warranty/parts-orders');
  return { ok: true, message: 'Payment recorded.' };
}

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

/**
 * Resolve the basket's part ids into names and LIVE prices.
 *
 * ⚠️ SERVER-SIDE ON PURPOSE, even though the endpoint is public. Doing it from
 * the browser would mean shipping an API base URL into client JavaScript and
 * giving the page a second, differently-configured way to reach the API. This
 * keeps exactly one path.
 *
 * Ids that come back MISSING are not an error — a part can be unpublished
 * between adding it and checking out. The panel compares what it asked for with
 * what it received and says which line is no longer available, which is the
 * whole reason this returns the list rather than a map.
 */
export async function loadBasketAction(ids: string[]): Promise<BasketPart[]> {
  if (ids.length === 0) return [];
  const query = encodeURIComponent(ids.join(','));
  const result = await apiGet<{ parts: BasketPart[] }>(
    'customer',
    `/public/parts/by-ids?ids=${query}`,
  );
  return result.ok ? result.data.parts : [];
}
