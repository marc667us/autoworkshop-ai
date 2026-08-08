'use client';

import { useId, useState } from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { setLeadStatusAction } from './agent-actions';

/** Migration 064's CHECK constraint, and the order a lead usually travels in. */
const STATUSES = ['new', 'qualified', 'contacted', 'converted', 'rejected'] as const;
export type LeadStatus = (typeof STATUSES)[number];

const HELP: Record<LeadStatus, string> = {
  new: 'Nobody has looked at this yet.',
  qualified: 'Worth approaching — somebody checked it.',
  contacted: 'Somebody has been in touch. Nothing here sends anything.',
  converted: 'Now a customer of the workshop.',
  rejected: 'Not worth approaching. The row stays, so it is not found again.',
};

/**
 * Move one lead along the pipeline.
 *
 * ⚠️ A CLIENT COMPONENT so the API's refusal survives. Same reason as
 * `ProposalDecision`: a plain `<form action={serverAction}>` re-renders and
 * throws the message away, and "The lead pipeline is available to the workshop
 * owner, a manager or a platform administrator" is the whole value of that path.
 *
 * ⚠️ EVERY STATUS IS OFFERED, INCLUDING GOING BACKWARDS. A forward-only select
 * turns a mis-click into a one-way door — the shape this repository already
 * shipped once when `assigned_technician_id` was write-once and "leave
 * unassigned" could not be undone. The audit trail records each move, so the
 * history survives even though the column holds only the latest value.
 *
 * ⚠️ `select` + explicit Save, NOT save-on-change. A keyboard user moving
 * through the options with arrow keys fires `change` on every one they pass, so
 * an auto-saving select would record `qualified`, `contacted` and `converted`
 * on the way to `rejected` — three outreach claims that never happened, in the
 * audit trail, from one keystroke.
 */
export function LeadStatusControl({
  leadId,
  status,
  /** The organisation's name, so a screen reader hears WHICH lead moved. */
  label,
}: {
  leadId: string;
  status: LeadStatus;
  label: string;
}) {
  const selectId = useId();
  const [chosen, setChosen] = useState<LeadStatus>(status);
  // The server's value, updated only from a response. `chosen` may differ while
  // the person is deciding; this is what is actually stored.
  const [saved, setSaved] = useState<LeadStatus>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const control: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: primitive.fontSize.sm,
    padding: `${primitive.space[1]} ${primitive.space[2]}`,
    borderRadius: primitive.radius.md,
    border: `1px solid ${themeVar.borderDefault}`,
    background: 'transparent',
    color: 'inherit',
  };

  async function save() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    const result = await setLeadStatusAction(leadId, chosen);
    setBusy(false);
    if (!result.ok) {
      // 🔴 PUT THE SELECT BACK. Leaving it showing the value the server refused
      // is a screen that disagrees with the database and looks like it worked.
      setChosen(saved);
      setError(result.error ?? 'The lead was not updated.');
      return;
    }
    setSaved(chosen);
    setOutcome(`Saved — ${chosen}.`);
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[1] }}>
      <label htmlFor={selectId} style={visuallyHidden}>
        Status for {label}
      </label>
      <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          id={selectId}
          value={chosen}
          disabled={busy}
          onChange={(e) => setChosen(e.target.value as LeadStatus)}
          style={control}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {chosen !== saved ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            style={{ ...control, cursor: 'pointer', fontWeight: 600 }}
          >
            {busy ? 'Saving…' : 'Save'}
            <span style={visuallyHidden}> the status of {label}</span>
          </button>
        ) : null}
      </div>
      <p style={{ margin: 0, fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
        {HELP[chosen]}
      </p>
      {outcome ? (
        <p role="status" style={{ margin: 0, fontSize: primitive.fontSize.xs, color: themeVar.statusSuccess }}>
          {outcome}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.xs, color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
