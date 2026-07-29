'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { changeStageAction } from './stage-actions';

/**
 * The move control on a staging-board card — `02.txt` §29.
 *
 * A native `<select>` plus a submit, not drag-and-drop. §29 constrains
 * drag-and-drop ("shall not bypass business rules"); it does not require it, and
 * a native control is keyboard-operable and screen-reader-addressable with no
 * focus plumbing. Drag-and-drop can be layered over the same endpoint later —
 * the validation is server-side, so it would gain nothing by being dragged.
 *
 * ⚠️ WHAT THIS COMPONENT DECIDES IS COSMETIC. The options come from the API
 * (`allowedStages`, computed from the lifecycle and the viewer's role) and the
 * API re-derives every rule when the move is submitted. Editing this list in
 * devtools changes what is OFFERED and nothing about what is ALLOWED —
 * CLAUDE.md §8, hidden is not secure.
 *
 * Compact rather than `FormShell`: that component is sized for a full-page form
 * (42rem, heavy padding) and there is one of these per card.
 */
export function StageMoveForm({
  jobCardId,
  jobNumber,
  currentStage,
  allowedStages,
  overrideStages = [],
  stageLabels,
}: {
  jobCardId: string;
  jobNumber: string;
  currentStage: string;
  allowedStages: string[];
  /** Stages this viewer's role may produce that are NOT a legal next step. */
  overrideStages?: string[];
  stageLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState('');

  const selectId = `stage-${jobCardId}`;
  const reasonId = `reason-${jobCardId}`;

  // Choosing an override target reveals the reason field. The API refuses an
  // override without one, so asking after the fact would be a round trip that
  // exists only to say "now type why".
  const isOverride = choice !== '' && overrideStages.includes(choice);

  if (allowedStages.length === 0 && overrideStages.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {/* Says WHY there is no control, rather than rendering an empty menu
            that reads as a broken screen. */}
        No moves available to your role from {stageLabels[currentStage] ?? currentStage}.
      </p>
    );
  }

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
      const outcome = await changeStageAction(new FormData(form));
      if (outcome.error) {
        setError(outcome.error);
      } else {
        // The card must LEAVE this column, which means re-fetching the server
        // component. `revalidatePath` in the action alone would not repaint a
        // board the user is already looking at.
        setChoice('');
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. The job card has not moved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: primitive.space[2] }}>
      <input type="hidden" name="jobCardId" value={jobCardId} />

      {/* A real label, visually hidden: on a board of 15 columns a visible
          "Move to" on every card is noise, but a screen reader landing on the
          select must still be told which job it belongs to — hence the job
          number in the label text rather than a bare "Move to". */}
      <label htmlFor={selectId} style={visuallyHidden}>
        Move job card {jobNumber} to another stage
      </label>
      <select
        id={selectId}
        name="toStage"
        required
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
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
      >
        <option value="">Move to…</option>
        {allowedStages.map((s) => (
          <option key={s} value={s}>
            {stageLabels[s] ?? s}
          </option>
        ))}
        {overrideStages.length > 0 ? (
          // A separate group, labelled, so an override is a deliberate choice
          // and never something picked by accident from one flat list.
          <optgroup label="Override — skips the normal sequence">
            {overrideStages.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s] ?? s}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {isOverride ? (
        <>
          <label
            htmlFor={reasonId}
            style={{ fontSize: primitive.fontSize.sm, color: themeVar.textPrimary, fontWeight: 600 }}
          >
            Reason for the override
          </label>
          <textarea
            id={reasonId}
            name="overrideReason"
            required
            rows={2}
            placeholder="Why is the normal sequence being skipped?"
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
        </>
      ) : null}

      {error ? (
        // `role="alert"` so the refusal is ANNOUNCED. The message is the API's
        // own — it names where the card may actually go.
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: primitive.fontSize.sm,
            color: primitive.color.red[700],
          }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: primitive.space[2],
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
        {pending ? 'Moving…' : isOverride ? 'Override and move' : 'Move'}
      </button>
    </form>
  );
}
