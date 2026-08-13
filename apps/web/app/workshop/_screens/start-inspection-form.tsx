'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { startInspectionAction } from './inspection-actions';

/**
 * "Start Inspection" — `07.txt` §2924.
 *
 * A mileage field beside the button rather than a separate step: §2932 checks
 * mileage and the technician is standing at the odometer. It is PRE-FILLED with
 * what reception recorded at intake, because correcting that figure is itself a
 * finding, and re-keying a number that is already on the card invites a typo.
 *
 * ⚠️ WHAT THIS COMPONENT DECIDES IS COSMETIC. The service refuses to start a
 * sheet unless the card is at `initial_inspection` and the viewer's role may
 * record one, and it refuses a second open sheet. Nothing here is a control.
 *
 * Compact rather than `FormShell`: that is sized for a full-page form and there
 * is one of these per queue row.
 */
export function StartInspectionForm({
  jobCardId,
  jobNumber,
  mileageAtIntake,
  label = 'Start inspection',
}: {
  jobCardId: string;
  jobNumber: string;
  mileageAtIntake: number | null;
  /**
   * The button's wording. Defaults to §2924's own "Start Inspection"; the
   * second-attempt case passes "Start a new inspection", because a row that
   * already shows a submitted sheet needs to say that this creates ANOTHER one
   * rather than opening the existing one.
   */
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mileageId = `mileage-${jobCardId}`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const outcome = await startInspectionAction(new FormData(form));
      if (outcome.error) {
        setError(outcome.error);
      } else {
        // The row must change from "Not started" to a link into the new sheet,
        // which means re-fetching the server component. `revalidatePath` in the
        // action alone does not repaint a page the user is already looking at.
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. No inspection was started.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[1] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />

      {/* A real label, visually hidden: a visible "Mileage" on every row of the
          queue is noise, but a screen reader landing in this field must be told
          which job it belongs to — hence the job number in the label. */}
      <label htmlFor={mileageId} style={visuallyHidden}>
        Odometer reading for job card {jobNumber}
      </label>
      <input
        id={mileageId}
        name="mileageReading"
        type="number"
        min={0}
        max={100000000}
        step={1}
        defaultValue={mileageAtIntake ?? ''}
        placeholder="Mileage"
        style={{
          width: '7rem',
          padding: primitive.space[1],
          fontSize: primitive.fontSize.sm,
          fontFamily: 'inherit',
          color: themeVar.textPrimary,
          background: themeVar.surfaceRaised,
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
        }}
      />

      {error ? (
        // `role="alert"` so the refusal is ANNOUNCED, carrying the API's own
        // sentence — which names the stage the card is actually at.
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
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
