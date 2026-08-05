'use client';

import { useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { markThreadReadAction } from './comms-actions';

/**
 * Mark every message in this thread as read BY ME.
 *
 * 🔴 A DELIBERATE ACT, NOT A SIDE EFFECT OF RENDERING. Marking on load would
 * clear the badge for somebody who opened the page by mistake, and — worse —
 * would do it on every prefetch. The receipt is per person, so my clearing it
 * changes nothing for anyone else in the thread (verify/046 check 6).
 *
 * Idempotent in the service via `ON CONFLICT DO NOTHING`, so a double click is
 * not a second reading and this needs no guard of its own.
 */
export function MarkThreadRead({
  threadId,
  unreadCount,
}: {
  threadId: string;
  unreadCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (unreadCount === 0 && !done) {
    return (
      <p style={{ margin: '1rem 0', fontSize: '0.875rem', color: themeVar.textSecondary }}>
        You have read everything in this conversation.
      </p>
    );
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      <button
        type="button"
        disabled={busy || done}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await markThreadReadAction(threadId);
          setBusy(false);
          if (result.ok) setDone(true);
          else setError(result.error ?? 'Could not mark as read.');
        }}
        style={{
          fontFamily: 'inherit',
          fontSize: '0.875rem',
          padding: '0.5rem 0.875rem',
          borderRadius: '0.375rem',
          border: `1px solid ${themeVar.borderDefault}`,
          background: 'transparent',
          color: 'inherit',
          cursor: busy || done ? 'default' : 'pointer',
        }}
      >
        {/* The label carries the state, never the colour alone (§66). */}
        {busy ? 'Marking…' : done ? 'Marked as read' : `Mark ${unreadCount} as read`}
      </button>
      {error ? (
        <p role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
