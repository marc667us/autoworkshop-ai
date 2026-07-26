'use client';

import * as React from 'react';

/**
 * Focus management for modal surfaces (dialogs, mobile nav drawer).
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN TWICE. Dialog and Drawer are visually
 * unrelated but have identical focus obligations, and a half-implemented trap is
 * worse than none: focus escapes to the page behind, a screen-reader user is
 * read content they cannot see, and Escape does nothing. Both surfaces use this
 * one implementation so they cannot drift.
 *
 * Obligations implemented here (WCAG 2.1.2 "No Keyboard Trap", 2.4.3 "Focus
 * Order", and the ARIA dialog pattern):
 *
 *  1. On open, move focus INTO the surface.
 *  2. While open, Tab and Shift+Tab cycle within it and cannot reach the page.
 *  3. Escape closes.
 *  4. On close, focus returns to whatever opened it — otherwise focus resets to
 *     the top of the document and a keyboard user loses their place entirely.
 *
 * The tabbable query is recomputed on each Tab rather than cached at open,
 * because dialog content is frequently async: a cached list taken before the
 * content loaded would trap focus on a spinner that no longer exists.
 */

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): React.RefObject<T> {
  // `useRef<T>(null)` rather than `useRef<T | null>(null)`: React 18's types
  // only accept the former as a `ref` prop. The latter widens to
  // `RefObject<T | null>`, which is not assignable to `Ref<T>` and fails at the
  // call site rather than here.
  const ref = React.useRef<T>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  /**
   * `onClose` is held in a ref so it is NOT an effect dependency.
   *
   * Callers naturally write `onClose={() => setOpen(false)}`, which is a new
   * function on every render. With `onClose` in the dependency array, any
   * parent re-render while the surface was open tore the trap down and rebuilt
   * it — and teardown restores focus to the opener, so focus jumped out of the
   * dialog mid-interaction and back to the button behind it. Typing into a
   * dialog field would move focus away as soon as anything above re-rendered.
   *
   * Fixing it here rather than asking every caller to `useCallback` is
   * deliberate: a hook whose correctness depends on callers remembering to
   * memoize is a hook that will be used wrongly.
   */
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    // Remember the opener so focus can be handed back on close.
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(TABBABLE);
      // Fall back to the container itself (it carries tabIndex={-1}) when the
      // surface has no focusable content yet — still better than leaving focus
      // on the page behind.
      (first ?? node).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const el = ref.current;
      if (!el) return;

      const items = Array.from(el.querySelectorAll<HTMLElement>(TABBABLE)).filter(
        // offsetParent is null for display:none — a hidden control must not
        // become an invisible stop in the cycle.
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus. The optional chain matters: the opener may have been
      // unmounted while the dialog was open (e.g. a row action whose row was
      // removed by the very save the dialog performed).
      previouslyFocused.current?.focus?.();
    };
    // `onClose` is intentionally absent — see onCloseRef above. The trap is
    // built once per open, and torn down once on close.
  }, [open]);

  return ref;
}

/**
 * Prevent the page behind a modal surface from scrolling.
 *
 * Restores the previous value rather than hardcoding `''` on cleanup, so two
 * stacked surfaces (a dialog opened from a drawer) do not release the lock when
 * only the inner one closes.
 */
export function useScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
