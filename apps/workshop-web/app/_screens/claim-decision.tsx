'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { decideClaimAction } from './warranty-actions';

/**
 * Move a warranty claim on.
 *
 * ⚠️ IT APPENDS AN EVENT — there is deliberately no way to edit a past one.
 * `warranty.claim_events` is append-only on UPDATE **and** DELETE, so what is
 * recorded here is permanent, and the form says so before it is sent rather
 * than after.
 *
 * ⚠️ THE REASON IS REQUIRED ON A REJECTION, in the form and again in the
 * service and again as a CHECK constraint. It is the first thing the customer
 * asks, and a rejection nobody has to justify is the shape a workshop's
 * warranty stops meaning anything.
 *
 * ⚠️ THE ROLE CHECK IS NOT HERE. `WarrantyService` decides who may approve or
 * reject — recording a claim is a front-desk act, deciding one commits the
 * workshop to free work. Somebody shown these buttons who may not use them gets
 * the API's own sentence, which names who can AND what they can still do ("you
 * can still record the claim and add notes"). Hiding the buttons would leave
 * them unable to tell whether nobody had decided or whether they simply could
 * not see the control.
 */
export function ClaimDecision({
  claimId,
  status,
  revalidate,
}: {
  claimId: string;
  status: string;
  revalidate: string;
}) {
  const reasonId = useId();
  const [kind, setKind] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What can follow, from here. `submitted` is the opening event and is never
  // offered; `completed` only makes sense once the remedial work is done.
  const options =
    status === 'submitted'
      ? ['assessing', 'approved', 'rejected', 'withdrawn', 'note']
      : status === 'assessing'
        ? ['approved', 'rejected', 'withdrawn', 'note']
        : status === 'approved'
          ? ['completed', 'note']
          : ['note'];

  const control: React.CSSProperties = {
    // Form controls do not inherit the page typeface.
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    padding: '0.375rem 0.625rem',
    borderRadius: '0.375rem',
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  };

  async function send(eventKind: string, why?: string) {
    setBusy(true);
    setError(null);
    const result = await decideClaimAction(claimId, { eventKind, reason: why }, revalidate);
    setBusy(false);
    if (result.ok) {
      setKind(null);
      setReason('');
    } else {
      setError(result.error);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {kind === null ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => {
                // A rejection and a note need words; the rest are one click.
                if (o === 'rejected' || o === 'note') setKind(o);
                else void send(o);
              }}
              style={{ ...control, opacity: busy ? 0.6 : 1 }}
            >
              {o === 'note' ? 'Add a note' : `Mark ${o}`}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (kind === 'rejected' && !reason.trim()) {
              setError('Say why the claim is being rejected — it is kept permanently with it.');
              return;
            }
            void send(kind, reason);
          }}
          style={{ display: 'grid', gap: '0.375rem' }}
        >
          <label htmlFor={reasonId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            {kind === 'rejected' ? (
              <>
                Why the claim is rejected — <strong>required, and permanent</strong>
              </>
            ) : (
              'Note — kept with the claim and cannot be edited'
            )}
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            disabled={busy}
            style={{ ...control, cursor: 'text' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy} style={{ ...control, fontWeight: 600 }}>
              {busy ? 'Recording…' : kind === 'rejected' ? 'Reject the claim' : 'Add the note'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setKind(null);
                setReason('');
                setError(null);
              }}
              style={control}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
