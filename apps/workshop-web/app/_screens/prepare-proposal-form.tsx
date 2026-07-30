'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { primitive } from '@autoworkshop/design-tokens';
import { prepareProposalAction } from './proposal-actions';

/**
 * "Prepare proposal" — and, on an answered proposal, §424's NEW VERSION.
 *
 * NO FIELDS. §410-§422's content is READ from records that are already frozen — the
 * complaint, the inspection, the confirmed and suspected findings, the plan's tasks and
 * the approved quotation's totals. The only thing a person writes is the narrative, and
 * that belongs on the draft once it exists rather than in a dialog before it does.
 *
 * WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses unless the card is at a
 * proposal stage, the viewer may prepare one, no undecided version is outstanding, and
 * an APPROVED quotation exists to present. It also refuses outright when the current
 * version was APPROVED — replacing an agreement a customer has given is a commercial
 * act that needs a new quotation first, not a button press.
 */
export function PrepareProposalForm({
  jobCardId,
  jobNumber,
  label = 'Prepare proposal',
}: {
  jobCardId: string;
  jobNumber: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const outcome = await prepareProposalAction(new FormData(event.currentTarget));
      if (outcome.error) setError(outcome.error);
      // The row must change from a button to a link into the new draft, which means
      // re-fetching the server component — `revalidatePath` alone does not repaint the
      // page the user is looking at.
      else router.refresh();
    } catch {
      setError('The request could not be completed. No proposal was prepared.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[1] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />
      {error ? (
        // `role="alert"` so the refusal is ANNOUNCED, carrying the API's own sentence —
        // which names §424 where that is the reason.
        <p
          role="alert"
          style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        // `aria-label`, not a hidden span — an attribute has no layout, so it cannot
        // escape a scroll container the way `visuallyHidden` did twice.
        aria-label={pending ? 'Preparing…' : `${label} for job card ${jobNumber}`}
        style={{
          padding: primitive.space[1],
          fontSize: primitive.fontSize.sm,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: primitive.color.grey[0],
          background: pending ? primitive.color.grey[400] : primitive.color.blue[600],
          border: 'none',
          borderRadius: primitive.radius.md,
          cursor: pending ? 'progress' : 'pointer',
        }}
      >
        {pending ? 'Preparing…' : label}
      </button>
    </form>
  );
}
