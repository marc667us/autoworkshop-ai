import {
  ApiFailure,
  apiGet,
} from '@autoworkshop/next-shell';
import {
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { createJobCardAction } from './register-actions';

/**
 * OPEN A JOB CARD — the workshop's own front door into the repair workflow.
 *
 * ── 🔴 THE GAP THIS CLOSES ──────────────────────────────────────────────────
 *
 * `POST /job-cards` has been complete since Phase 5 and
 * `JobCardService.CAN_CREATE_JOB` has always admitted `workshop_owner`,
 * `workshop_manager` and `reception_staff`. A repo-wide search for callers on
 * 2026-08-05 found exactly ONE — `customer-web`'s "report a problem" screen.
 *
 * So the job card, the object this entire application is built around, could
 * only be created by a CUSTOMER, from a different app. A walk-in at the counter
 * could not be booked in at all. Every downstream screen — the staging board,
 * the queues, inspection, diagnosis, the whole spine — was reachable only for
 * work a customer had reported themselves.
 *
 * Third instance of "a complete service with no reachable caller" in this
 * repository, after `grant()` and `link_sponsor_user()`. The tell is identical
 * every time: the service has tests, they pass, and they call it directly
 * rather than through anything a person can reach.
 *
 * ── ⚠️ THE PERMISSION CHECK IS NOT HERE ─────────────────────────────────────
 *
 * `CAN_CREATE_JOB` is enforced in the service and the API refuses a role that
 * may not open a card, whatever this form sends. Rendering the form is a UI
 * decision; refusing the write is an authorization decision, and they live in
 * different places on purpose (CLAUDE.md §8 — hidden is not secure).
 */

interface VehicleOption {
  id: string;
  registrationNumber: string;
  customerName: string;
  make: string;
  model: string | null;
  modelYear: number | null;
}

interface StaffOption {
  userId: string;
  displayName: string;
  roleName: string;
}

/** `job-card.service.ts` PRIORITIES. Mirrored, because the API rejects anything else. */
const PRIORITIES = [
  { value: 'low', label: 'Low — can wait' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High — customer waiting' },
  { value: 'urgent', label: 'Urgent — vehicle unsafe or immobile' },
];

export async function CreateJobCardScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Create Job Card');

  // Loaded together — neither depends on the other, so serialising them would
  // only make the page slower.
  //
  // ⚠️ THE STAFF LIST IS ALLOWED TO FAIL. Assigning a technician is optional,
  // and `/memberships` is admin-gated for some roles — a receptionist who may
  // open a job card may not be able to list staff. Refusing to render the whole
  // form because an OPTIONAL field's options could not be loaded would take the
  // capability away from exactly the role that uses it most.
  const [vehicles, staff] = await Promise.all([
    apiGet<VehicleOption[]>('workshop', '/vehicles'),
    apiGet<StaffOption[]>('workshop', '/memberships'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Open a job card against a vehicle already on file. The complaint is the customer's own description of the fault — record it in their words."
    />
  );

  if (!vehicles.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={vehicles.reason} workspaceId="workshop" />
      </>
    );
  }

  // A job card cannot exist without a vehicle — `vehicle_id` is NOT NULL — so an
  // empty list is a dead end, not an empty dropdown. Saying so, and naming the
  // step that fixes it, beats rendering a form that cannot be submitted.
  if (vehicles.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Register a vehicle first"
          description="A job card is opened against a vehicle, and none is on file yet. Register the customer, then their vehicle, then come back here."
        />
      </>
    );
  }

  // Only technicians can be assigned work. Offering the whole staff list would
  // invite assigning a repair to the receptionist, and the API would refuse it
  // after the form had already been filled in.
  const technicians = staff.ok ? staff.data.filter((s) => s.roleName === 'technician') : [];

  return (
    <>
      {header}
      <FormShell
        action={createJobCardAction}
        successPrefix="Opened job card"
        successHref={{ href: '/workshop-floor/job-cards', label: 'View the job card list' }}
      >
        <Field
          label="Vehicle"
          hint="Only vehicles registered to this organisation are listed. The owner is shown beside each one."
          htmlFor="vehicleId"
        >
          <Select
            id="vehicleId"
            name="vehicleId"
            required
            options={vehicles.data.map((v) => ({
              value: v.id,
              // Plate FIRST — it is what is written on the key fob, said on the
              // phone and painted on the windscreen. The owner disambiguates the
              // two Corollas; the make and year confirm the right car.
              label:
                `${v.registrationNumber} — ${v.customerName}` +
                ` (${v.make}${v.model ? ` ${v.model}` : ''}${v.modelYear ? ` ${v.modelYear}` : ''})`,
            }))}
          />
        </Field>

        <Field
          label="Complaint"
          hint="What the customer says is wrong, in their words. “Knocking over bumps, worse when cold” is worth more to the technician than “suspension”."
          htmlFor="complaint"
        >
          {/*
            A TEXTAREA, not a single-line input. The API accepts 4000 characters
            and this is the one field a technician actually reads before touching
            the vehicle; a one-line box teaches people to write "brakes".
          */}
          <textarea
            id="complaint"
            name="complaint"
            required
            rows={4}
            maxLength={4000}
            style={{
              width: '100%',
              padding: `${primitive.space[2]} ${primitive.space[3]}`,
              border: '1px solid var(--aw-border-default)',
              borderRadius: primitive.radius.md,
              background: 'var(--aw-surface-raised)',
              color: 'var(--aw-text-primary)',
              fontSize: primitive.fontSize.base,
              // Without this a textarea falls back to the UA's monospace default
              // and reads as a code editor in the middle of a form.
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </Field>

        <Field
          label="Priority"
          hint="Leave as Normal unless the vehicle is unsafe or the customer is waiting."
          htmlFor="priority"
        >
          <Select id="priority" name="priority" defaultValue="normal" options={PRIORITIES} />
        </Field>

        <Field
          label="Mileage at intake"
          hint="Optional. The odometer reading when the vehicle came in — it dates the work for warranty and service history."
          htmlFor="mileageAtIntake"
        >
          <TextInput
            id="mileageAtIntake"
            name="mileageAtIntake"
            type="number"
            min={0}
            max={10000000}
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Expected completion"
          hint="Optional. What the customer has been told — it is what the delayed-jobs view measures against."
          htmlFor="expectedCompletionOn"
        >
          <TextInput id="expectedCompletionOn" name="expectedCompletionOn" type="date" />
        </Field>

        {/*
          ⚠️ RENDERED ONLY WHEN THERE IS SOMEBODY TO ASSIGN. An empty dropdown
          labelled "Technician" reads as a broken control; the absence of the
          field, with the sentence below it, is honest about why. And the field is
          optional either way — reception books the car in, the floor decides who
          works on it.
        */}
        {technicians.length > 0 ? (
          <Field
            label="Assign to"
            hint="Optional. Leave unassigned and the job appears in the queue for the floor to pick up."
            htmlFor="assignedTechnicianId"
          >
            <Select
              id="assignedTechnicianId"
              name="assignedTechnicianId"
              options={[
                { value: '', label: 'Leave unassigned' },
                ...technicians.map((t) => ({ value: t.userId, label: t.displayName })),
              ]}
            />
          </Field>
        ) : (
          <p style={{ color: 'var(--aw-text-secondary)', fontSize: primitive.fontSize.sm, margin: 0 }}>
            {staff.ok
              ? 'No technicians are on the staff list yet, so this job will start unassigned. Add staff under Workshop Management.'
              : 'The staff list could not be loaded, so this job will start unassigned. It can be assigned from the job card afterwards.'}
          </p>
        )}

        <SubmitButton>Open the job card</SubmitButton>
      </FormShell>
    </>
  );
}
