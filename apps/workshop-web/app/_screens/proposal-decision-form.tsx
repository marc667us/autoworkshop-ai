'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { recordProposalDecisionAction } from './proposal-actions';
import {
  DECISION_CHANNEL_LABEL,
  DECISION_CHANNEL_ORDER,
  PROPOSAL_OPTION_LABEL,
  formatMoney,
} from './proposal-labels';

/**
 * §7 — record what the customer said.
 *
 * ── THIS FORM IS AN ATTRIBUTION RECORD, NOT A BUTTON ───────────────────────
 *
 * Everywhere else in Phase 5 the person deciding is a signed-in member of staff, so
 * their identity comes from the session and no form asks for it. Here the decider is
 * the CUSTOMER — outside the system, frequently on a telephone (§7 offers voice and
 * video consultation) — so their NAME and the CHANNEL are typed, mandatory, and stored
 * separately from the staff member who captured them.
 *
 * That separation is the point. `decided_by_name` is who agreed; `recorded_by` is who
 * wrote it down. A single "approved by" field would record reception as having
 * authorised the customer's own repair, which is exactly the attribution error an
 * approval record exists to prevent — and the one a workshop needs on the day somebody
 * says they never agreed.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Renders only when the API said `decidable`. The
 * service re-checks the role and the status, and migration 017's CHECK constraints
 * refuse a decided row that names nobody or no channel.
 */
export function ProposalDecisionForm({
  proposalId,
  jobNumber,
  customerName,
  currency,
  recommendedTotal,
  comprehensiveTotal,
}: {
  proposalId: string;
  jobNumber: string;
  customerName: string;
  currency: string;
  recommendedTotal: number;
  comprehensiveTotal: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Which branch of the form is showing. The option selector is only meaningful for an
  // approval, and the reason is only mandatory for the other two — so the form changes
  // shape rather than showing fields that do not apply.
  const [decision, setDecision] = React.useState<'approved' | 'declined' | 'changes_requested'>(
    'approved',
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('decision', decision);
    setPending(decision);
    setError(null);
    try {
      const outcome = await recordProposalDecisionAction(data);
      if (outcome.error) setError(outcome.error);
      // The whole page changes — the proposal becomes immutable and this form
      // disappears — so a refresh rather than a local notice.
      else router.refresh();
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
    } finally {
      setPending(null);
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
        // Positioned containing block — the reason every container in these slices has one.
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
        Record the customer&rsquo;s decision
      </h2>
      <p
        style={{
          margin: `0 0 ${primitive.space[3]} 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        Job {jobNumber} for {customerName}. Once recorded, §424 makes this proposal
        immutable — a material change needs a new version and a new approval.
      </p>

      <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[3] }}>
        <input type="hidden" name="proposalId" value={proposalId} />

        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
          <legend style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary, padding: 0 }}>
            What did the customer decide?
          </legend>
          {(
            [
              ['approved', 'Approved'],
              ['changes_requested', 'Asked for a change, an explanation, or a call back'],
              ['declined', 'Declined'],
            ] as const
          ).map(([value, text]) => (
            <label
              key={value}
              style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}
            >
              <input
                type="radio"
                name="decisionChoice"
                value={value}
                checked={decision === value}
                onChange={() => setDecision(value)}
              />
              {text}
            </label>
          ))}
        </fieldset>

        {decision === 'approved' ? (
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
            <legend style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary, padding: 0 }}>
              Which option did they approve?
            </legend>
            {/* §398-§402's tiers. The PRICE is beside each one, because "recommended"
                and "comprehensive" mean nothing without the figure attached — and this
                is the number an invoice is later checked against. */}
            <label style={radioRow}>
              <input type="radio" name="approvedOption" value="recommended" defaultChecked />
              {PROPOSAL_OPTION_LABEL['recommended']} —{' '}
              <strong>{formatMoney(recommendedTotal, currency)}</strong>
            </label>
            <label style={radioRow}>
              <input
                type="radio"
                name="approvedOption"
                value="comprehensive"
                disabled={comprehensiveTotal === recommendedTotal}
              />
              {PROPOSAL_OPTION_LABEL['comprehensive']} —{' '}
              <strong>{formatMoney(comprehensiveTotal, currency)}</strong>
              {comprehensiveTotal === recommendedTotal ? (
                // Says WHY it is unavailable rather than showing a dead control.
                <span style={{ color: themeVar.textSecondary }}> (no optional extras were quoted)</span>
              ) : null}
            </label>
          </fieldset>
        ) : null}

        <div style={twoUp}>
          <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
            <label htmlFor="decided-by" style={labelStyle}>
              Who decided? *
            </label>
            <input
              id="decided-by"
              name="decidedByName"
              maxLength={300}
              defaultValue={customerName}
              placeholder="The customer, or the person authorised to decide"
              style={input}
            />
          </div>
          <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
            <label htmlFor="decision-channel" style={labelStyle}>
              How did they answer? *
            </label>
            <select id="decision-channel" name="decisionChannel" defaultValue="in_person" style={input}>
              {DECISION_CHANNEL_ORDER.map((c) => (
                <option key={c} value={c}>
                  {DECISION_CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: primitive.space[1] }}>
          <label htmlFor="decision-note" style={labelStyle}>
            {decision === 'approved'
              ? 'Anything they said (optional)'
              : 'What did they ask for? *'}
          </label>
          <textarea
            id="decision-note"
            name="note"
            rows={3}
            maxLength={8000}
            // §7's five "request" actions — modification, explanation, alternative
            // parts, voice call, video call — all arrive as `changes_requested`, and
            // this note is what says which. Hence the placeholder naming them.
            placeholder={
              decision === 'approved'
                ? 'For example: asked us to call before ordering the part.'
                : 'For example: wants an alternative part quoted, or asked for a call back to explain the diagnosis.'
            }
            style={input}
          />
        </div>

        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Your own name is recorded separately as the person who captured this. The name
          above is the customer&rsquo;s.
        </p>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending !== null}
          aria-label={`Record the customer decision for job card ${jobNumber}`}
          style={{
            padding: primitive.space[2],
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
            fontFamily: 'inherit',
            color: primitive.color.grey[0],
            background: pending !== null ? primitive.color.grey[400] : primitive.color.blue[600],
            border: 'none',
            borderRadius: primitive.radius.md,
            cursor: pending !== null ? 'progress' : 'pointer',
            justifySelf: 'start',
          }}
        >
          {pending !== null ? 'Recording…' : 'Record decision'}
        </button>
      </form>
    </section>
  );
}

const labelStyle = {
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  color: themeVar.textPrimary,
};
const radioRow = {
  display: 'flex',
  gap: primitive.space[2],
  alignItems: 'center',
  fontSize: primitive.fontSize.sm,
  color: themeVar.textPrimary,
  flexWrap: 'wrap' as const,
};
const twoUp = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
  gap: primitive.space[2],
  minWidth: 0,
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
