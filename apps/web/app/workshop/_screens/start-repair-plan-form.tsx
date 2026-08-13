'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { primitive } from '@autoworkshop/design-tokens';
import { startRepairPlanAction } from './repair-plan-actions';

/**
 * "Plan Repair" — `07.txt` §24.
 *
 * ⚠️ NO FIELDS, DELIBERATELY, the same judgement `StartDiagnosisForm` made. §26's
 * repair procedure and §29's safety precautions are recorded ON the plan once it
 * exists; asking for them here would put a form in front of a technician before they
 * have seen which confirmed faults the plan is being built from — and §25 says the
 * application LOADS those faults, which it can only do after the plan names its source
 * diagnosis.
 *
 * With no input there is nothing to label, which removes the `position: absolute`
 * hazard that stretched the document twice in slices 2 and 3a. The queue cell keeps
 * its `position: relative` anyway — the next form dropped into that cell should not
 * have to rediscover it.
 *
 * WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses to start unless the
 * card is at `solution_preparation`, the viewer's role may plan, no unsettled plan
 * exists, and an APPROVED diagnosis with at least one confirmed fault is there to plan
 * from.
 */
export function StartRepairPlanForm({
  jobCardId,
  jobNumber,
  label = 'Plan repair',
}: {
  jobCardId: string;
  jobNumber: string;
  /**
   * The button's wording. The second-attempt case passes "Start a revised plan",
   * because a row already showing a reviewed plan needs to say that this creates
   * ANOTHER one rather than opening the existing one.
   */
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
      const outcome = await startRepairPlanAction(new FormData(event.currentTarget));
      if (outcome.error) {
        setError(outcome.error);
      } else {
        // The row must change from "Not started" to a link into the new record, which
        // means re-fetching the server component. `revalidatePath` in the action alone
        // does not repaint a page the user is already looking at.
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. No repair plan was started.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[1] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />

      {error ? (
        // `role="alert"` so the refusal is ANNOUNCED, carrying the API's own sentence —
        // which names the stage the card is at, or says the diagnosis has not been
        // approved and where to go to get it approved.
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
        // ⚠️ `aria-label`, NOT A VISUALLY-HIDDEN SPAN. A column of identical "Plan
        // repair" buttons is indistinguishable to a screen reader, so the job number
        // has to be in the accessible name — but an absolutely positioned hidden span
        // inside a button with no positioned ancestor is precisely the defect that
        // stretched the document in slices 2 and 3a. An attribute has no layout, so it
        // cannot escape a scroll container.
        aria-label={pending ? 'Starting…' : `${label} for job card ${jobNumber}`}
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
        {/* The label changes, not only the colour (§66). */}
        {pending ? 'Starting…' : label}
      </button>
    </form>
  );
}
