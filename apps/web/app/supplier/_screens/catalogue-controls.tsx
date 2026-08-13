'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { Field, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import {
  addFitmentAction,
  createPartAction,
  deletePartAction,
  removeFitmentAction,
  type ActionOutcome,
} from './catalogue-actions';

/**
 * The write controls for the supplier catalogue.
 *
 * ⚠️ THERE IS NO PUBLISH BUTTON HERE, AND ITS ABSENCE IS EXPLAINED ON SCREEN
 * RATHER THAN LEFT AS A GAP. Publication is an administrator decision
 * (migration 024), and a supplier who cannot find the control will assume the
 * feature is broken and ask. The banner in `CataloguePanel` says where the part
 * goes instead. Hiding the control is not the enforcement — the trigger is.
 *
 * ⚠️ EVERY REFUSAL IS DISPLAYED VERBATIM FROM THE API. The useful ones name a
 * way forward ("ask an administrator to withdraw the part"), and a component
 * that replaced them with "Something went wrong" would turn a rule into a dead
 * end. That is the most expensive defect class in this repository.
 */

const row: React.CSSProperties = {
  display: 'flex',
  gap: primitive.space[2],
  flexWrap: 'wrap',
  alignItems: 'flex-end',
};

function Outcome({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  return (
    <p
      // `role="status"` so a screen reader announces the result of a submission
      // that changes nothing visible above it.
      role={outcome.ok ? 'status' : 'alert'}
      style={{
        margin: `${primitive.space[2]} 0 0`,
        fontSize: primitive.fontSize.sm,
        // There is no danger token in the palette; the alert ROLE carries the
        // semantics for assistive technology, and inventing a colour here would
        // be a token that exists in one component only.
        color: themeVar.textPrimary,
        fontWeight: outcome.ok ? 400 : 600,
      }}
    >
      {outcome.message}
    </p>
  );
}

export function AddPartForm({
  supplierId,
  categories,
}: {
  supplierId: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        const result = await createPartAction(supplierId, formData);
        setOutcome(result);
        // Only clear a form that actually saved. Wiping it on failure destroys
        // what the person typed at the exact moment they need to correct it.
        if (result.ok) formRef.current?.reset();
      }}
      style={{ marginTop: primitive.space[3] }}
    >
      <div style={row}>
        <Field label="Part number" htmlFor="partNumber">
          <TextInput id="partNumber" name="partNumber" required />
        </Field>
        <Field label="Name" htmlFor="name">
          <TextInput id="name" name="name" required />
        </Field>
        <Field label="Category" htmlFor="categoryId">
          <Select
            id="categoryId"
            name="categoryId"
            required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="Brand" htmlFor="brand">
          <TextInput id="brand" name="brand" />
        </Field>
        <Field label="Price (GHS)" htmlFor="price" hint="Leave blank for quote-only">
          <TextInput id="price" name="price" inputMode="decimal" />
        </Field>
        <SubmitButton>Add part</SubmitButton>
      </div>
      <Outcome outcome={outcome} />
    </form>
  );
}

export function DeletePartButton({ partId, partName }: { partId: string; partName: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <form
      action={async () => {
        setOutcome(await deletePartAction(partId));
      }}
      style={{ display: 'inline' }}
    >
      <SubmitButton>Remove</SubmitButton>
      {/* The interesting failure is a part on a placed order: the API answers
          "mark it out of stock instead, so the order history stays intact". */}
      <span aria-live="polite">
        <Outcome outcome={outcome} />
      </span>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        Remove {partName}
      </span>
    </form>
  );
}

export function FitmentEditor({
  partId,
  published,
  fitments,
}: {
  partId: string;
  published: boolean;
  fitments: Array<{ id: string; make: string; model: string; year_from: number; year_to: number | null }>;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);

  return (
    <div style={{ marginTop: primitive.space[2] }}>
      <ul style={{ margin: 0, paddingLeft: primitive.space[4], fontSize: primitive.fontSize.sm }}>
        {fitments.length === 0 ? (
          <li style={{ listStyle: 'none', marginLeft: `-${primitive.space[4]}`, color: themeVar.textSecondary }}>
            No vehicles listed yet — buyers search by car, so a part with no
            compatibility is hard to find.
          </li>
        ) : (
          fitments.map((f) => (
            <li key={f.id}>
              {f.make} {f.model} {f.year_from}–{f.year_to ?? 'now'}
              {!published && (
                <form
                  action={async () => {
                    setOutcome(await removeFitmentAction(f.id));
                  }}
                  style={{ display: 'inline', marginLeft: primitive.space[2] }}
                >
                  <SubmitButton>Remove</SubmitButton>
                </form>
              )}
            </li>
          ))
        )}
      </ul>

      {published ? (
        /**
         * ⚠️ THE RULE IS STATED WHERE THE CONTROL WOULD BE, not left implicit.
         * Migration 026 refuses fitment writes on a published part because a
         * fitment is the claim "this part fits that car" and it goes public with
         * no review. A form that simply vanished would read as a missing
         * feature; naming the route — ask for withdrawal — is what makes it a
         * rule rather than a wall.
         */
        <p style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary, margin: `${primitive.space[2]} 0 0` }}>
          This part is published, so its compatibility list is public and only an
          administrator can change it. Ask an administrator to withdraw the part;
          you can then edit it freely and have it republished.
        </p>
      ) : (
        <form
          action={async (formData: FormData) => {
            setOutcome(await addFitmentAction(partId, formData));
          }}
          style={{ ...row, marginTop: primitive.space[2] }}
        >
          <Field label="Make" htmlFor={`make-${partId}`}>
            <TextInput id={`make-${partId}`} name="make" required />
          </Field>
          <Field label="Model" htmlFor={`model-${partId}`}>
            <TextInput id={`model-${partId}`} name="model" required />
          </Field>
          <Field label="From year" htmlFor={`from-${partId}`}>
            <TextInput id={`from-${partId}`} name="yearFrom" inputMode="numeric" required />
          </Field>
          <Field label="To year" htmlFor={`to-${partId}`} hint="Blank means still current">
            <TextInput id={`to-${partId}`} name="yearTo" inputMode="numeric" />
          </Field>
          <SubmitButton>Add vehicle</SubmitButton>
        </form>
      )}
      <Outcome outcome={outcome} />
    </div>
  );
}
