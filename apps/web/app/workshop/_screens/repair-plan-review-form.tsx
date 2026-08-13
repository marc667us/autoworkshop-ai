'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { reviewRepairPlanAction } from './repair-plan-actions';
import { formatHours } from './repair-plan-labels';

/**
 * §30-§31's internal technical review — approve, or reject with a reason.
 *
 * ── ONE FORM, TWO BUTTONS, AND THE DECISION CARRIED BY THE BUTTON ───────────
 *
 * The exception to the "one transition per form" rule the rest of this slice follows:
 * approve and reject share a reason field, and splitting them would mean two textareas
 * where a reviewer might type into one and press the other's button.
 * `<button name="decision" value="...">` puts the choice in the submitted data, so
 * which button was pressed IS the decision — there is no hidden state that can
 * disagree with it.
 *
 * ── WHY §31'S FIVE VERBS ARE TWO BUTTONS ───────────────────────────────────
 *
 * §31 offers Approve · Request Additional Test · Modify Plan · Return to Technician ·
 * Escalate to Specialist. Only two are OUTCOMES of the review. "Request additional
 * test" and "return to technician" are a rejection whose REASON says which — which is
 * why the reason field is mandatory for a rejection and why its placeholder names
 * them. "Modify plan" is a rejection followed by a new attempt: a supervisor editing
 * the technician's plan in place would destroy the distinction between what was
 * proposed and what was approved, which is the thing this review exists to record.
 * "Escalate to specialist" is a job-card stage change, already built in slice 2.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. This component renders only when the API said
 * `reviewable`, which already means the viewer holds a reviewing role AND did not
 * submit the plan. The service re-derives both on the write; anyone can call the
 * server action directly (CLAUDE.md §8).
 */
export function RepairPlanReviewForm({
  planId,
  jobNumber,
  submittedByName,
  taskCount,
  totalEstimatedLabourHours,
  unaddressedFaultCount,
  partCount,
}: {
  planId: string;
  jobNumber: string;
  submittedByName: string | null;
  taskCount: number;
  totalEstimatedLabourHours: number;
  unaddressedFaultCount: number;
  partCount: number;
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
      const outcome = await reviewRepairPlanAction(data);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        // The whole page changes — the plan becomes settled and this form disappears —
        // so a refresh rather than a local notice.
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
        // No background of its own. The inputs inside use `surfaceRaised`, and a raised
        // panel holding raised fields leaves the two indistinguishable in both themes.
        maxWidth: '42rem',
        // Positioned containing block, for the reason recorded on every other container
        // in this slice.
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
        Internal technical review
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
        {taskCount} task(s), {formatHours(totalEstimatedLabourHours)} of labour and{' '}
        {partCount} part(s) — the quotation is priced from these.
      </p>

      {/* ⚠️ THE ONE THING A REVIEWER MUST NOT MISS. The service REPORTS unaddressed
          confirmed faults rather than refusing submission, because a plan legitimately
          covers a subset and a hard gate would push technicians into writing fake tasks
          to get past it. That trade only holds if the number is put in front of the
          person deciding — so it is an alert here, not a footnote. */}
      {unaddressedFaultCount > 0 ? (
        <p
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            padding: primitive.space[2],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {unaddressedFaultCount} confirmed fault(s) from the approved diagnosis have no
          task on this plan. That can be deliberate — a staged repair, or work the
          customer will take elsewhere — but nothing on the plan says so. Ask before
          approving.
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[2] }}>
        <input type="hidden" name="planId" value={planId} />

        <label
          htmlFor="plan-review-note"
          style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}
        >
          Reason — required to reject, optional to approve
        </label>
        <textarea
          id="plan-review-note"
          name="note"
          rows={3}
          maxLength={8000}
          // The placeholder is where §31's other three verbs live — see the header note.
          placeholder="What must change: a test to add, work to remove, or what to return to the technician for."
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
          {/* States the consequence before either button is pressed. Neither decision can
              be undone, and a reviewer should know that before choosing. */}
          A decision cannot be undone: a rejected plan is kept as the record of the
          disagreement rather than reopened, and a revised proposal is a new attempt.
          Approving passes the plan to quotation preparation.
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
            {pending === 'approved' ? 'Approving…' : 'Approve plan'}
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            disabled={pending !== null}
            style={decisionButton(pending === 'rejected', primitive.color.red[700])}
          >
            {pending === 'rejected' ? 'Rejecting…' : 'Reject plan'}
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
