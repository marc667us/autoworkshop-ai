'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { decideRequisitionAction } from './parts-actions';

/**
 * Approve, reject or cancel a parts requisition.
 *
 * ⚠️ A REJECTION NEEDS A REASON, here and again in the service. Somebody asked
 * for that part because a job needs it; a rejection with no explanation leaves
 * the technician to guess whether to ask again, buy it themselves, or tell the
 * customer the work cannot be done.
 *
 * ⚠️ THE ROLE CHECK IS NOT HERE. `PartsService.assertMayMove` decides, and its
 * refusal names what the person CAN still do ("you can still raise a requisition
 * for what you need"). Hiding these buttons would leave a reader unable to tell
 * whether nobody had decided or whether they simply cannot see the control.
 */
export function RequisitionDecision({
  requisitionId,
  revalidate,
  summary,
}: {
  requisitionId: string;
  revalidate: string;
  summary: string;
}) {
  const reasonId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const control: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    padding: '0.375rem 0.625rem',
    borderRadius: '0.375rem',
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
  };

  async function decide(status: 'approved' | 'rejected' | 'cancelled', why?: string) {
    setBusy(true);
    setError(null);
    const result = await decideRequisitionAction(requisitionId, status, why, revalidate);
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
          Recorded as {done}.
        </p>
      ) : rejecting ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) {
              setError('Say why — the person who asked needs to know what to do next.');
              return;
            }
            void decide('rejected', reason);
          }}
          style={{ display: 'grid', gap: '0.375rem' }}
        >
          <label htmlFor={reasonId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            Why it is being rejected — <strong>required</strong>
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
              {busy ? 'Recording…' : 'Reject it'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRejecting(false);
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
            onClick={() => void decide('approved')}
            style={{ ...control, cursor: 'pointer', fontWeight: 600 }}
          >
            {busy ? 'Working…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            style={{ ...control, cursor: 'pointer' }}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('cancelled')}
            style={{ ...control, cursor: 'pointer' }}
          >
            Cancel the request
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
