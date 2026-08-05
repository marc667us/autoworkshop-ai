import { BasketPanel } from '@autoworkshop/marketplace-ui';
import { PageHeader } from '@autoworkshop/ui';
import { loadBasketAction, placeOrderAction } from '../_screens/basket-actions';

/**
 * `/basket` — the cart for the public parts marketplace on the apex.
 *
 * @public-route
 *
 * 🔴 WHY THIS ROUTE HAD TO SHIP IN THE SAME COMMIT AS "ADD TO BASKET".
 *
 * The owner asked for a shopping cart on the landing (2026-08-06). Adding the
 * button without this page would have produced a control that writes to
 * localStorage and leads NOWHERE — the exact dead-end shape this repository has
 * paid for repeatedly: `POST /job-cards` with no workshop-side caller,
 * `grant()` with no UI that could supply a userId, `link_sponsor_user()` with
 * no caller outside tests. The question that finds it is "what UI could call
 * this?", and the mirror of it is "where does this button go?".
 *
 * ⚠️ DELIBERATELY NOT GATED, and that is not an oversight. A visitor fills a
 * basket BEFORE they have an account — that is the point of a public
 * marketplace — so `requireNavRoute` here would 404 exactly the person the
 * landing page just converted. The sign-in wall is at CHECKOUT: `placeOrder`
 * calls a guarded endpoint and `basket-actions.ts` turns its 401 into "Sign in
 * to place the order. Your basket is kept."
 *
 * Nothing on this page reads tenant data. The prices come from
 * `/public/parts/by-ids`, which is public, and the basket is browser state.
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Your basket"
        description="Parts you have picked from the marketplace. Prices are read from the supplier catalogue at checkout, so what you are charged is always the catalogue's price."
      />
      {/*
        ⚠️ THE ACTIONS ARE PASSED IN, and they are THIS app's — they name the
        `workshop` workspace. The shared panel names no workspace at all, so it
        cannot inherit customer-web's by accident. See `basket-actions.ts`.
      */}
      <BasketPanel
        loadParts={loadBasketAction}
        placeOrder={placeOrderAction}
        ordersHref="/parts-and-suppliers/marketplace"
      />
    </>
  );
}
