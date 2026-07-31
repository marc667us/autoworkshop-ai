'use client';

import { useEffect, useState } from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
// ⚠️ THE SHARED ONE, NOT A LOCAL COPY. `className="sr-only"` is UNDEFINED in
// this repository, so text using it renders visibly — a defect this codebase
// has already paid for. `visuallyHidden` is the real implementation, and its
// `position: absolute` needs a positioned ancestor; the part card supplies one.
import { visuallyHidden } from '@autoworkshop/ui';
import { addToBasket, readBasket } from '../_screens/basket';

/**
 * "Add to basket" on a public marketplace card.
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
        style={{
          padding: `${primitive.space[1]} ${primitive.space[3]}`,
          borderRadius: primitive.radius.md,
          border: 'none',
          background: themeVar.actionPrimary,
          color: primitive.color.grey[0],
          fontWeight: 700,
          fontSize: primitive.fontSize.sm,
          cursor: 'pointer',
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
