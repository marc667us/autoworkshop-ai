'use client';

import * as React from 'react';
import { breakpoint } from '@autoworkshop/design-tokens';

/**
 * Viewport queries for the responsive shell (`01 (1).txt` §68).
 *
 * WHY A HOOK RATHER THAN CSS MEDIA QUERIES ALONE. Most responsive work belongs
 * in CSS, and stays there. But the shell has to change *structure*, not just
 * style: on mobile the side navigation stops being a persistent column and
 * becomes an overlay drawer with a focus trap and an aria-modal. That is a
 * different component tree, not a different width, and CSS cannot express it.
 *
 * SSR SAFETY. `matchMedia` does not exist on the server. The hook therefore
 * starts as `false` on both server and first client render, and only updates
 * after mount. Returning the real value during the initial client render would
 * make the client tree disagree with the server tree and produce a hydration
 * mismatch — React would discard the server HTML and re-render, which is the
 * blank-flash class of bug this shell already paid for once.
 *
 * The consequence is deliberate and worth stating: the first paint is always
 * the desktop layout, corrected within a frame. Mobile users see one frame of
 * desktop shell rather than a hydration error, which is the better trade.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Below tablet-portrait (768px) the side navigation becomes an overlay drawer.
 *
 * The threshold is `breakpoint.tabletPortrait` from the design tokens rather
 * than a literal, so the shell and the stylesheets cannot drift apart.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${parseInt(breakpoint.tabletPortrait, 10) - 1}px)`);
}

/** Tablet: nav collapses to icons, contextual panels overlay rather than sit alongside. */
export function useIsTabletOrBelow(): boolean {
  return useMediaQuery(`(max-width: ${parseInt(breakpoint.tabletLandscape, 10) - 1}px)`);
}

/**
 * Honour `prefers-reduced-motion` (WCAG 2.3.3).
 *
 * The drawer and dialog both animate. A vestibular-disorder trigger is a real
 * accessibility failure, not a polish item, so every transition in this package
 * checks this before animating.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
