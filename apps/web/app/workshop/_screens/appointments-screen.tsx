import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createAppointmentAction } from './reception-actions';

/**
 * THE DIARY — slice 2 of `COMPLETION_PLAN.md`.
 *
 * ONE screen at FOUR routes (§34 `/workshop-operations/appointments`, §46
 * `/customer-reception/appointments`, §47 `/requests-and-reception/appointments`,
 * §48 `/requests/appointments`). Booking a customer in is the same act whatever
 * the tree calls it; inventing four different screens so each menu label could
 * have its own would be four screens pretending to be different — the same
 * judgement `CreateJobCardScreen` made across five intake routes.
 *
 * ── ⚠️ BAY CLASHES ARE SHOWN, NOT PREVENTED ────────────────────────────────
 *
 * Migration 041 deliberately carries no exclusion constraint. A workshop
 * routinely double-books a bay knowing one job will run over, and a database
 * that REFUSES leaves reception writing it on paper — which is the failure this
 * product exists to remove. So the count comes back from the API and the screen
 * shows it; a person decides.
 *
 * ── ⚠️ AN APPOINTMENT IS NOT A JOB CARD ────────────────────────────────────
 *
 * Nothing here creates one. A booking that is cancelled or never turned up for
 * would otherwise inflate every queue, board and dashboard count in the product,
 * and "1 active job card" would stop meaning anything. The conversion happens
 * when the car actually arrives.
 */

interface AppointmentRow {
  id: string;
  customerName: string | null;
  registrationNumber: string | null;
  serviceSummary: string;
  scheduledFor: string;
  durationMinutes: number;
  bayName: string | null;
  assignedToName: string | null;
  status: string;
  bayClashes: number;
  cancellationReason: string | null;
}

interface CustomerOption { id: string; displayName: string }
interface VehicleOption { id: string; registrationNumber: string; customerName: string }
interface BayOption { id: string; name: string; bayType: string }
interface StaffOption { userId: string; displayName: string; roleName: string }

const STATUS_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  booked: 'active',
  confirmed: 'active',
  arrived: 'complete',
  converted: 'complete',
  no_show: 'attention',
  cancelled: 'blocked',
};

function when(iso: string): string {
  // `sv-SE` gives YYYY-MM-DD HH:mm with no locale guess. A diary with an
  // ambiguous 03/04/2026 in it is worse than no diary.
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** The window the screen draws: from the start of today, four weeks out. */
function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + 28 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function AppointmentsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Appointments');
  const { from, to } = defaultWindow();

  // Loaded together — none depends on another, so serialising would only be
  // slower.
  //
  // ⚠️ ONLY THE APPOINTMENT LIST MAY FAIL THE SCREEN. Customers, vehicles, bays
  // and staff feed the booking FORM; a role that can read the diary but not list
  // staff should still see the diary. Refusing to render everything because an
  // optional dropdown could not be filled is how a capability is taken away from
  // the role that uses it most — the lesson `CreateJobCardScreen` records.
  const [appointments, customers, vehicles, bays, staff] = await Promise.all([
    apiGet<AppointmentRow[]>(
      'workshop',
      `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
    apiGet<CustomerOption[]>('workshop', '/customers'),
    apiGet<VehicleOption[]>('workshop', '/vehicles'),
    apiGet<BayOption[]>('workshop', '/service-bays'),
    apiGet<StaffOption[]>('workshop', '/memberships'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="What is booked in over the next four weeks. An appointment is a promise to a customer, not a job card — the job card is opened when the car actually arrives."
    />
  );

  if (!appointments.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={appointments.reason} workspaceId="workshop" />
      </>
    );
  }

  const customerOptions = customers.ok ? customers.data : [];
  const bookingForm =
    customerOptions.length === 0 ? (
      // A dead end, named, with the step that fixes it. `customer_id` is NOT
      // NULL, so an empty dropdown is not an empty form — it is a form that
      // cannot be submitted.
      <EmptyState
        title="Register a customer before booking"
        description="An appointment is booked against a customer on file, and none is registered yet. Register the customer first and they will appear here."
      />
    ) : (
      <FormShell action={createAppointmentAction} successPrefix="Booked">
        <Field label="Customer" htmlFor="customerId">
          <Select
            id="customerId"
            name="customerId"
            required
            options={customerOptions.map((c) => ({ value: c.id, label: c.displayName }))}
          />
        </Field>
        <Field
          label="Vehicle"
          hint="Optional. A customer often books a service before the workshop has their vehicle on file."
          htmlFor="vehicleId"
        >
          <Select
            id="vehicleId"
            name="vehicleId"
            options={[
              { value: '', label: 'Not known yet' },
              ...(vehicles.ok
                ? vehicles.data.map((v) => ({
                    value: v.id,
                    label: `${v.registrationNumber} — ${v.customerName}`,
                  }))
                : []),
            ]}
          />
        </Field>
        <Field label="What is it for" htmlFor="serviceSummary">
          <TextInput id="serviceSummary" name="serviceSummary" required maxLength={1000} />
        </Field>
        <Field label="When" htmlFor="scheduledFor">
          <TextInput id="scheduledFor" name="scheduledFor" type="datetime-local" required />
        </Field>
        <Field label="How long (minutes)" hint="An estimate, not a promise." htmlFor="durationMinutes">
          <TextInput
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={1440}
            defaultValue={60}
          />
        </Field>
        <Field
          label="Bay"
          hint="Optional. Two jobs can share a bay — the diary shows the clash rather than refusing it."
          htmlFor="bayId"
        >
          <Select
            id="bayId"
            name="bayId"
            options={[
              { value: '', label: 'Not assigned' },
              ...(bays.ok ? bays.data.map((b) => ({ value: b.id, label: `${b.name} (${b.bayType})` })) : []),
            ]}
          />
        </Field>
        <Field label="Technician" hint="Optional." htmlFor="assignedTo">
          <Select
            id="assignedTo"
            name="assignedTo"
            options={[
              { value: '', label: 'Not assigned' },
              ...(staff.ok
                ? staff.data
                    .filter((s) => s.roleName === 'technician')
                    .map((s) => ({ value: s.userId, label: s.displayName }))
                : []),
            ]}
          />
        </Field>
        <Field label="Contact number" htmlFor="contactPhone">
          <TextInput id="contactPhone" name="contactPhone" maxLength={40} />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <TextInput id="notes" name="notes" maxLength={2000} />
        </Field>
        <SubmitButton>Book the appointment</SubmitButton>
      </FormShell>
    );

  return (
    <>
      {header}

      {appointments.data.length === 0 ? (
        <EmptyState
          title="Nothing booked in the next four weeks"
          description="Appointments booked here appear on the workshop calendar and on the diary for every front-desk role."
        />
      ) : (
        <DataTable
          caption="Appointments"
          summary={`${appointments.data.length} in the next four weeks`}
          rowKey={(a) => a.id}
          rows={appointments.data}
          columns={[
            { key: 'when', header: 'When', nowrap: true, numeric: true,
              cell: (a) => `${when(a.scheduledFor)} · ${a.durationMinutes}m` },
            { key: 'customer', header: 'Customer', cell: (a) => a.customerName ?? '—' },
            { key: 'vehicle', header: 'Vehicle', nowrap: true,
              cell: (a) => a.registrationNumber ?? 'Not known yet' },
            { key: 'what', header: 'For', cell: (a) => a.serviceSummary },
            {
              key: 'bay', header: 'Bay', secondary: true,
              // The clash is NAMED in the cell rather than shown as a warning
              // icon: it is a decision for a person, not an error to fix.
              cell: (a) =>
                a.bayName === null
                  ? 'Not assigned'
                  : a.bayClashes > 0
                    ? `${a.bayName} — ${a.bayClashes} other booking${a.bayClashes === 1 ? '' : 's'} at this time`
                    : a.bayName,
            },
            { key: 'who', header: 'Technician', secondary: true,
              cell: (a) => a.assignedToName ?? 'Not assigned' },
            {
              key: 'status', header: 'Status',
              cell: (a) => (
                <StatusBadge kind={STATUS_TONE[a.status] ?? 'draft'} label={a.status.replace('_', ' ')} />
              ),
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Book an appointment</h2>
      {bookingForm}
    </>
  );
}
