'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { primitive } from '@autoworkshop/design-tokens';
import { prepareQuotationAction } from './quotation-actions';

/**
 * "Prepare quotation" — `07.txt` §10 + §3.
 *
 * NO FIELDS, and here that is more than a convention: §3 says the system GENERATES the
 * draft from the approved plan. A form with price boxes would invite an advisor to type
 * figures that disagree with the plan the customer is being charged for, which is the
 * single most likely source of a wrong invoice.
 *
 * WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses unless the card is at
 * `quotation_preparation`, the viewer may prepare quotations, no unsettled quotation
 * exists, and an APPROVED repair plan is there to price.
 */
export function PrepareQuotationForm({
  jobCardId,
  jobNumber,
}: {
  jobCardId: string;
  jobNumber: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const outcome = await prepareQuotationAction(new FormData(event.currentTarget));
      if (outcome.error) setError(outcome.error);
      // The row must change from a button to a link into the new draft, which means
      // re-fetching the server component. `revalidatePath` alone does not repaint a
      // page the user is already looking at.
      else router.refresh();
    } catch {
      setError('The request could not be completed. No quotation was prepared.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[1] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />
      {error ? (
        // `role="alert"` so the refusal is ANNOUNCED, carrying the API's own sentence —
        // which names the stage the card is at, or says no approved plan exists and
        // where to get one approved.
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        // `aria-label`, not a hidden span: an attribute has no layout, so it cannot
        // escape a scroll container the way `visuallyHidden` did twice.
        aria-label={pending ? 'Preparing…' : `Prepare a quotation for job card ${jobNumber}`}
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
        {pending ? 'Preparing…' : 'Prepare quotation'}
      </button>
    </form>
  );
}
