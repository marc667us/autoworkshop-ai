'use client';

import { useId, useState } from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { decideRegistrationAction } from './registration-actions';

/** The three states migration 069's CHECK constraint permits. */
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

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
  // 🔴 THE UNION, NOT `string`. It was `string`, and that is what let
  // `localStatus` be handed to an action expecting the union — the compiler
  // caught it only once the value started travelling to the server. A screen
  // that types a server enum as `string` will eventually send it one.
  status: RegistrationStatus;
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
    // The status THIS SCREEN was showing. The API pins its UPDATE to it, so a
    // colleague who decided while this page was open produces a clear "it moved,
    // reload" rather than a silent overwrite.
    const result = await decideRegistrationAction(registrationId, decision, note, localStatus);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setLocalStatus(decision);
    setOutcome(result.message);
  }

  /**
   * 🔴 A DECIDED REGISTRATION CAN BE RE-DECIDED, AND IT COULD NOT BE.
   *
   * The first version returned a bare sentence and NO CONTROLS once the status
   * left `pending` — while `OrganizationRegistrationService`'s own header
   * promised "un-publishing on a re-rejection IS handled, because an approval
   * that is later reversed must actually take the listing down". That path
   * existed in the API and was unreachable by clicking, so an approval given in
   * error could only be withdrawn from a database console. Supervisor,
   * 2026-08-09 — the same "a rule whose escape hatch is unreachable is a wall"
   * shape this repository has recorded before.
   *
   * ⚠️ THE REVERSAL IS DELIBERATELY QUIETER THAN THE FIRST DECISION: the state
   * is stated plainly and the controls sit under a disclosure, so the common
   * case (reading a decided row) is not cluttered by the rare one, and nobody
   * flips a live listing by reflex.
   */
  const decided = localStatus !== 'pending';

  return (
    <div style={{ display: 'grid', gap: primitive.space[2] }}>
      {decided ? (
        <>
          <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
            {outcome ?? `Already ${localStatus}.`}
          </p>
          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: primitive.fontSize.xs,
                color: themeVar.textSecondary,
              }}
            >
              {localStatus === 'approved'
                ? 'Withdraw this approval'
                : 'Reconsider this rejection'}
            </summary>
            <p
              style={{
                margin: `${primitive.space[2]} 0`,
                fontSize: primitive.fontSize.xs,
                color: themeVar.textSecondary,
              }}
            >
              {localStatus === 'approved'
                ? 'Rejecting now takes the public listing straight back down.'
                : 'Approving now publishes the business.'}
            </p>
          </details>
        </>
      ) : null}
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
          {busy === 'approving'
            ? 'Approving…'
            : decided
              ? 'Approve and publish instead'
              : 'Approve and publish'}
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
          {busy === 'rejecting' ? 'Rejecting…' : decided ? 'Reject and unpublish' : 'Reject'}
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
