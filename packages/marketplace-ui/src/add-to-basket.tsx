'use client';

import { useEffect, useState } from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
// ⚠️ THE SHARED ONE, NOT A LOCAL COPY. `className="sr-only"` is UNDEFINED in
// this repository, so text using it renders visibly — a defect this codebase
// has already paid for. `visuallyHidden` is the real implementation, and its
// `position: absolute` needs a positioned ancestor; the part card supplies one.
import { visuallyHidden } from '@autoworkshop/ui';
import { addToBasket, readBasket } from './basket';
import { BUTTON_PRIMARY } from './solar-theme';

/**
 * "Add to basket" on a public marketplace card.
 *
 * ⚠️ MOVED HERE FROM `customer-web` ON 2026-08-06, and moved rather than copied.
 * The apex landing (owned by `workshop-web`) now needs the same control, and
 * this repository has three recorded instances of a COPIED FILE CARRYING ITS
 * ORIGIN'S WORKSPACE ID — a bug that works locally, because cookies ignore the
 * PORT, and fails only in production. Neither this component nor `basket.ts`
 * touches a workspace at all (the basket is browser state), so one shared
 * implementation is both correct and the only version that cannot drift.
 * §0.3: no copy-paste; the public surface is the package.
 *
 * ⚠️ THE ONLY CLIENT COMPONENT ON THE PUBLIC LANDING PAGE, and it is one on
 * purpose: a basket has to work for a visitor who has not signed in, because
 * the whole point of 021's public marketplace is that browsing needs no
 * account. Adding to the basket therefore cannot round-trip to a guarded API,
 * and it must not prompt for sign-in — the prompt belongs at checkout, once the
 * visitor has decided they want something.
 *
 * ⚠️ A PART WITH NO PRICE IS NOT ADDABLE, AND SAYS SO INSTEAD OF FAILING LATER.
 * `catalogue.parts.price` is nullable and the card already renders "Price on
 * request" for it. Letting such a part into the basket would produce a checkout
 * that refuses at the last step, after the buyer has typed their address —
 * `OrderService.priceParts` rejects an unpriced part. Refusing here, with the
 * reason visible next to the part, is the same rule enforced where it can still
 * be acted on.
 */
export function AddToBasket({
  partId,
  partName,
  hasPrice,
}: {
  partId: string;
  partName: string;
  hasPrice: boolean;
}) {
  const [inBasket, setInBasket] = useState(0);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    const sync = () => {
      setInBasket(readBasket().find((i) => i.partId === partId)?.quantity ?? 0);
    };
    sync();
    window.addEventListener('aw:basket', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('aw:basket', sync);
      window.removeEventListener('storage', sync);
    };
  }, [partId]);

  if (!hasPrice) {
    return (
      <p style={{ margin: 0, fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
        Contact the supplier for a price before ordering.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: primitive.space[2] }}>
      <button
        type="button"
        onClick={() => {
          addToBasket(partId, 1);
          setAnnounced(true);
        }}
        /*
         * 🔴 WHITE ON GOLD FAILS CONTRAST, AND THE FILE NEXT DOOR ALREADY SAID SO.
         *
         * This was `background: themeVar.actionPrimary` with
         * `color: primitive.color.grey[0]`. Inside the Solar theme — which is
         * where this component always renders —— `--aw-action-primary` is
         * remapped to `SOLAR.gold` (#f59e0b), so those two tokens resolved to
         * white-on-amber at roughly 2:1, against the 4.5:1 axe requires.
         * `solar-theme.tsx`'s own `BUTTON_PRIMARY` carries the warning verbatim:
         * "Solar puts dark text on the gold deliberately: white on #f59e0b
         * fails contrast badly. Do not 'fix' this to white." This button did
         * exactly that, one file away.
         *
         * ⚠️ THE VIOLATION WAS INVISIBLE UNTIL THE SHOP HAD STOCK. It only
         * renders on a part card, so with an unreachable API the landing had no
         * cards, axe found nothing, and the suite reported 138/2 — a clean bill
         * of health measured against an EMPTY SHOPFRONT. That is the same
         * defect as the 24 live browser checks that once passed against a shop
         * with no products in it, this time in the local suite.
         *
         * ⚠️ REUSING `BUTTON_PRIMARY` RATHER THAN HAND-PICKING A DARK INK, so
         * there is ONE definition of "a primary button on this page" and this
         * cannot drift away from it again. Only the size is overridden: the
         * shared style is page-hero sized and this sits inside a card grid.
         */
        style={{
          ...BUTTON_PRIMARY,
          padding: `${primitive.space[1]} ${primitive.space[3]}`,
          fontSize: primitive.fontSize.sm,
          borderRadius: primitive.radius.md,
        }}
      >
        {/* The accessible name carries the PART, because "Add" repeated forty
            times down a grid tells a screen-reader user nothing about which. */}
        Add<span style={visuallyHidden}> {partName} to basket</span>
      </button>

      {inBasket > 0 && (
        <span
          // `role="status"` so the count change is announced without stealing
          // focus — the visitor is still browsing.
          role="status"
          style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}
        >
          {inBasket} in basket
        </span>
      )}
      {announced && inBasket === 0 && (
        <span role="status" style={visuallyHidden}>
          Added to basket
        </span>
      )}
    </div>
  );
}
