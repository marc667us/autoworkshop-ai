'use client';

import { useState, useTransition } from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { setOrderStatusAction, setTrackingAction } from './supplier-orders-actions';

/**
 * The controls on one order in the supplier inbox.
 *
 * ⚠️ ONLY THE TRANSITIONS THAT ARE LEGAL FROM THE CURRENT STATUS ARE OFFERED,
 * and the rule is mirrored from `order-rules.ts` rather than re-invented:
 * placed → confirmed | cancelled, confirmed → dispatched | cancelled,
 * dispatched → delivered, and delivered/cancelled are terminal.
 *
 * This is a CONVENIENCE, not a control. `canTransition` re-checks on the
 * server and the database's own CHECK constraints re-check under that, so a
 * button that should not exist is refused twice more even if this file is
 * wrong. What offering only the legal ones buys is that the supplier is never
 * shown a button whose only outcome is an error — the same reason the buyer's
 * refusals name a reachable alternative.
 *
 * ⚠️ A TERMINAL ORDER GETS A SENTENCE, NOT AN EMPTY SPACE. A card with no
 * controls and no explanation reads as broken.
 */
export function OrderControls({
  orderId,
  status,
  trackingReference,
}: {
  orderId: string;
  status: string;
  trackingReference: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [tracking, setTracking] = useState(trackingReference ?? '');

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
    });
  }

  if (status === 'delivered' || status === 'cancelled') {
    return (
      <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {status === 'delivered'
          ? 'This order is complete. If something was wrong with it, the customer raises a return — that keeps the record that it was delivered.'
          : 'This order was cancelled. Its history is kept on the order.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[2] }}>
      <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'placed' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setOrderStatusAction(orderId, 'confirmed'))}
            style={button(!pending)}
          >
            Confirm
          </button>
        )}

        {status === 'confirmed' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setOrderStatusAction(orderId, 'dispatched'))}
            style={button(!pending)}
          >
            Mark dispatched
          </button>
        )}

        {status === 'dispatched' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setOrderStatusAction(orderId, 'delivered'))}
            style={button(!pending)}
          >
            Mark delivered
          </button>
        )}

        {/* Cancellation stays available while the goods have not moved. Past
            dispatch the resolution is a return, which is the buyer's to raise. */}
        {(status === 'placed' || status === 'confirmed') && (
          <button type="button" onClick={() => setShowCancel((v) => !v)} style={linkButton}>
            {showCancel ? 'Keep order' : 'Cannot supply'}
          </button>
        )}
      </div>

      {showCancel && (
        <div style={{ display: 'grid', gap: primitive.space[2] }}>
          <label style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
            {/* The schema refuses a cancellation with no reason
                (`ck_order_cancelled_reason`), and the customer sees this. */}
            Why can you not supply this? The customer will see it.
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Out of stock until Friday"
              style={field}
            />
          </label>
          <button
            type="button"
            disabled={pending || reason.trim() === ''}
            onClick={() => run(() => setOrderStatusAction(orderId, 'cancelled', reason.trim()))}
            style={button(!pending && reason.trim() !== '')}
          >
            Cancel this order
          </button>
        </div>
      )}

      {/* Tracking is available from dispatch onward AND after it, so a mistyped
          waybill can be corrected without re-dispatching. Its own endpoint —
          see supplier-orders-actions.ts for why that matters. */}
      {(status === 'confirmed' || status === 'dispatched') && (
        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flex: '1 1 16rem' }}>
            <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary, whiteSpace: 'nowrap' }}>
              Tracking
            </span>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Waybill, driver, rider's phone — whatever you use"
              style={{ ...field, flex: 1 }}
            />
          </label>
          <button
            type="button"
            disabled={pending || tracking.trim() === ''}
            onClick={() => run(() => setTrackingAction(orderId, tracking, ''))}
            style={button(!pending && tracking.trim() !== '')}
          >
            Save
          </button>
        </div>
      )}

      {message && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: primitive.fontSize.sm,
            color: message.ok ? themeVar.statusSuccess : themeVar.statusDanger,
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

const field: React.CSSProperties = {
  padding: primitive.space[2],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
  font: 'inherit',
  minWidth: 0,
};

const linkButton: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  color: themeVar.textSecondary,
  textDecoration: 'underline',
  cursor: 'pointer',
  font: 'inherit',
};

function button(enabled: boolean): React.CSSProperties {
  return {
    padding: `${primitive.space[2]} ${primitive.space[4]}`,
    borderRadius: primitive.radius.md,
    border: 0,
    background: enabled ? themeVar.actionPrimary : themeVar.borderDefault,
    color: enabled ? primitive.color.grey[0] : themeVar.textSecondary,
    cursor: enabled ? 'pointer' : 'not-allowed',
    font: 'inherit',
    fontWeight: 600,
  };
}
