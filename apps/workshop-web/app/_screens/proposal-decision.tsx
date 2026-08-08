'use client';

import { useId, useState } from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { applyLeadsAction, decideProposalAction } from './agent-actions';

/**
 * Approve, reject, and then apply an agent proposal.
 *
 * ⚠️ A CLIENT COMPONENT BECAUSE THE OUTCOME MUST BE SHOWN. A plain
 * `<form action={serverAction}>` posts and re-renders, and the API's refusal —
 * "This proposal was already approved", "Only an approved proposal can be
 * applied — this one is rejected" — is thrown away on the way. Those sentences
 * are the entire value of the failure path. Same shape as
 * `RequisitionDecision`, deliberately: one pattern for "decide something and
 * hear back".
 *
 * ⚠️ THE BUTTONS ARE NOT THE RULE, and they are not hidden as if they were.
 * `AgentProposalService.decide` refuses a caller who is not workshop staff and
 * refuses a second decision on the same row with a single conditional UPDATE;
 * `applyApprovedLeads` refuses anything not already `approved`. Hiding these
 * controls from somebody who cannot use them would leave them unable to tell
 * whether nobody had decided or whether they simply cannot see the control —
 * so what is hidden here is only what does not APPLY at this stage, never what
 * a person may not do (CLAUDE.md §8).
 *
 * 🔴 APPROVE AND APPLY ARE TWO PRESSES, AND THAT IS THE PRODUCT, NOT FRICTION.
 * Approving records a human's judgement; applying writes strangers' contact
 * details into `crm.leads`. The API keeps them apart so that what was approved
 * and what is written are the same stored bytes — `applyApprovedLeads` reads
 * the payload from the row, never from this screen. Collapsing them into one
 * button here would not shorten that path, it would only hide it.
 */
export function ProposalDecision({
  proposalId,
  /** The server's status for this row. Decides which controls apply. */
  status,
  /** True for a `lead-discovery` proposal — only those can be applied. */
  applicable,
  /** For the announcement, so a screen reader hears WHICH proposal moved. */
  label,
}: {
  proposalId: string;
  status: string;
  applicable: boolean;
  label: string;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'approving' | 'rejecting' | 'applying'>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Mirrors the server's status once this session has changed it. Written ONLY
  // from a response, never from the click — an optimistic flip would show
  // "approved" for a decision the server refused.
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
    const result = await decideProposalAction(proposalId, decision, note);
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? 'The decision was not recorded.');
      return;
    }
    setLocalStatus(decision);
    setOutcome(
      decision === 'approved'
        ? 'Approved. Nothing has been written yet — press Apply to create the lead records.'
        : 'Rejected. Nothing was changed.',
    );
  }

  async function apply() {
    setBusy('applying');
    setError(null);
    const result = await applyLeadsAction(proposalId);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLocalStatus('applied');
    // 🔴 THE API'S NUMBER, NOT THE COUNT ON SCREEN. `crm.leads` has a unique
    // constraint on (organization_id, organisation_name) with ON CONFLICT DO
    // NOTHING, so an organisation already on the lead list is skipped. Saying
    // "5 leads added" when the API wrote 2 would be a small lie that costs a
    // long search later.
    setOutcome(
      result.leadsCreated === 0
        ? 'No new leads — every organisation in this proposal is already on the lead list.'
        : `${result.leadsCreated} lead${result.leadsCreated === 1 ? '' : 's'} added.`,
    );
  }

  const open = localStatus === 'proposed' || localStatus === 'awaiting-approval';
  const approved = localStatus === 'approved';

  return (
    <div style={{ display: 'grid', gap: primitive.space[2] }}>
      {open ? (
        <>
          <label htmlFor={noteId} style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
            Note — optional, kept with the decision
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
              {busy === 'approving' ? 'Approving…' : 'Approve'}
              {/* The visible label is short because the button sits beside the
                  proposal it decides. The full sentence is for a screen reader,
                  which may reach the button without the heading.
                  ⚠️ `visuallyHidden`, NOT `className="sr-only"` — that class is
                  not defined anywhere in this repository, so the text renders
                  in full and the button reads twice as long on screen. */}
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
        </>
      ) : null}

      {approved && applicable ? (
        <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void apply()}
            style={{ ...control, cursor: 'pointer', fontWeight: 600 }}
          >
            {busy === 'applying' ? 'Writing the leads…' : 'Apply — create the lead records'}
            <span style={visuallyHidden}> for {label}</span>
          </button>
        </div>
      ) : null}

      {approved && !applicable ? (
        // An honest dead end rather than a disabled button with no explanation.
        // Approving a SUPPLIER proposal records the judgement; there is no
        // endpoint that turns it into catalogue rows, because publication to the
        // public catalogue is an administrator's explicit act (migration 024).
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Approved. Suppliers and parts are not written automatically — add them from Parts and
          Suppliers, using the sources listed above.
        </p>
      ) : null}

      {localStatus === 'applied' && outcome === null ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Already applied — the lead records exist.
        </p>
      ) : null}

      {localStatus === 'rejected' && outcome === null ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Rejected — nothing was changed.
        </p>
      ) : null}

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
