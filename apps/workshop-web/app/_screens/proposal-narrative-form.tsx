'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { issueProposalAction, recordProposalNarrativeAction } from './proposal-actions';

/**
 * The three things a person writes on a proposal — §418's expected result and §422's
 * risks and uncertainties — and the act of issuing it.
 *
 * ── WHY ONLY THREE FIELDS ──────────────────────────────────────────────────
 *
 * Nine of §410-§422's twelve sections are READ from records that are already frozen:
 * the complaint, the inspection, the confirmed and suspected findings, the planned
 * tasks, the parts, the totals, the time and the warranty. Asking somebody to retype
 * any of them would be inviting the document to disagree with the job it describes.
 *
 * What no other record holds is the part addressed to a person: what this will fix for
 * you, what might still go wrong, and what we do not yet know. Those are the three
 * boxes here.
 *
 * ⚠️ ISSUING FREEZES THE WORDING. That is why the form warns before the button rather
 * than after: once the proposal is with the customer, its content cannot change, and a
 * correction means a new version under §424.
 */
export function ProposalNarrativeForm({
  proposalId,
  jobNumber,
  expectedResult,
  riskAndLimitations,
  uncertainties,
  presentationNote,
  suspectedCount,
}: {
  proposalId: string;
  jobNumber: string;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  presentationNote: string | null;
  /** How many faults remain suspected — see the prompt below. */
  suspectedCount: number;
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action(data);
      if (outcome.error) setError(outcome.error);
      else {
        setNotice(outcome.created ?? 'Saved');
        // `revalidatePath` marks the server cache stale; it does not repaint the page
        // the user is looking at.
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      style={{
        marginTop: primitive.space[6],
        padding: primitive.space[4],
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        maxWidth: '44rem',
        position: 'relative',
      }}
    >
      <h2
        style={{
          margin: `0 0 ${primitive.space[2]} 0`,
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
        }}
      >
        Write the parts addressed to the customer
      </h2>
      <p style={hint}>
        Everything else on this document is read from the inspection, the diagnosis, the
        approved plan and the approved quotation, and cannot be edited here — that is what
        keeps the document and the job in step.
      </p>

      {notice ? (
        <p role="status" style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          data.set('proposalId', proposalId);
          await run('save', recordProposalNarrativeAction, data);
        }}
        style={{ display: 'grid', gap: primitive.space[3] }}
      >
        <Field
          label="What this should achieve (§418) *"
          htmlFor="p-expected"
          note="Required before the proposal can be issued. In plain language: what will be different for the customer once the work is done."
        >
          <textarea
            id="p-expected"
            name="expectedResult"
            rows={3}
            maxLength={8000}
            defaultValue={expectedResult ?? ''}
            placeholder="The misfire will be cleared and the engine warning light will go out."
            style={input}
          />
        </Field>

        <Field
          label="Risks and limitations"
          htmlFor="p-risks"
          note="What might not go to plan, and what this work does not cover."
        >
          <textarea
            id="p-risks"
            name="riskAndLimitations"
            rows={2}
            maxLength={8000}
            defaultValue={riskAndLimitations ?? ''}
            style={input}
          />
        </Field>

        <Field
          label="What remains uncertain (§422)"
          htmlFor="p-uncertainties"
          note={
            suspectedCount > 0
              ? // ⚠️ A PROMPT, NOT A GATE. The document already lists the suspected
                // faults in their own section, so the information reaches the customer
                // either way; this is the place to explain what they MEAN for the price.
                // A hard requirement here would be satisfied with "n/a" and prove nothing.
                `${suspectedCount} fault(s) are still only suspected. Say what that means for this price — for example, that a further charge may follow if the fault is not cleared.`
              : 'Anything the workshop does not yet know that could change the work or the price.'
          }
        >
          <textarea
            id="p-uncertainties"
            name="uncertainties"
            rows={2}
            maxLength={8000}
            defaultValue={uncertainties ?? ''}
            style={input}
          />
        </Field>

        <Field label="Anything else discussed" htmlFor="p-note">
          <textarea
            id="p-note"
            name="presentationNote"
            rows={2}
            maxLength={8000}
            defaultValue={presentationNote ?? ''}
            style={input}
          />
        </Field>

        <p style={hint}>Emptying a box clears it.</p>

        <button type="submit" disabled={busy !== null} style={primary(busy === 'save')}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </form>

      <hr style={{ margin: `${primitive.space[4]} 0`, border: 'none', borderTop: `1px solid ${themeVar.borderDefault}` }} />

      <h3 style={{ margin: `0 0 ${primitive.space[1]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}>
        Issue it to the customer
      </h3>
      <p style={hint}>
        {/* The consequence stated BEFORE the button, not after. */}
        Once issued the wording is frozen — the customer is reading this exact document,
        and a correction means a new version under §424. Save your changes first.
      </p>
      {expectedResult === null ? (
        // Says WHICH rule and what to do, rather than disabling a control in silence.
        <p style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          Write what the work should achieve first. §418 requires it, and a price with no
          promise attached is not a proposal.
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData();
          data.set('proposalId', proposalId);
          await run('issue', issueProposalAction, data);
        }}
      >
        <button
          type="submit"
          disabled={busy !== null || expectedResult === null}
          aria-label={`Issue the proposal for job card ${jobNumber} to the customer`}
          style={primary(busy === 'issue', expectedResult === null)}
        >
          {busy === 'issue' ? 'Issuing…' : 'Issue to customer'}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  note,
  children,
}: {
  label: string;
  htmlFor: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
      {/* A REAL <label>, never `visuallyHidden` — that class is `position: absolute` and
          escapes any ancestor that is not positioned. */}
      <label htmlFor={htmlFor} style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}>
        {label}
      </label>
      {note ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{note}</p>
      ) : null}
      {children}
    </div>
  );
}

const hint = {
  margin: `0 0 ${primitive.space[3]} 0`,
  fontSize: primitive.fontSize.sm,
  color: themeVar.textSecondary,
};

const input = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};

function primary(busy: boolean, blocked = false) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy || blocked ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : blocked ? ('not-allowed' as const) : ('pointer' as const),
    justifySelf: 'start' as const,
  };
}
