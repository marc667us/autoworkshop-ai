'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { reviewQuotationAction } from './quotation-actions';
import { formatMoney } from './quotation-labels';

/**
 * §5's internal approval — approve, or reject with a reason.
 *
 * ONE FORM, TWO BUTTONS, the decision carried by the button that was pressed:
 * `<button name="decision" value="...">` puts the choice in the submitted data, so
 * there is no hidden state that can disagree with it.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. This renders only when the API said `reviewable`,
 * which already means the viewer holds an APPROVING role — a narrower set than the one
 * that may prepare — and did not submit it. The service re-derives both on the write.
 */
export function QuotationReviewForm({
  quotationId,
  jobNumber,
  submittedByName,
  currency,
  total,
  lineCount,
}: {
  quotationId: string;
  jobNumber: string;
  submittedByName: string | null;
  currency: string;
  total: number;
  lineCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // Read BEFORE any await — React clears the event's fields once the handler yields.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
    const data = new FormData(form);
    // Set explicitly rather than relying on the button making it into `FormData`:
    // defaulting an APPROVAL DECISION to whatever happens to be first would be the
    // worst possible silent fallback.
    data.set('decision', decision);

    setPending(decision);
    setError(null);
    try {
      const outcome = await reviewQuotationAction(data);
      if (outcome.error) setError(outcome.error);
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
        maxWidth: '42rem',
        // Positioned containing block — the reason every container in these slices has
        // one.
        position: 'relative',
      }}
    >
      <h2 style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}>
        Internal approval
      </h2>
      <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        {submittedByName ? `Submitted by ${submittedByName} for ${jobNumber}.` : `Submitted for ${jobNumber}.`}{' '}
        {lineCount} line(s), total <strong>{formatMoney(total, currency)}</strong>. Approving
        commits the business to this price.
      </p>

      <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[2] }}>
        <input type="hidden" name="quotationId" value={quotationId} />
        <label
          htmlFor="quotation-review-note"
          style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}
        >
          Reason — required to reject, optional to approve
        </label>
        <textarea
          id="quotation-review-note"
          name="note"
          rows={3}
          maxLength={8000}
          placeholder="What is wrong with the price, or what to re-check before it goes to the customer."
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
          A decision cannot be undone: a rejected quotation is kept as the record of the
          disagreement, and a revised price is a new quotation.
        </p>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          <button type="submit" name="decision" value="approved" disabled={pending !== null}
            style={btn(pending === 'approved', primitive.color.blue[600])}>
            {pending === 'approved' ? 'Approving…' : 'Approve quotation'}
          </button>
          <button type="submit" name="decision" value="rejected" disabled={pending !== null}
            style={btn(pending === 'rejected', primitive.color.red[700])}>
            {pending === 'rejected' ? 'Rejecting…' : 'Reject quotation'}
          </button>
        </div>
      </form>
    </section>
  );
}

function btn(busy: boolean, background: string) {
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
