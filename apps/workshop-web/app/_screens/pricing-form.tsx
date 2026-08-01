'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { Field, SubmitButton, TextInput } from '@autoworkshop/ui';
import { savePricingAction, type ActionOutcome } from './pricing-actions';

/**
 * The pricing form.
 *
 * ⚠️ RENDERED FOR EVERYONE AND DISABLED FOR NON-OWNERS, rather than hidden. A
 * manager who cannot see these rates has no way to learn what the workshop
 * quotes from or who controls it; one who sees them read-only with a sentence
 * naming the owner knows exactly what to do. Hiding would also protect nothing —
 * migration 029's policies are the control, and reads are tenant-wide by design
 * because `quotation.service.ts` needs them for whoever prepares a quotation.
 */

export interface PricingValues {
  currency: string;
  defaultLabourRate: string;
  taxName: string;
  taxRatePercent: string;
  defaultValidityDays: string;
  defaultWarrantyTerms: string;
}

function Outcome({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  return (
    <p
      // `alert` for a failure so a screen reader announces it immediately — the
      // owner has just pressed Save and needs to know it did not happen.
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

export function PricingForm({
  values,
  mayEdit,
  configured,
}: {
  values: PricingValues;
  mayEdit: boolean;
  configured: boolean;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);

  async function onSubmit(form: FormData) {
    setOutcome(await savePricingAction(form));
  }

  return (
    <form action={onSubmit} style={{ display: 'grid', gap: primitive.space[4], maxWidth: '34rem' }}>
      <Field
        label="Currency"
        htmlFor="currency"
        hint="Three-letter code, for example GHS, NGN or USD."
      >
        <TextInput
          id="currency"
          name="currency"
          defaultValue={values.currency}
          disabled={!mayEdit}
          required
          maxLength={3}
          autoCapitalize="characters"
        />
      </Field>

      <Field
        label="Default labour rate (per hour)"
        htmlFor="defaultLabourRate"
        hint={
          configured
            ? 'Applied to every new quotation built from an approved repair plan.'
            : 'Currently unset, so quotations are pricing labour at ZERO. Set it before quoting.'
        }
      >
        <TextInput
          id="defaultLabourRate"
          name="defaultLabourRate"
          // `inputMode` rather than `type="number"`: a number input silently
          // discards what it cannot parse in some browsers, so a mistyped rate
          // can submit as EMPTY — which is the exact input the API refuses in
          // order to avoid writing a zero. Keeping it text means the owner's
          // mistake reaches the validator and gets an explanation.
          inputMode="decimal"
          defaultValue={values.defaultLabourRate}
          disabled={!mayEdit}
          required
        />
      </Field>

      <Field label="Tax name" htmlFor="taxName" hint="How the tax line is labelled on a quotation.">
        <TextInput
          id="taxName"
          name="taxName"
          defaultValue={values.taxName}
          disabled={!mayEdit}
          required
          maxLength={40}
        />
      </Field>

      <Field label="Tax rate (%)" htmlFor="taxRatePercent" hint="Between 0 and 100.">
        <TextInput
          id="taxRatePercent"
          name="taxRatePercent"
          inputMode="decimal"
          defaultValue={values.taxRatePercent}
          disabled={!mayEdit}
          required
        />
      </Field>

      <Field
        label="Quotation validity (days)"
        htmlFor="defaultValidityDays"
        hint="How long a new quotation stays valid. Between 1 and 365."
      >
        <TextInput
          id="defaultValidityDays"
          name="defaultValidityDays"
          inputMode="numeric"
          defaultValue={values.defaultValidityDays}
          disabled={!mayEdit}
          required
        />
      </Field>

      <Field
        label="Standard warranty terms"
        htmlFor="defaultWarrantyTerms"
        hint="Optional. Printed on quotations that do not override it."
      >
        <TextInput
          id="defaultWarrantyTerms"
          name="defaultWarrantyTerms"
          defaultValue={values.defaultWarrantyTerms}
          disabled={!mayEdit}
          maxLength={2000}
        />
      </Field>

      {mayEdit ? (
        <div>
          <SubmitButton>{configured ? 'Save pricing' : 'Set pricing'}</SubmitButton>
          {/* Stated at the point of action, because it is the question an owner
              actually has: does changing this re-price work already quoted? */}
          <p
            style={{
              margin: `${primitive.space[2]} 0 0`,
              fontSize: primitive.fontSize.sm,
              color: themeVar.textSecondary,
            }}
          >
            Quotations already issued keep the rates they were built with. Only new
            quotations use these.
          </p>
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
          }}
        >
          These rates are shown read-only. A quotation is built from them, so changing
          them is the workshop owner&rsquo;s decision — ask an owner if they need to change.
        </p>
      )}

      <Outcome outcome={outcome} />
    </form>
  );
}
