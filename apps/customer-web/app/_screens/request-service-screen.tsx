import { Suspense } from 'react';
import { apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, FormShell, Field, Select, TextInput, EmptyState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { requestServiceAction } from './request-service-actions';

/**
 * Request for Service — the owner's value chain, step 5.
 *
 * "a page opens and he file a his complain his car details and his problems and
 * submit, he does this after loging in."
 *
 * ── 🔴 WHY THE VEHICLE IS FREE TEXT AND NOT A DROPDOWN ─────────────────────
 *
 * `report-a-problem` requires a REGISTERED vehicle and refuses outright when the
 * customer has none — correct there, because it opens a job card against a car
 * the workshop already knows. This form is the opposite situation by design:
 * the customer has just found a workshop that has never heard of them, and the
 * owner's flow has reception REGISTERING the customer and the vehicle from this
 * very form afterwards. Demanding a registered vehicle first would make the step
 * unreachable for exactly the people it exists to convert.
 *
 * So the garage is offered when it has something in it, and typing is always
 * allowed.
 */
export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
}

export function RequestServiceScreen({ workshopId }: { workshopId?: string }) {
  return (
    <>
      <PageHeader
        title="Request for Service"
        description="Tell the workshop what is wrong. They will confirm before any work starts."
      />
      <Suspense fallback={<LoadingState label="Preparing the form…" />}>
        <RequestForm workshopId={workshopId} />
      </Suspense>
    </>
  );
}

async function RequestForm({ workshopId }: { workshopId?: string }) {
  // The garage is an OPTIONAL convenience here. A failure to read it must not
  // block the request — the whole point is that this works for somebody with no
  // vehicles on file at all.
  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');
  const mine = vehicles.ok ? vehicles.data : [];

  if (!workshopId) {
    // Not an error state: it is a person who reached the form without choosing.
    // Send them to the thing that makes the form usable.
    // ⚠️ AN EMPTY STATE, NOT `ApiFailure`. Nothing failed: this is somebody who
    // reached the form without choosing a workshop, and telling them the service
    // is unavailable would be a lie about a working system — the same class of
    // wrong message as "your session has ended" shown to a first-time visitor.
    return (
      <EmptyState
        title="Choose a workshop first"
        description="Open this form from a workshop in the directory, so your request reaches the one you picked."
      />
    );
  }

  return (
    <FormShell
      action={requestServiceAction}
      successPrefix="Sent — your request reference is"
      successHref={{ href: '/service-and-repairs/service-requests', label: 'See your requests' }}
    >
      {/*
        The chosen workshop, carried through the form rather than re-selected.
        ⚠️ NOT A TRUST BOUNDARY — the API re-checks that this organisation exists
        in this tenant, and RLS checks again. A hidden field is a suggestion.
      */}
      <input type="hidden" name="organizationId" value={workshopId} />

      {mine.length > 0 ? (
        <Field
          label="One of your vehicles?"
          hint="Optional. Leave it blank and describe the car below instead."
          htmlFor="vehicleId"
        >
          <Select
            id="vehicleId"
            name="vehicleId"
            options={[
              { value: '', label: 'Not one of these — I will describe it' },
              ...mine.map((v) => ({
                value: v.id,
                label: `${v.registrationNumber} — ${v.make}${v.model ? ` ${v.model}` : ''}`,
              })),
            ]}
          />
        </Field>
      ) : null}

      <Field
        label="What car is it?"
        hint="Make, model and year is enough. The workshop will confirm the details when they see it."
        htmlFor="vehicleDescription"
      >
        <TextInput id="vehicleDescription" name="vehicleDescription" required maxLength={500} />
      </Field>

      <Field label="Registration number" hint="Optional." htmlFor="registrationNumber">
        <TextInput id="registrationNumber" name="registrationNumber" maxLength={40} />
      </Field>

      <Field
        label="What is wrong?"
        hint="Plain words are fine. When it happens, what you hear or feel, and whether it is getting worse."
        htmlFor="complaint"
      >
        {/* A textarea, because a complaint is prose and a one-line box teaches
            people to write one line. */}
        <textarea
          id="complaint"
          name="complaint"
          required
          rows={5}
          maxLength={2000}
          style={{
            width: '100%',
            padding: primitive.space[2],
            borderRadius: primitive.radius.md,
            border: `1px solid ${themeVar.borderDefault}`,
            background: themeVar.backgroundPrimary,
            color: themeVar.textPrimary,
            fontFamily: 'inherit',
            fontSize: primitive.fontSize.sm,
          }}
        />
      </Field>

      <Field
        label="How should they reach you?"
        hint="Optional. A phone number usually gets the quickest answer."
        htmlFor="preferredContact"
      >
        <TextInput id="preferredContact" name="preferredContact" maxLength={200} />
      </Field>
    </FormShell>
  );
}
