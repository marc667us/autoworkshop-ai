import type * as React from 'react';

/**
 * Visually hidden, still announced.
 *
 * ⚠️ EXISTS BECAUSE `className="sr-only"` IS A TRAP IN THIS REPO. That class is
 * a Tailwind/Bootstrap convention and NOTHING here defines it — there is no
 * global stylesheet carrying it. An element given that class is therefore
 * plainly VISIBLE, and the failure is quiet in the worst way: the markup looks
 * correct, the accessibility intent reads correctly, and the screen simply has
 * stray text on it. Caught on the staging board, where every card rendered
 * "Move job card JC-000005 to another stage" as body copy and the column counts
 * came out as "11 job card" (the visible number followed by its own
 * screen-reader description).
 *
 * The technique is the standard clip-rect one, matching what `TopNav` already
 * does inline for its search label — collected here so there is one copy rather
 * than one per call site (Directive §3).
 *
 * NOT `display: none` and NOT `visibility: hidden`: both remove the element from
 * the accessibility tree as well as the page, which defeats the entire purpose.
 */
export const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  // Without this a long hidden string can still force the page to scroll
  // sideways, which is the one symptom that survives being invisible.
  border: 0,
  padding: 0,
  margin: -1,
};
