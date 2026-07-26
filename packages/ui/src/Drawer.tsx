'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { useFocusTrap, useScrollLock } from './useFocusTrap';
import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Slide-over drawer — `01 (1).txt` §2 "Contextual Drawers or Panels".
 *
 * Two jobs in this shell, which is why it is one component and not two:
 *
 *  1. On mobile, the side navigation stops being a column and becomes an
 *     overlay drawer (`side="left"`).
 *  2. On any viewport, contextual detail opens beside the page without losing
 *     it — the AI assistant, a job-card summary, an approval trail
 *     (`side="right"`). The spec is explicit that the assistant is a side panel
 *     and does NOT replace ordinary navigation (`02.txt` §8), so a drawer over
 *     the page is right and a route change is wrong.
 *
 * MODAL VS NON-MODAL is a real distinction, not a styling flag. The mobile nav
 * drawer is modal: the page behind is unusable, so it traps focus, locks scroll
 * and sets `aria-modal`. A wide-viewport assistant panel is non-modal: the user
 * is expected to read the page and the assistant together, so trapping focus
 * there would be a keyboard trap and a WCAG 2.1.2 failure. `modal` defaults to
 * true because getting it wrong in that direction is merely annoying, whereas
 * a non-trapped modal leaks focus to content the user cannot see.
 */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Labels the drawer for screen readers, and renders as its heading. */
  title: string;
  side?: 'left' | 'right';
  /** See the modal/non-modal note above. */
  modal?: boolean;
  width?: string;
  children: React.ReactNode;
  /** Optional actions rendered in the drawer header, e.g. a "New chat" button. */
  headerActions?: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  modal = true,
  width = '20rem',
  children,
  headerActions,
}: DrawerProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(open && modal, onClose);
  useScrollLock(open && modal);
  const reducedMotion = usePrefersReducedMotion();
  const titleId = React.useId();

  // Escape closes a non-modal drawer too. useFocusTrap owns that key for the
  // modal case; a non-modal drawer has no trap, so it needs its own listener or
  // Escape would silently do nothing.
  //
  // `onClose` goes through a ref for the same reason as in useFocusTrap: callers
  // pass inline arrows, and depending on that identity would rebind this
  // listener on every parent render for no benefit.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open || modal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, modal]);

  if (!open) return null;

  const panel = (
    <div
      ref={trapRef}
      role={modal ? 'dialog' : 'complementary'}
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        width,
        maxWidth: '100vw',
        height: '100%',
        background: themeVar.backgroundPrimary,
        color: themeVar.textPrimary,
        borderLeft: side === 'right' ? `1px solid ${themeVar.borderDefault}` : undefined,
        borderRight: side === 'left' ? `1px solid ${themeVar.borderDefault}` : undefined,
        display: 'flex',
        flexDirection: 'column',
        animation: reducedMotion
          ? undefined
          : `${side === 'right' ? 'aw-slide-in-right' : 'aw-slide-in-left'} 160ms ease-out`,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: primitive.space[3],
          padding: primitive.space[4],
          borderBottom: `1px solid ${themeVar.borderDefault}`,
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: primitive.fontSize.base, fontWeight: 600 }}>
          {title}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: primitive.space[2] }}>
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.lg,
              lineHeight: 1,
              padding: primitive.space[1],
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: primitive.space[4] }}>{children}</div>
    </div>
  );

  if (!modal) {
    // Non-modal: sits in the layout flow beside the page, no scrim.
    return (
      <aside
        style={{
          position: 'sticky',
          top: '3.5rem',
          height: 'calc(100vh - 3.5rem)',
          flexShrink: 0,
        }}
      >
        {panel}
      </aside>
    );
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 190,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
        animation: reducedMotion ? undefined : 'aw-fade-in 120ms ease-out',
      }}
    >
      {panel}
    </div>
  );
}

/**
 * Keyframes for the drawer and dialog.
 *
 * Injected as a plain stylesheet string rather than inline styles because
 * `@keyframes` cannot be expressed inline. The shell renders this once; every
 * animation above is additionally gated on `prefers-reduced-motion`, so these
 * rules are simply unused for users who have asked for stillness.
 */
export const overlayKeyframes = `
@keyframes aw-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aw-slide-in-right { from { transform: translateX(100%) } to { transform: translateX(0) } }
@keyframes aw-slide-in-left { from { transform: translateX(-100%) } to { transform: translateX(0) } }
`;
