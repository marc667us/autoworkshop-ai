'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { recordInspectionAction, submitInspectionAction } from './inspection-actions';
// From the pure label module, NEVER from `inspection-sheet-screen` — that is an
// async server component, and importing a constant out of it would pull the
// module and its API client into the client bundle.
import { RESULT_LABEL, RESULT_ORDER } from './inspection-labels';

/**
 * The editable inspection checklist — `07.txt` §2968-§2978.
 *
 * ── WHY A `<select>` PER ROW RATHER THAN RADIOS ─────────────────────────────
 *
 * Four answers × nineteen checkpoints is 76 radio inputs on one page. A native
 * `<select>` is one tab stop per checkpoint instead of four, which is the
 * difference between a usable sheet and an unusable one on a workshop tablet, and
 * it is keyboard-operable and screen-reader-addressable without focus plumbing —
 * the same judgement the organisation switcher and the stage move control made.
 *
 * ── SAVE AND SUBMIT ARE SEPARATE, DELIBERATELY ─────────────────────────────
 *
 * An inspection is worked through over a shift; a technician who has answered
 * eight checkpoints must be able to put the tablet down. Save records what is
 * answered and leaves the rest genuinely unanswered. Submit is the transition,
 * and the API refuses it while anything is unanswered — naming the checkpoints,
 * so the message is actionable rather than "incomplete".
 *
 * ⚠️ TWO SUBMIT BUTTONS IN ONE FORM WOULD BE AMBIGUOUS, so submit is its own
 * form with only the id. Otherwise pressing Enter in a note field — which every
 * technician will do — could submit the whole inspection instead of saving it.
 */

interface InspectionItem {
  id: string;
  checkpointCode: string;
  label: string;
  result: 'pass' | 'fail' | 'requires_testing' | 'not_applicable' | null;
  note: string | null;
}

export function InspectionSheetForm({
  inspectionId,
  jobNumber,
  items,
  summary,
  mileageReading,
  answeredCount,
}: {
  inspectionId: string;
  jobNumber: string;
  items: InspectionItem[];
  summary: string | null;
  mileageReading: number | null;
  answeredCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<'save' | 'submit' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const complete = answeredCount === items.length;

  async function run(
    kind: 'save' | 'submit',
    action: (data: FormData) => Promise<{ error?: string; created?: string }>,
    form: HTMLFormElement,
  ) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setPending(kind);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action(new FormData(form));
      if (outcome.error) {
        setError(outcome.error);
      } else {
        setNotice(outcome.created ?? 'Saved');
        // Re-fetch the server component: the answered count, the derived finding
        // count and — after a submit — the whole read-only view come from the
        // server. `revalidatePath` in the action alone does not repaint a page
        // already on screen.
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {/* Announcements live OUTSIDE both forms, so a submit that replaces the
          form below does not take the message with it.

          ⚠️ Scoped `role` on a specific element rather than a bare page-level
          live region: an unscoped `[role="status"]` also matches the shell's own
          empty live region, which once made a working write report as a failure
          in a test. */}
      {error ? (
        <p
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: primitive.color.red[700],
            fontSize: primitive.fontSize.sm,
          }}
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {notice}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run('save', recordInspectionAction, event.currentTarget);
        }}
        noValidate
      >
        <input type="hidden" name="inspectionId" value={inspectionId} />

        <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
          <table
            style={{
              width: '100%',
              minWidth: '44rem',
              borderCollapse: 'collapse',
              fontSize: primitive.fontSize.sm,
            }}
          >
            <caption style={visuallyHidden}>
              Inspection checklist for job card {jobNumber} — {items.length} checkpoints
            </caption>
            <thead>
              <tr>
                {['Checkpoint', 'Result', 'Note'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    style={{
                      textAlign: 'left',
                      padding: primitive.space[2],
                      borderBottom: `1px solid ${themeVar.borderDefault}`,
                      color: themeVar.textSecondary,
                      fontWeight: 600,
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const selectId = `result-${item.checkpointCode}`;
                const noteId = `note-${item.checkpointCode}`;
                return (
                  <tr key={item.id}>
                    {/* `<th scope="row">`, so a screen reader announces the
                        checkpoint name with each cell in the row. */}
                    <th
                      scope="row"
                      style={{
                        textAlign: 'left',
                        padding: primitive.space[2],
                        borderBottom: `1px solid ${themeVar.borderDefault}`,
                        color: themeVar.textPrimary,
                        fontWeight: 400,
                      }}
                    >
                      <label htmlFor={selectId}>{item.label}</label>
                    </th>
                    <td style={cell}>
                      <select
                        id={selectId}
                        name={`result:${item.checkpointCode}`}
                        // UNCONTROLLED, with `defaultValue`. The server is the
                        // source of truth and `router.refresh()` re-renders with
                        // the saved values; holding these in React state would
                        // mean a rejected save could leave the screen showing
                        // answers the API does not have.
                        defaultValue={item.result ?? ''}
                        style={selectStyle}
                      >
                        {/* The empty option is "not yet answered" and is NOT the
                            same as "not applicable". The action omits empties, so
                            an unanswered checkpoint stays unanswered and
                            submission still refuses the sheet. */}
                        <option value="">Not answered</option>
                        {RESULT_ORDER.map((value) => (
                          <option key={value} value={value}>
                            {RESULT_LABEL[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={cell}>
                      <label htmlFor={noteId} style={visuallyHidden}>
                        Note for {item.label}
                      </label>
                      <input
                        id={noteId}
                        name={`note:${item.checkpointCode}`}
                        type="text"
                        maxLength={2000}
                        defaultValue={item.note ?? ''}
                        placeholder="Optional"
                        style={{ ...selectStyle, minWidth: '14rem' }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gap: primitive.space[2], marginTop: primitive.space[4], maxWidth: '42rem' }}>
          <label htmlFor="mileageReading" style={labelStyle}>
            Odometer reading (km)
          </label>
          <input
            id="mileageReading"
            name="mileageReading"
            type="number"
            min={0}
            max={100000000}
            step={1}
            defaultValue={mileageReading ?? ''}
            style={selectStyle}
          />

          <label htmlFor="summary" style={labelStyle}>
            Technician notes
          </label>
          <textarea
            id="summary"
            name="summary"
            rows={4}
            maxLength={8000}
            defaultValue={summary ?? ''}
            placeholder="Overall condition, anything the checklist does not cover."
            style={selectStyle}
          />

          <button type="submit" disabled={pending !== null} style={buttonStyle(pending === 'save')}>
            {/* The label changes, not only the colour (§66). */}
            {pending === 'save' ? 'Saving…' : 'Save progress'}
          </button>
        </div>
      </form>

      {/* Submit is its OWN form — see the header note. It carries only the id, so
          it cannot accidentally send half-typed answers, and Enter inside a note
          field can never trigger it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run('submit', submitInspectionAction, event.currentTarget);
        }}
        noValidate
        style={{ marginTop: primitive.space[4], maxWidth: '42rem' }}
      >
        <input type="hidden" name="inspectionId" value={inspectionId} />
        <p style={{ margin: `0 0 ${primitive.space[2]} 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          {complete
            ? 'Every checkpoint has an answer. Submitting makes this sheet the finding of record — it cannot be changed afterwards.'
            : `${items.length - answeredCount} checkpoint(s) still unanswered. Save your answers first; ` +
              'anything that does not apply should be marked “not applicable”.'}
        </p>
        <button
          type="submit"
          // NOT disabled when incomplete. The API is the authority on whether the
          // sheet may be submitted and its refusal NAMES the missing checkpoints,
          // which is more useful than a dead button that explains nothing. The
          // sentence above says what will happen either way.
          disabled={pending !== null}
          style={buttonStyle(pending === 'submit')}
        >
          {pending === 'submit' ? 'Submitting…' : 'Submit inspection'}
        </button>
      </form>
    </>
  );
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  verticalAlign: 'top' as const,
  // ⚠️ LOAD-BEARING, NOT COSMETIC — measured, not assumed. Each note cell holds a
  // `visuallyHidden` label, which is `position: absolute`. With no positioned
  // ancestor it resolves against the INITIAL CONTAINING BLOCK, so the label for
  // the last checkpoint — inside a table that is deliberately wider than the
  // viewport and scrolls inside its own container — was laid out at x=412 against
  // a 390px viewport and stretched the document by 23px.
  //
  // Same defect the staging board paid 4906px for in slice 2. `position:
  // relative` makes the cell the containing block, so the hidden label stays
  // inside the scroll container where it belongs.
  position: 'relative' as const,
};

const labelStyle = {
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  color: themeVar.textPrimary,
};

const selectStyle = {
  width: '100%',
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};

function buttonStyle(busy: boolean) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}
