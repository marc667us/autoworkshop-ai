'use client';

import { useEffect, useState } from 'react';
import { basketCount, readBasket } from './basket';

/**
 * "Basket (3)" — the way back to what you picked.
 *
 * 🔴 WITHOUT THIS, "ADD TO BASKET" IS A DEAD END. The button writes to
 * localStorage and, on the public landing, there is no navigation to tell a
 * visitor where their basket went — an anonymous visitor has no app shell at
 * all. Shipping the button without this link would be the same defect class as
 * `POST /job-cards` with no workshop-side caller: a complete mechanism nobody
 * can reach.
 *
 * ⚠️ IT RENDERS NOTHING WHEN THE BASKET IS EMPTY. A permanently-visible "Basket
 * (0)" on a marketing page is clutter that trains people to ignore it; the
 * moment it has something in it, it appears.
 *
 * ⚠️ AND IT MUST NOT RENDER ON THE SERVER. `localStorage` does not exist there,
 * so the first paint has no count. Rendering a 0 and then flipping to 3 is a
 * hydration mismatch AND a lie for one frame — `mounted` gates it instead. This
 * is the same "wait past hydration" property that made a layout sweep report
 * 131px of overflow that did not exist.
 */
export function BasketLink({ href }: { href: string }) {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setCount(basketCount(readBasket()));
    sync();
    // `aw:basket` is same-tab (the storage event does not fire in the tab that
    // wrote), `storage` is other tabs. Both are needed or the count goes stale
    // in exactly one of the two cases.
    window.addEventListener('aw:basket', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('aw:basket', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!mounted || count === 0) return null;

  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '10px 18px',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: 600,
        textDecoration: 'none',
        background: '#f59e0b',
        color: '#1a1207',
      }}
    >
      {/* Text as well as the number — §66 forbids colour or shape alone. */}
      🛒 Basket ({count} {count === 1 ? 'item' : 'items'})
    </a>
  );
}
