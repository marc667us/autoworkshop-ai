'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { Field, SubmitButton, TextInput } from '@autoworkshop/ui';
import {
  saveListingAction,
  setListingPublicationAction,
  type ActionOutcome,
} from './directory-actions';

/**
 * The opt-in form and the publish control.
 *
 * ⚠️ THE FORM IS RENDERED FOR EVERYONE AND DISABLED FOR NON-OWNERS, rather than
 * hidden. A technician who cannot see the form has no way to learn that the
 * workshop's public listing exists or who controls it; one who sees it greyed
 * out with a sentence naming the owner knows exactly what to do. Hiding it
 * would also protect nothing — migration 027's policy is the control, and
 * `05.txt`'s "hidden is not secure" cuts both ways.
 */

function Outcome({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  return (
    <p
      role={outcome.ok ? 'status' : 'alert'}
      style={{
        margin: `${primitive.space[2]} 0 0`,
        fontSize: primitive.fontSize.sm,
        color: themeVar.textPrimary,
        fontWeight: outcome.ok ? 400 : 600,
      }}
    >
      {outcome.message}
    </p>
  );
}

export interface ListingValues {
  tradingName: string;
  city: string;
  country: string;
  publicPhone: string;
  services: string;
  specialisms: string;
}

export function ListingForm({
  values,
  mayEdit,
  usingSuggestions,
}: {
  values: ListingValues;
  mayEdit: boolean;
  usingSuggestions: boolean;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);

  return (
    <form
      action={async (formData: FormData) => {
        setOutcome(await saveListingAction(formData));
      }}
    >
      {usingSuggestions && (
        /**
         * ⚠️ SAID OUT LOUD, because otherwise a pre-filled form looks like a
         * saved one. These values come from the workshop's PROFILE and are
         * suggestions for a listing that does not exist yet — migration 021 is
         * explicit that the directory is a COPY of consented fields, never a
         * view over the profile, so nothing here is public until it is saved
         * and published.
         */
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          These details are suggested from your workshop profile. Nothing is
          published yet — check them, save, then publish.
        </p>
      )}

      <Field label="Trading name" htmlFor="tradingName" hint="The name customers know you by">
        <TextInput id="tradingName" name="tradingName" defaultValue={values.tradingName} required disabled={!mayEdit} />
      </Field>
      <Field label="Town or city" htmlFor="city">
        <TextInput id="city" name="city" defaultValue={values.city} required disabled={!mayEdit} />
      </Field>
      <Field label="Country" htmlFor="country">
        <TextInput id="country" name="country" defaultValue={values.country} required disabled={!mayEdit} />
      </Field>
      <Field
        label="Public phone"
        htmlFor="publicPhone"
        hint="Shown to anyone. Use a number you are happy to publish, not a private office line."
      >
        <TextInput id="publicPhone" name="publicPhone" defaultValue={values.publicPhone} disabled={!mayEdit} />
      </Field>
      <Field label="Services" htmlFor="services" hint="Comma separated, e.g. Diagnostics, Brakes, Air conditioning">
        <TextInput id="services" name="services" defaultValue={values.services} disabled={!mayEdit} />
      </Field>
      <Field label="Specialisms" htmlFor="specialisms" hint="Comma separated, e.g. Toyota, Diesel">
        <TextInput id="specialisms" name="specialisms" defaultValue={values.specialisms} disabled={!mayEdit} />
      </Field>

      {mayEdit ? (
        <SubmitButton>Save details</SubmitButton>
      ) : (
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Only the workshop owner can change this listing. Ask an owner to
          publish or withdraw it.
        </p>
      )}
      <Outcome outcome={outcome} />
    </form>
  );
}

export function PublicationControl({
  published,
  exists,
  mayEdit,
}: {
  published: boolean;
  exists: boolean;
  mayEdit: boolean;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  if (!mayEdit) return null;

  return (
    <form
      action={async () => {
        setOutcome(await setListingPublicationAction(!published));
      }}
      style={{ marginTop: primitive.space[3] }}
    >
      <SubmitButton>{published ? 'Withdraw from the directory' : 'Publish to the directory'}</SubmitButton>
      {!exists && (
        // The API refuses this and says so; stating it here as well means the
        // button does not look broken before it is pressed.
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, margin: `${primitive.space[2]} 0 0` }}>
          Save your details first — there is nothing to publish yet.
        </p>
      )}
      <Outcome outcome={outcome} />
    </form>
  );
}
