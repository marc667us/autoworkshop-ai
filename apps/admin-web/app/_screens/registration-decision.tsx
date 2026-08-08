'use client';

import { useId, useState } from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { decideRegistrationAction } from './registration-actions';

/**
 * Approve or reject one registration.
 *
 * ⚠️ A CLIENT COMPONENT SO THE API'S REFUSAL SURVIVES. A plain
 * `<form action={serverAction}>` posts and re-renders, throwing the message
 * away — and the useful sentences here are exactly the refusals: "Say why it
 * was rejected", "a colleague may have decided it already". Same shape as
 * `ProposalDecision` in workshop-web, deliberately: one pattern in this
 * repository for "decide something and hear back".
 *
 * 🔴 THE NOTE FIELD IS ALWAYS VISIBLE, not revealed by pressing Reject. A
 * reviewer types their reasoning while reading the evidence, not after the
 * interface has already asked them to commit — and a field that appears on
 * click is one an approving reviewer never learns exists, so an approval with
 * useful context becomes impossible in practice.
 */
export function RegistrationDecision({
  registrationId,
  status,
  /** The business's name, so a screen reader hears WHICH one moved. */
  label,
}: {
  registrationId: string;
  status: string;
  label: string;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'approving' | 'rejecting'>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Mirrors the server's status once this session has changed it. Written ONLY
  // from a response — an optimistic flip would show "approved" for a decision
  // the server refused.
  const [localStatus, setLocalStatus] = useState(status);

  const control: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: primitive.fontSize.sm,
    padding: `${primitive.space[2]} ${primitive.space[3]}`,
    borderRadius: primitive.radius.md,
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
  };

  async function decide(decision: 'approved' | 'rejected') {
    setBusy(decision === 'approved' ? 'approving' : 'rejecting');
    setError(null);
    const result = await decideRegistrationAction(registrationId, decision, note);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setLocalStatus(decision);
    setOutcome(result.message);
  }

  if (localStatus !== 'pending') {
    return (
      <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {outcome ?? `Already ${localStatus}.`}
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[2] }}>
      <label htmlFor={noteId} style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
        Reason — required to reject, kept with the decision
      </label>
      <input
        id={noteId}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        disabled={busy !== null}
        style={{ ...control, maxWidth: '28rem' }}
      />
      <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide('approved')}
          style={{ ...control, cursor: 'pointer', fontWeight: 600 }}
        >
          {busy === 'approving' ? 'Approving…' : 'Approve and publish'}
          {/* ⚠️ `visuallyHidden`, NOT `className="sr-only"` — that class is not
              defined anywhere in this repository, so the text would render in
              full and the button would read twice as long on screen. */}
          <span style={visuallyHidden}> {label}</span>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide('rejected')}
          style={{ ...control, cursor: 'pointer' }}
        >
          {busy === 'rejecting' ? 'Rejecting…' : 'Reject'}
          <span style={visuallyHidden}> {label}</span>
        </button>
      </div>
      {outcome ? (
        <p role="status" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.statusSuccess }}>
          {outcome}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
