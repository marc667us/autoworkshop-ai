'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { primitive } from '@autoworkshop/design-tokens';
import { startRepairAction } from './execution-actions';

/**
 * "Start Repair" — `07.txt` §3.
 *
 * ONE OPTIONAL FIELD, the service bay, because §33 links time to a bay and asking once
 * here saves asking on every entry. Everything else is read from the approved plan.
 *
 * WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses unless the card is at
 * `authorized_to_start` or `repair_in_progress`, the viewer may carry out repairs, no
 * repair is already open, and an APPROVED CUSTOMER PROPOSAL exists — §7 says work shall
 * not start until the required approval is received, and that is a foreign key here,
 * not a checkbox.
 */
export function StartRepairForm({
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
      const outcome = await startRepairAction(new FormData(event.currentTarget));
      if (outcome.error) setError(outcome.error);
      else router.refresh();
    } catch {
      setError('The request could not be completed. No repair was started.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[1] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-label={pending ? 'Starting…' : `Start the repair for job card ${jobNumber}`}
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
        {pending ? 'Starting…' : 'Start repair'}
      </button>
    </form>
  );
}
