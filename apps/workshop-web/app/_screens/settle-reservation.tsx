'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { settleReservationAction } from './parts-actions';

/**
 * Issue or release a held part.
 *
 * ⚠️ ISSUING WRITES A STOCK MOVEMENT IN THE SAME TRANSACTION as settling the
 * reservation, so "issued" can never exist without the stock having actually
 * left the shelf. That pairing is in `PartsService.settleReservation`, not here
 * — a client that had to remember to do both would eventually forget.
 *
 * ⚠️ RELEASING REQUIRES A REASON, in this form and again in the service.
 * Somebody held that part because a job needed it, and a release with no
 * explanation is a job that quietly loses its parts.
 */
export function SettleReservation({
  reservationId,
  revalidate,
  summary,
}: {
  reservationId: string;
  revalidate: string;
  summary: string;
}) {
  const reasonId = useId();
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const control: React.CSSProperties = {
    // Form controls do not inherit the page typeface.
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    padding: '0.375rem 0.625rem',
    borderRadius: '0.375rem',
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
  };

  async function settle(status: 'issued' | 'released', why?: string) {
    setBusy(true);
    setError(null);
    const result = await settleReservationAction(reservationId, status, why, revalidate);
    setBusy(false);
    if (result.ok) setDone(status);
    else setError(result.error);
  }

  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: '0.5rem',
        padding: '0.625rem 0.875rem',
        display: 'grid',
        gap: '0.5rem',
      }}
    >
      <span style={{ fontSize: '0.875rem' }}>{summary}</span>

      {done ? (
        <p role="status" style={{ margin: 0, fontSize: '0.8125rem', color: themeVar.statusSuccess }}>
          {done === 'issued'
            ? 'Issued — the stock has come off the shelf and the ledger says so.'
            : 'Released — the stock is available again.'}
        </p>
      ) : releasing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) {
              setError('Say why it is being released — somebody held it for a job.');
              return;
            }
            void settle('released', reason);
          }}
          style={{ display: 'grid', gap: '0.375rem' }}
        >
          <label htmlFor={reasonId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            Why it is no longer needed — <strong>required</strong>
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            disabled={busy}
            style={control}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy} style={{ ...control, cursor: 'pointer', fontWeight: 600 }}>
              {busy ? 'Releasing…' : 'Release it'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReleasing(false);
                setReason('');
                setError(null);
              }}
              style={{ ...control, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void settle('issued')}
            style={{ ...control, cursor: 'pointer', fontWeight: 600 }}
          >
            {busy ? 'Working…' : 'Issue to the job'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReleasing(true)}
            style={{ ...control, cursor: 'pointer' }}
          >
            Release it
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
