'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { Field, SubmitButton, TextInput } from '@autoworkshop/ui';
import {
  decideInspectionAction,
  openInspectionAction,
  type ActionOutcome,
} from './quality-actions';

/**
 * The controls for an independent quality inspection — `2.txt` §563.
 *
 * ⚠️ THE TWO QUESTIONS ARE ASKED SEPARATELY AND BOTH ARE REQUIRED. §563 names
 * them as distinct checks, and they fail independently: a repair can fix the
 * original fault and break something else. A single "did it pass?" control would
 * make that state unsayable, and the inspector would have to choose which truth
 * to record.
 *
 * ⚠️ THERE IS NO PASS/FAIL CONTROL, DELIBERATELY. The verdict is DERIVED from
 * the two answers by the API. Offering one would let an inspector record "the
 * complaint was not addressed" and tick "passed" in the same breath — a
 * contradiction the database refuses, which would surface as an error on a form
 * that appeared to allow it. The screen shows the consequence instead, live, so
 * the inspector can see what their answers add up to before submitting.
 */

function Outcome({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  return (
    <p
      role={outcome.ok ? 'status' : 'alert'}
      style={{
        margin: `${primitive.space[3]} 0 0`,
        fontSize: primitive.fontSize.sm,
        color: themeVar.textPrimary,
        fontWeight: outcome.ok ? 400 : 600,
      }}
    >
      {outcome.message}
    </p>
  );
}

export function StartInspectionButton({
  testSessionId,
  disabled,
  reason,
}: {
  testSessionId: string;
  disabled: boolean;
  reason?: string;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);

  if (disabled) {
    // ⚠️ EXPLAINED, NOT HIDDEN. An inspector who worked on this car needs to
    // know WHY they cannot take it — otherwise the queue looks broken and they
    // ask a colleague to "fix" it. Hiding the row would be worse still: they
    // would never learn the car is waiting for somebody.
    return (
      <p
        style={{
          margin: 0,
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
          maxWidth: '32rem',
        }}
      >
        {reason ?? 'You cannot inspect this repair.'}
      </p>
    );
  }

  return (
    <form
      action={async () => {
        setOutcome(await openInspectionAction(testSessionId));
      }}
    >
      <SubmitButton>Start inspection</SubmitButton>
      <Outcome outcome={outcome} />
    </form>
  );
}

export function InspectionDecisionForm({ inspectionId }: { inspectionId: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  const [complaintAddressed, setComplaintAddressed] = React.useState<string>('');
  const [newDefectFound, setNewDefectFound] = React.useState<string>('');

  // The verdict as the API will derive it. Shown rather than chosen.
  const answered = complaintAddressed !== '' && newDefectFound !== '';
  const willPass = complaintAddressed === 'true' && newDefectFound === 'false';

  return (
    <form
      action={async (form: FormData) => {
        setOutcome(await decideInspectionAction(inspectionId, form));
      }}
      style={{ display: 'grid', gap: primitive.space[4], maxWidth: '36rem' }}
    >
      <YesNo
        legend="Has the original complaint been addressed?"
        name="complaintAddressed"
        value={complaintAddressed}
        onChange={setComplaintAddressed}
      />
      <YesNo
        legend="Was a new defect introduced by the repair?"
        name="newDefectFound"
        value={newDefectFound}
        onChange={setNewDefectFound}
      />

      {newDefectFound === 'true' && (
        <Field
          label="What is the new defect?"
          htmlFor="newDefectDescription"
          hint="Required. The technician it goes back to needs to know what to look at."
        >
          <TextInput id="newDefectDescription" name="newDefectDescription" required maxLength={4000} />
        </Field>
      )}

      <Field label="Notes" htmlFor="notes" hint="Optional. What you checked, and how.">
        <TextInput id="notes" name="notes" maxLength={8000} />
      </Field>

      {/* The consequence of the two answers, stated before submitting. Not a
          control — the API derives the same verdict from the same two fields. */}
      {answered && (
        <p
          role="status"
          data-testid="qc-derived-verdict"
          style={{
            margin: 0,
            padding: primitive.space[3],
            borderRadius: primitive.radius.md,
            border: `1px solid ${themeVar.borderDefault}`,
            background: themeVar.backgroundSecondary,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {willPass
            ? 'These answers record a PASS. The vehicle can move to ready for collection.'
            : 'These answers record a FAIL. The repair goes back to the workshop with your findings.'}
        </p>
      )}

      <div>
        <SubmitButton>Submit inspection result</SubmitButton>
        <p
          style={{
            margin: `${primitive.space[2]} 0 0`,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
          }}
        >
          A submitted inspection cannot be edited. If the repair comes back, that is a
          new inspection against a new attempt.
        </p>
      </div>

      <Outcome outcome={outcome} />
    </form>
  );
}

/**
 * A required yes/no.
 *
 * ⚠️ A RADIO GROUP WITH NO DEFAULT, NOT A CHECKBOX. A checkbox has only two
 * states and its unchecked one is indistinguishable from "not answered yet" —
 * so an inspector who simply did not read the question would submit a "no". §563
 * asks two questions that must each be ANSWERED, and `requiredBoolean` in the
 * API refuses anything that is not exactly "true" or "false".
 */
function YesNo({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        padding: primitive.space[3],
        margin: 0,
      }}
    >
      <legend style={{ padding: `0 ${primitive.space[2]}`, color: themeVar.textPrimary }}>
        {legend}
      </legend>
      <div style={{ display: 'flex', gap: primitive.space[4] }}>
        {[
          ['true', 'Yes'],
          ['false', 'No'],
        ].map(([v, label]) => (
          <label
            key={v}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: primitive.space[2],
              color: themeVar.textPrimary,
              // 44px is the comfortable touch target, and this screen is used on
              // a tablet in a workshop, often with gloves on.
              minHeight: '2.75rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={name}
              value={v}
              required
              checked={value === v}
              onChange={() => onChange(v!)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
