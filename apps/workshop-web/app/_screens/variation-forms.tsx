'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { Field, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import {
  decideVariationAction,
  raiseVariationAction,
  reviewVariationAction,
  type ActionOutcome,
} from './variation-actions';

/**
 * The controls for the variation flow — `07.txt` §14, §3792.
 *
 * ⚠️ EACH CONTROL APPEARS ONLY FOR THE PERSON WHOSE STEP IT IS. A technician
 * raises; somebody else reviews; a reviewer records the customer's answer. That
 * is not decoration — showing a reviewer button to the technician who raised the
 * variation would offer them an action the database refuses, which reads as a
 * broken screen rather than as the independence rule §3792 requires.
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

/** §3764 step 11 — the technician found more work. */
export function RaiseVariationForm({ executionId }: { executionId: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  const [cost, setCost] = React.useState('');

  // The consequence of the number, shown while it is being typed. A technician
  // should know before submitting that a chargeable variation stops the work.
  const chargeable = cost.trim() !== '' && Number(cost) > 0;

  return (
    <form
      action={async (form: FormData) => {
        setOutcome(await raiseVariationAction(executionId, form));
      }}
      style={{ display: 'grid', gap: primitive.space[4], maxWidth: '36rem' }}
    >
      <Field
        label="What did you find?"
        htmlFor="newFinding"
        hint="The unexpected finding, in the words you would use to the customer."
      >
        <TextInput id="newFinding" name="newFinding" required maxLength={4000} />
      </Field>

      <Field label="What additional work is needed?" htmlFor="additionalWork">
        <TextInput id="additionalWork" name="additionalWork" required maxLength={4000} />
      </Field>

      <Field label="Additional parts" htmlFor="additionalParts" hint="Optional.">
        <TextInput id="additionalParts" name="additionalParts" maxLength={4000} />
      </Field>

      <Field label="Additional labour (hours)" htmlFor="additionalLabourHours" hint="Optional.">
        <TextInput id="additionalLabourHours" name="additionalLabourHours" inputMode="decimal" />
      </Field>

      <Field
        label="Additional cost"
        htmlFor="additionalCost"
        hint="Enter 0 if there is no charge. A chargeable variation cannot start until the customer approves."
      >
        <TextInput
          id="additionalCost"
          name="additionalCost"
          // `inputMode` rather than `type="number"`: a number input silently
          // discards what it cannot parse in some browsers, so a mistyped cost
          // can submit EMPTY — and an empty cost is exactly what the API refuses
          // in order to avoid recording a chargeable variation as free.
          inputMode="decimal"
          required
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </Field>

      <Field label="Currency" htmlFor="currency">
        <TextInput id="currency" name="currency" defaultValue="GHS" maxLength={3} required />
      </Field>

      <Field
        label="Effect on completion"
        htmlFor="effectOnCompletion"
        hint="Optional — for example, two more days."
      >
        <TextInput id="effectOnCompletion" name="effectOnCompletion" maxLength={4000} />
      </Field>

      {/* Stated before submitting, because it is the thing a technician most
          needs to know: raising this does not let them start. */}
      <p
        role="status"
        data-testid="variation-chargeable-note"
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
        {chargeable
          ? 'CHARGEABLE. Do not start this work. It must be reviewed internally, sent to the ' +
            'customer, and approved before it is authorised.'
          : 'No charge. It still needs internal review and the customer should be told, but no ' +
            'approval is required before the work.'}
      </p>

      <div>
        <SubmitButton>Raise variation</SubmitButton>
      </div>
      <Outcome outcome={outcome} />
    </form>
  );
}

/** §3792's first step, performed by somebody who did not raise it. */
export function ReviewControls({ variationId }: { variationId: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <div style={{ display: 'flex', gap: primitive.space[3], flexWrap: 'wrap' }}>
      <form
        action={async () => {
          setOutcome(await reviewVariationAction(variationId, true));
        }}
      >
        <SubmitButton>Review and send to the customer</SubmitButton>
      </form>
      <form
        action={async () => {
          setOutcome(await reviewVariationAction(variationId, false));
        }}
      >
        <SubmitButton>Review only</SubmitButton>
      </form>
      <Outcome outcome={outcome} />
    </div>
  );
}

/**
 * Record what the customer said.
 *
 * ⚠️ THE NAME AND CHANNEL ARE REQUIRED FOR A CHARGEABLE APPROVAL and optional
 * otherwise, which is why they are shown conditionally rather than always marked
 * required. Demanding a signature for a no-charge courtesy notification would
 * push staff to record £0 variations as nothing at all.
 */
export function DecisionForm({
  variationId,
  chargeable,
}: {
  variationId: string;
  chargeable: boolean;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  const [decision, setDecision] = React.useState('');

  const needsConsent = chargeable && decision === 'approved';
  const needsReason = decision === 'rejected';

  return (
    <form
      action={async (form: FormData) => {
        setOutcome(await decideVariationAction(variationId, form));
      }}
      style={{ display: 'grid', gap: primitive.space[4], maxWidth: '36rem' }}
    >
      <Field label="What did the customer say?" htmlFor="decision">
        <Select
          id="decision"
          name="decision"
          required
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          options={[
            { value: '', label: 'Choose…' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'modified', label: 'Wants it changed' },
          ]}
        />
      </Field>

      {needsConsent && (
        <>
          <Field
            label="Who approved it?"
            htmlFor="decidedByName"
            hint="The customer's name. A chargeable approval needs a name against it."
          >
            <TextInput id="decidedByName" name="decidedByName" required maxLength={200} />
          </Field>
          <Field label="How did they approve it?" htmlFor="decisionChannel">
            <Select
              id="decisionChannel"
              name="decisionChannel"
              required
              options={[
                { value: '', label: 'Choose…' },
                { value: 'in_person', label: 'In person' },
                { value: 'phone', label: 'Phone' },
                { value: 'email', label: 'Email' },
                { value: 'sms', label: 'SMS' },
                { value: 'portal', label: 'Customer portal' },
              ]}
            />
          </Field>
        </>
      )}

      <Field
        label={needsReason ? 'Why did they reject it?' : 'Note'}
        htmlFor="decisionNote"
        hint={
          needsReason
            ? 'Required. The workshop needs to know what to offer instead.'
            : 'Optional.'
        }
      >
        <TextInput id="decisionNote" name="decisionNote" required={needsReason} maxLength={4000} />
      </Field>

      {decision === 'approved' && (
        <p
          role="status"
          data-testid="variation-authorises-note"
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
          Recording this AUTHORISES the additional work. The scope and cost cannot be
          changed afterwards — if the customer wants something different, choose
          &ldquo;wants it changed&rdquo; instead.
        </p>
      )}

      <div>
        <SubmitButton>Record the customer&rsquo;s answer</SubmitButton>
      </div>
      <Outcome outcome={outcome} />
    </form>
  );
}
