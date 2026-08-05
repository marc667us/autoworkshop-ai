'use server';

import { apiGet, apiPost } from '@autoworkshop/next-shell';
import type { BasketPart, PlaceResult } from '@autoworkshop/marketplace-ui';

/**
 * The apex's own checkout actions — owner request, 2026-08-06.
 *
 * 🔴 EVERY CALL HERE NAMES THE WORKSPACE `'workshop'`, AND THAT IS THE ENTIRE
 * REASON THIS FILE EXISTS RATHER THAN AN IMPORT FROM `customer-web`.
 *
 * `apiGet`/`apiPost` read the session from `authjs.session-token.<workspace>`.
 * This app owns the apex, so its cookie is `.workshop`; `customer-web`'s is
 * `.customer`. Reusing that app's actions here would read a cookie that CANNOT
 * EXIST on this host, and every checkout would report "your session has ended".
 *
 * ⚠️ AND IT WOULD PASS EVERY LOCAL TEST. `localhost:3000` and `localhost:3001`
 * share one cookie jar because COOKIES IGNORE THE PORT, so the wrong workspace
 * id works perfectly on a developer's machine and fails only in production.
 * That has happened THREE times in this repository — most recently on
 * 2026-08-05, when `vehicle-lookup` was copied into this app still calling
 * `apiGet('customer', …)` and would have killed the VIN funnel the same commit
 * had just repaired.
 *
 * The shared `BasketPanel` therefore takes these as PROPS and names no
 * workspace itself, so neither app can inherit the other's by accident.
 */

/**
 * Prices for what is in the basket.
 *
 * ⚠️ A PUBLIC ENDPOINT, deliberately. The basket works for a visitor who has not
 * signed in — that is the whole point of a public marketplace — so pricing it
 * must not require a session. The SIGN-IN WALL BELONGS AT CHECKOUT, once the
 * person has decided they want something, not in front of the shop window.
 */
export async function loadBasketAction(ids: string[]): Promise<BasketPart[]> {
  if (ids.length === 0) return [];
  const query = encodeURIComponent(ids.join(','));
  const result = await apiGet<{ parts: BasketPart[] }>(
    'workshop',
    `/public/parts/by-ids?ids=${query}`,
  );
  return result.ok ? result.data.parts : [];
}

/**
 * Place the order.
 *
 * ⚠️ THE BUYER IS TAKEN FROM THE VALIDATED TOKEN BY `UserGuard`, never from
 * here, and migration 022's `buyer_insert` WITH CHECK refuses any other value.
 * Nothing this action sends can change who the order belongs to.
 *
 * ⚠️ NO PRICES ARE SENT. `OrderService.priceParts` re-reads every price from
 * `catalogue.parts` inside the transaction that writes the order, so what the
 * basket displayed is a courtesy and what is charged is the catalogue's.
 */
export async function placeOrderAction(
  items: Array<{ partId: string; quantity: number }>,
  delivery: { recipient: string; phone: string; address: string },
): Promise<PlaceResult> {
  const result = await apiPost<{
    orders: Array<{ id: string; orderNumber: string; total: string }>;
  }>('workshop', '/marketplace/orders', { items, delivery });

  if (!result.ok) {
    if (result.reason === 'unauthenticated') {
      // ⚠️ NAMES THE STEP, not the system. This is the expected path for an
      // anonymous visitor who filled a basket on the public landing — it is the
      // sign-in wall arriving exactly where it should, so it must not read like
      // an error. The basket is in localStorage and survives the round trip.
      return {
        ok: false,
        message:
          'Sign in to place the order. Your basket is kept — you will come back to it.',
      };
    }
    return {
      ok: false,
      message:
        // The API's own sentence when it has one: "that part is no longer
        // available", "your basket mixes currencies". Replacing it with a
        // generic string throws away the only part the buyer can act on.
        result.reason === 'invalid'
          ? (result.message ??
            'Some details were not accepted. Check the delivery fields and try again.')
          : result.reason === 'forbidden'
            ? 'Your account may not place parts orders.'
            : 'The parts service did not respond. No order was placed.',
    };
  }

  const count = result.data.orders.length;
  return {
    ok: true,
    // One order per SUPPLIER — a mixed basket produces several, and a buyer who
    // is told "order placed" then sees three confirmations would think
    // something went wrong.
    message:
      count === 1
        ? 'Order placed.'
        : `${count} orders placed — one for each supplier in your basket.`,
    orders: result.data.orders,
  };
}
