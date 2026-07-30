'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { primitive } from '@autoworkshop/design-tokens';
import { startTestSessionAction } from './testing-actions';

/**
 * "Start testing" — `07.txt` §34.
 *
 * NO FIELDS. The session is opened against the COMPLETED repair, which the service
 * finds and a trigger insists on — §34 opens "after completing the repair", so there is
 * nothing for a caller to choose.
 *
 * WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses unless a completed repair
 * exists and no session is already open.
 */
export function StartTestSessionForm({
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
      const outcome = await startTestSessionAction(new FormData(event.currentTarget));
      if (outcome.error) setError(outcome.error);
      else router.refresh();
    } catch {
      setError('The request could not be completed. No test session was started.');
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
        aria-label={pending ? 'Starting…' : `Start testing for job card ${jobNumber}`}
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
        {pending ? 'Starting…' : 'Start testing'}
      </button>
    </form>
  );
}
