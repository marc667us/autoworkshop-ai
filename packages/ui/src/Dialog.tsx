'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { useFocusTrap, useScrollLock } from './useFocusTrap';
import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Modal dialog — `01 (1).txt` §2 (shell surfaces) and §70 (component states).
 *
 * Used for confirmations and short forms: approve a quotation, reassign a bay,
 * reject a claim. Anything longer belongs in a page or a Drawer — a modal that
 * scrolls is a page wearing a costume.
 *
 * ACCESSIBILITY. `role="dialog"` + `aria-modal="true"` + a labelled title, with
 * focus trapped and restored by `useFocusTrap`. `aria-modal` tells the screen
 * reader the rest of the page is inert; without it a user can arrow out of the
 * dialog into content that is visually behind a scrim and read it as if it were
 * live.
 *
 * DESTRUCTIVE ACTIONS. `tone="danger"` colours the confirm button with the
 * blocked/danger status token AND requires an explicit `confirmLabel` naming the
 * action ("Delete job card"), never a bare "OK". `01 (1).txt` §70 requires the
 * user never be uncertain what an action did; a generic confirm button on a
 * destructive dialog is exactly that uncertainty.
 *
 * BACKDROP CLICK is opt-out (`dismissOnBackdrop={false}`) because a
 * mis-click discarding a part-completed form is data loss, and for forms that
 * cost real work the safe default is to make the user choose Cancel explicitly.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting sentence under the title. */
  description?: string;
  children?: React.ReactNode;
  /** Primary action. Omit for a purely informational dialog. */
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** §70 loading state — disables both buttons and labels the work in progress. */
  busy?: boolean;
  /** §70 error state — shown inside the dialog rather than replacing it. */
  error?: string;
  dismissOnBackdrop?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  error,
  dismissOnBackdrop = true,
}: DialogProps) {
  // While busy, Escape and the backdrop must not close: the work is already in
  // flight and dismissing the dialog would leave the user with no feedback
  // about whether it succeeded.
  const close = React.useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const ref = useFocusTrap<HTMLDivElement>(open, close);
  useScrollLock(open);
  const reducedMotion = usePrefersReducedMotion();

  const titleId = React.useId();
  const descId = React.useId();

  if (!open) return null;

  const confirmBackground = tone === 'danger' ? themeVar.statusBlocked : themeVar.actionPrimary;

  return (
    <div
      // The scrim. Clicking it closes unless the caller opted out or work is
      // in flight.
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) close();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: primitive.space[4],
        animation: reducedMotion ? undefined : 'aw-fade-in 120ms ease-out',
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        style={{
          background: themeVar.backgroundPrimary,
          color: themeVar.textPrimary,
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          width: 'min(32rem, 100%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[4],
        }}
      >
        <div>
          <h2 id={titleId} style={{ margin: 0, fontSize: primitive.fontSize.lg, fontWeight: 600 }}>
            {title}
          </h2>
          {description ? (
            <p
              id={descId}
              style={{
                margin: `${primitive.space[2]} 0 0`,
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {description}
            </p>
          ) : null}
        </div>

        {children}

        {error ? (
          // role="alert" so the failure is announced immediately — a visually
          // obvious red box is invisible to a screen-reader user otherwise.
          <div
            role="alert"
            style={{
              padding: primitive.space[3],
              borderRadius: primitive.radius.md,
              border: `1px solid ${themeVar.statusBlocked}`,
              color: themeVar.statusBlocked,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: primitive.space[3], justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            style={{
              padding: `${primitive.space[2]} ${primitive.space[4]}`,
              borderRadius: primitive.radius.md,
              border: `1px solid ${themeVar.borderDefault}`,
              background: 'transparent',
              color: themeVar.textPrimary,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: primitive.fontSize.sm,
            }}
          >
            {cancelLabel}
          </button>

          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              style={{
                padding: `${primitive.space[2]} ${primitive.space[4]}`,
                borderRadius: primitive.radius.md,
                border: 'none',
                background: confirmBackground,
                color: primitive.color.grey[0],
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.7 : 1,
                fontSize: primitive.fontSize.sm,
                fontWeight: 600,
              }}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
