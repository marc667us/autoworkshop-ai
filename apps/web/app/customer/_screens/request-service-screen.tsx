import { Suspense } from 'react';
import { apiGet } from '@autoworkshop/next-shell';
import {
  PageHeader,
  LoadingState,
  FormShell,
  Field,
  Select,
  TextInput,
  EmptyState,
  SubmitButton,
} from '@autoworkshop/ui';
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

interface Mechanic {
  organizationId: string;
  tradingName: string;
  city?: string | null;
}

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
  const [vehicles, mechanics] = await Promise.all([
    apiGet<Vehicle[]>('customer', '/vehicles'),
    // The PUBLIC workshop directory. Fetched so somebody who arrived from the
    // landing's "Request repair service" button — rather than from a specific
    // mechanic card — can choose one here instead of being sent back.
    apiGet<Mechanic[]>('customer', '/public/mechanics'),
  ]);
  const mine = vehicles.ok ? vehicles.data : [];
  const workshops = mechanics.ok ? mechanics.data : [];

  // 🔴 THE WORKSHOP IS THE FORM'S FIRST QUESTION WHEN NOBODY PICKED ONE.
  //
  // This used to be an empty state telling the visitor to go back and open the
  // form from a workshop card. That is a wall on the one screen the whole funnel
  // exists to reach: somebody who pressed "Request repair service" on the
  // landing has already said exactly what they want, and answering with "go and
  // find a workshop first" loses them.
  //
  // Nothing has failed, so this is still not an `ApiFailure` — the choice simply
  // moves into the form.
  if (!workshopId && workshops.length === 0) {
    return (
      <EmptyState
        title="No workshops listed yet"
        description="Requests go to workshops in the public directory, and none are listed yet. Please try again shortly."
      />
    );
  }

  return (
    <FormShell
      action={requestServiceAction}
      successPrefix="Sent — your request reference is"
      successHref={{ href: '/service-and-repairs/service-requests', label: 'See your requests' }}
      /*
        Owner, 2026-08-07: "the submit must have preview".
        🔴 `organizationId` is rendered through the workshop's NAME, never its
        uuid. This is a stranger's first contact with a workshop, and the one
        thing they most need to check is that they are about to send it to the
        right garage — a review panel showing `a3f1…` answers that question
        with nothing.
      */
      preview={{
        title: 'Check this before you send it',
        description:
          'This goes straight to the workshop’s front desk. You can go back and change anything.',
        confirmLabel: 'Send request',
        fields: [
          {
            name: 'organizationId',
            label: 'Workshop',
            render: (id) => {
              const w = workshops.find((x) => x.organizationId === id);
              if (!w) {
                // Reached when the visitor arrived from a mechanic card, so the
                // id is in a hidden field and the public directory may not
                // contain it. Saying so beats printing a uuid.
                return 'The workshop you came from';
              }
              return w.city ? `${w.tradingName} — ${w.city}` : w.tradingName;
            },
          },
          {
            name: 'vehicleId',
            label: 'Vehicle on file',
            render: (id) => {
              const v = mine.find((x) => x.id === id);
              return v
                ? `${v.registrationNumber} — ${v.make}${v.model ? ` ${v.model}` : ''}`
                : 'Described below instead';
            },
          },
          { name: 'vehicleDescription', label: 'The car' },
          { name: 'registrationNumber', label: 'Registration number' },
          { name: 'complaint', label: 'What is wrong' },
          { name: 'preferredContact', label: 'How to reach you' },
        ],
      }}
    >
      {/*
        The chosen workshop when they came from a mechanic card; a question when
        they came from the landing button.
        ⚠️ NEITHER IS A TRUST BOUNDARY — the API re-checks that this organisation
        exists in this tenant, and RLS checks again. A hidden field is a
        suggestion, and so is a select.
      */}
      {workshopId ? (
        <input type="hidden" name="organizationId" value={workshopId} />
      ) : (
        <Field
          label="Which workshop?"
          hint="Pick the one you would like to look at your car."
          htmlFor="organizationId"
        >
          <Select
            id="organizationId"
            name="organizationId"
            required
            options={workshops.map((w) => ({
              value: w.organizationId,
              label: w.city ? `${w.tradingName} — ${w.city}` : w.tradingName,
            }))}
          />
        </Field>
      )}

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

      {/*
        🔴 THIS WAS MISSING ENTIRELY, AND THE FORM COULD NOT BE SENT.
        Owner, 2026-08-07: "the customer request for service form dont have
        submit butoom". Correct — `FormShell` renders the `<form>` and the
        outcome banner but NOT a submit control; every other form in this
        repository supplies its own `SubmitButton`, and of 49 that use
        `FormShell` this one and `parts-requests-screen` were the only two that
        did not. So the owner's primary funnel ended at a page nobody could
        submit, and `service_request.created` — which notifies the front desk
        that routes and assigns the job — could never fire, because nothing
        ever created a request.
        `packages/ui/src/form-has-submit.spec.ts` now fails if any form loses
        its submit control again — verified by removing this line and watching
        it go red, because a guard nobody has seen fail is not known to work.
      */}
      <SubmitButton>Review request</SubmitButton>
    </FormShell>
  );
}
