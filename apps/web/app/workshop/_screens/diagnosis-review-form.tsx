'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { reviewDiagnosisAction } from './diagnosis-actions';

/**
 * §1292's supervisor review — approve, or reject with a reason.
 *
 * ── ONE FORM, TWO BUTTONS, AND THE DECISION CARRIED BY THE BUTTON ───────────
 *
 * The exception to the "one transition per form" rule the rest of this slice
 * follows, and deliberately so: approve and reject share a reason field, and
 * splitting them would mean two textareas where a reviewer might type into one and
 * press the other's button. `<button name="decision" value="...">` puts the choice in
 * the submitted data, so which button was pressed IS the decision — there is no
 * hidden state that can disagree with it.
 *
 * `type="submit"` on both with `formNoValidate` left off: the reason field is only
 * required for a rejection, so that rule cannot live in `required`. It is enforced in
 * the action, in the service, and by a CHECK constraint in migration 012 — three
 * layers, because a rejection nobody can act on is the failure mode.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. This component renders only when the API said
 * `reviewable`, which already means the viewer holds a reviewing role AND did not
 * submit the diagnosis. The service re-derives both on the write; anyone can call the
 * server action directly (CLAUDE.md §8).
 */
export function DiagnosisReviewForm({
  diagnosisId,
  jobNumber,
  submittedByName,
  confirmedCount,
}: {
  diagnosisId: string;
  jobNumber: string;
  submittedByName: string | null;
  confirmedCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // `submitter` is what carries the decision — see the header note. Read before any
    // await, because React clears the event's fields after the handler yields.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';

    const data = new FormData(form);
    // Set explicitly rather than relying on the button's own name/value making it into
    // `FormData`: it does for a real submit, but this handler also has to work when a
    // test or the keyboard triggers submission without a submitter, and defaulting a
    // REVIEW DECISION to whatever happens to be first would be the worst possible
    // silent fallback.
    data.set('decision', decision);

    setPending(decision);
    setError(null);
    try {
      const outcome = await reviewDiagnosisAction(data);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        // The whole page changes — the record becomes settled and this form
        // disappears — so a refresh rather than a local notice.
        router.refresh();
      }
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
        // No background of its own. The inputs inside use `surfaceRaised`, and a
        // raised panel holding raised fields leaves the two indistinguishable in both
        // themes — the border is what separates this section from the record above it.
        maxWidth: '42rem',
        // Positioned containing block, for the reason recorded on every other
        // container in this slice.
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
        Supervisor review
      </h2>

      <p
        style={{
          margin: `0 0 ${primitive.space[3]} 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {submittedByName
          ? `Submitted by ${submittedByName} for job card ${jobNumber}.`
          : `Submitted for job card ${jobNumber}.`}{' '}
        {confirmedCount === 0
          ? // Worth saying out loud. A diagnosis with no confirmed fault is legitimate
            // — §1290 allows suspected faults, that is what further testing is for —
            // but it means no repair can yet be quoted from it, and a reviewer
            // approving without noticing that is approving something incomplete.
            'No fault has been confirmed yet, so nothing here can be quoted as a repair.'
          : `${confirmedCount} confirmed fault(s) — the repair plan and quotation will be built from these.`}
      </p>

      <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[2] }}>
        <input type="hidden" name="diagnosisId" value={diagnosisId} />

        <label
          htmlFor="review-note"
          style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}
        >
          Reason — required to reject, optional to approve
        </label>
        <textarea
          id="review-note"
          name="note"
          rows={3}
          maxLength={8000}
          placeholder="What is wrong with the diagnosis, or what the technician should test next."
          style={{
            width: '100%',
            padding: primitive.space[2],
            fontSize: primitive.fontSize.sm,
            fontFamily: 'inherit',
            color: themeVar.textPrimary,
            background: themeVar.surfaceRaised,
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.md,
          }}
        />
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          {/* States the consequence before either button is pressed. Neither decision
              can be undone — §1292's record is kept, not reopened — and a reviewer
              should know that before choosing. */}
          A decision cannot be undone: a rejected diagnosis is kept as the record of the
          disagreement rather than reopened, and a further opinion is a new attempt.
        </p>

        {error ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          <button
            type="submit"
            name="decision"
            value="approved"
            disabled={pending !== null}
            style={decisionButton(pending === 'approved', primitive.color.blue[600])}
          >
            {pending === 'approved' ? 'Approving…' : 'Approve diagnosis'}
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            disabled={pending !== null}
            style={decisionButton(pending === 'rejected', primitive.color.red[700])}
          >
            {pending === 'rejected' ? 'Rejecting…' : 'Reject diagnosis'}
          </button>
        </div>
      </form>
    </section>
  );
}

function decisionButton(busy: boolean, background: string) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy ? primitive.color.grey[400] : background,
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}
