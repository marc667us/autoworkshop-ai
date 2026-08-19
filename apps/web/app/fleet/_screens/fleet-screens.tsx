import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
} from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { addFleetDriverAction, raiseServiceRequestAction } from './fleet-actions';

/**
 * The fleet workspace — slice 20, over migration 087 and ADR-023.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 EVERY SCREEN HERE READS REAL DATA. NONE IS A PLACEHOLDER.
 *
 * The fleet tree advertised 29 entries and 1 worked. The rule this repository
 * enforces mechanically (`planned-workshop.spec.ts`, and item 12 of the
 * completion plan) is that a slice is not done while its screen still shows a
 * "what you can do instead" panel — so nothing here renders unless there is an
 * endpoint behind it. Screens whose data layer does not exist yet are
 * deliberately NOT built rather than stubbed.
 *
 * ⚠️ THE THREE FILTERED VIEWS ARE VIEWS, NOT NEW TABLES. Appointments,
 * Repairs in Progress and Completed Repairs are one dataset —
 * `GET /fleet/service-requests` — sliced by status. They are honest screens
 * because the filter is meaningful to a fleet manager, and they are not a
 * second source of truth.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  registrationNumber: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  currentMileageKm: number | null;
  insuranceExpiresOn: string | null;
  status: string;
}

interface Driver {
  id: string;
  fullName: string;
  licenceNumber: string | null;
  licenceExpiresOn: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

interface ServiceRequest {
  id: string;
  reference: string;
  vehicleRegistration: string;
  vehicleDescription: string | null;
  workshopName: string;
  requestType: string;
  summary: string;
  detail: string | null;
  priority: string;
  preferredDate: string | null;
  odometerKm: number | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

interface Workshop {
  directoryId: string;
  tradingName: string;
  city: string;
  country: string;
}

const panel: React.CSSProperties = {
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.xl,
  padding: primitive.space[5],
  marginBottom: primitive.space[6],
};

/** A date the fleet typed, or nothing. Never "—" for a date nobody set. */
function day(v: string | null): string {
  return v ?? '—';
}

/**
 * Status → badge, using `StatusKind`'s OWN vocabulary.
 *
 * ⚠️ THE KIND LIST IS FIXED (`active | draft | complete | attention | blocked`)
 * and inventing a value is a compile error, which is how it should be — a badge
 * that reads differently from every other status in the product is worse than
 * no badge. `declined` is `blocked` because it is the one state that needs the
 * fleet to do something.
 */
function requestBadge(status: string) {
  switch (status) {
    case 'completed':
      return <StatusBadge kind="complete" label="Completed" />;
    case 'in_progress':
      return <StatusBadge kind="active" label="In progress" />;
    case 'accepted':
      return <StatusBadge kind="active" label="Accepted" />;
    case 'declined':
      return <StatusBadge kind="blocked" label="Declined" />;
    case 'cancelled':
      return <StatusBadge kind="draft" label="Cancelled" />;
    case 'draft':
      return <StatusBadge kind="draft" label="Draft" />;
    default:
      return <StatusBadge kind="attention" label="Awaiting the workshop" />;
  }
}

/* ────────────────────────────── VEHICLES ────────────────────────────── */

export function FleetVehiclesScreen() {
  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Your fleet. These are ordinary vehicle records — the same ones a workshop sees when you send one in."
      />
      <Suspense fallback={<LoadingState label="Loading the fleet…" />}>
        <VehicleRows />
      </Suspense>
    </>
  );
}

async function VehicleRows() {
  const result = await apiGet<Vehicle[]>('fleet', '/fleet/vehicles');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="fleet" />;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No vehicles yet"
        // 🔴 NAMES WHERE VEHICLES COME FROM. An empty state that does not say
        // what to do next is a dead end, which is the defect class this
        // repository has recorded most expensively.
        description="Vehicles are added from Fleet Assets once your depot records them. A vehicle must exist here before you can send it to a workshop."
      />
    );
  }
  return (
    <DataTable<Vehicle>
      caption="Fleet vehicles"
      rowKey={(v) => v.id}
      rows={result.data}
      summary={`${result.data.length} vehicle${result.data.length === 1 ? '' : 's'}`}
      columns={[
        { key: 'reg', header: 'Registration', cell: (v) => v.registrationNumber },
        {
          key: 'vehicle',
          header: 'Vehicle',
          cell: (v) => [v.make, v.model, v.modelYear].filter(Boolean).join(' ') || '—',
        },
        {
          key: 'mileage',
          header: 'Odometer',
          numeric: true,
          cell: (v) => (v.currentMileageKm === null ? '—' : `${v.currentMileageKm} km`),
        },
        { key: 'insurance', header: 'Insured to', cell: (v) => day(v.insuranceExpiresOn) },
        {
          key: 'status',
          header: 'Status',
          cell: (v) =>
            v.status === 'active' ? (
              <StatusBadge kind="active" label="Active" />
            ) : (
              <StatusBadge kind="draft" label={v.status} />
            ),
        },
      ]}
    />
  );
}

/* ─────────────────────────────── DRIVERS ─────────────────────────────── */

export function FleetDriversScreen() {
  return (
    <>
      <PageHeader title="Drivers" description="Who drives your vehicles." />
      {/* The create form is ON the list screen — see `fleet-actions.ts` for
          why an "Add new" button pointing elsewhere renders nothing. */}
      <div style={panel}>
        <FormShell action={addFleetDriverAction} successPrefix="The driver is">
          <Field label="Full name" htmlFor="fullName">
            <input id="fullName" name="fullName" required maxLength={160} />
          </Field>
          <Field label="Licence number (optional)" htmlFor="licenceNumber">
            <input id="licenceNumber" name="licenceNumber" maxLength={60} />
          </Field>
          <Field label="Licence expires (optional)" htmlFor="licenceExpiresOn">
            <input id="licenceExpiresOn" name="licenceExpiresOn" type="date" />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone">
            <input id="phone" name="phone" maxLength={40} />
          </Field>
          <SubmitButton>Add driver</SubmitButton>
        </FormShell>
      </div>
      <Suspense fallback={<LoadingState label="Loading the roster…" />}>
        <DriverRows />
      </Suspense>
    </>
  );
}

async function DriverRows() {
  const result = await apiGet<Driver[]>('fleet', '/fleet/drivers');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="fleet" />;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No drivers yet"
        description="Add your first driver with the form above. Drivers are yours alone — a workshop you send a vehicle to never sees them."
      />
    );
  }
  return (
    <DataTable<Driver>
      caption="Fleet drivers"
      rowKey={(d) => d.id}
      rows={result.data}
      summary={`${result.data.length} driver${result.data.length === 1 ? '' : 's'}`}
      columns={[
        { key: 'name', header: 'Name', cell: (d) => d.fullName },
        { key: 'licence', header: 'Licence', cell: (d) => d.licenceNumber ?? '—' },
        { key: 'expires', header: 'Expires', cell: (d) => day(d.licenceExpiresOn) },
        { key: 'phone', header: 'Phone', cell: (d) => d.phone ?? '—' },
        {
          key: 'status',
          header: 'Status',
          cell: (d) =>
            d.status === 'active' ? (
              <StatusBadge kind="active" label="Active" />
            ) : (
              <StatusBadge kind="draft" label={d.status} />
            ),
        },
      ]}
    />
  );
}

/* ───────────────────────── APPROVED WORKSHOPS ────────────────────────── */

export function FleetWorkshopsScreen() {
  return (
    <>
      <PageHeader
        title="Approved Workshops"
        description="Workshops listed in the public directory. These are the workshops you can send a vehicle to."
      />
      <Suspense fallback={<LoadingState label="Loading workshops…" />}>
        <WorkshopRows />
      </Suspense>
    </>
  );
}

async function WorkshopRows() {
  const result = await apiGet<Workshop[]>('fleet', '/fleet/workshops');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="fleet" />;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No workshops are listed yet"
        // ⚠️ EXPLAINS THE MECHANISM, because "none" here is not a fault. A
        // workshop appears only when IT chooses to publish a directory entry —
        // ADR-023 decision 2 — so there is nothing the fleet can do to fix it.
        description="A workshop appears here once it publishes a public directory entry. Until one does, there is nobody to send a vehicle to."
      />
    );
  }
  return (
    <DataTable<Workshop>
      caption="Workshops in the public directory"
      rowKey={(w) => w.directoryId}
      rows={result.data}
      summary={`${result.data.length} workshop${result.data.length === 1 ? '' : 's'}`}
      columns={[
        { key: 'name', header: 'Workshop', cell: (w) => w.tradingName },
        { key: 'city', header: 'City', cell: (w) => w.city },
        { key: 'country', header: 'Country', cell: (w) => w.country },
      ]}
    />
  );
}

/* ────────────────────────── SERVICE REQUESTS ─────────────────────────── */

export function FleetServiceRequestsScreen() {
  return (
    <>
      <PageHeader
        title="Service Requests"
        description="Work you have asked a workshop to do. The workshop accepts or declines each one."
      />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <RaiseRequestForm />
      </Suspense>
      <Suspense fallback={<LoadingState label="Loading requests…" />}>
        <RequestRows filter="all" />
      </Suspense>
    </>
  );
}

/**
 * The create form, which needs BOTH lists to be useful.
 *
 * 🔴 IT RENDERS ONLY WHEN THERE IS SOMETHING TO CHOOSE. A select with no
 * options is a form that cannot be submitted and does not say why — so when
 * either list is empty the panel explains which one, and what fixes it.
 */
async function RaiseRequestForm() {
  const [vehicles, workshops] = await Promise.all([
    apiGet<Vehicle[]>('fleet', '/fleet/vehicles'),
    apiGet<Workshop[]>('fleet', '/fleet/workshops'),
  ]);

  if (!vehicles.ok) return <ApiFailure reason={vehicles.reason} workspaceId="fleet" />;
  if (!workshops.ok) return <ApiFailure reason={workshops.reason} workspaceId="fleet" />;

  if (vehicles.data.length === 0 || workshops.data.length === 0) {
    return (
      <div style={panel}>
        <EmptyState
          title="You cannot raise a request yet"
          description={
            vehicles.data.length === 0
              ? 'Add a vehicle to your fleet first — there is nothing to send.'
              : 'No workshop has published a directory entry yet, so there is nobody to send a vehicle to.'
          }
        />
      </div>
    );
  }

  return (
    <div style={panel}>
      <FormShell action={raiseServiceRequestAction} successPrefix="The request is">
        <Field label="Vehicle" htmlFor="vehicleId">
          <Select
            id="vehicleId"
            name="vehicleId"
            options={vehicles.data.map((v) => ({
              value: v.id,
              label: `${v.registrationNumber} — ${[v.make, v.model].filter(Boolean).join(' ') || 'vehicle'}`,
            }))}
          />
        </Field>
        <Field label="Workshop" htmlFor="workshopDirectoryId">
          <Select
            id="workshopDirectoryId"
            name="workshopDirectoryId"
            options={workshops.data.map((w) => ({
              value: w.directoryId,
              label: `${w.tradingName} — ${w.city}`,
            }))}
          />
        </Field>
        <Field label="What is needed" htmlFor="requestType">
          <Select
            id="requestType"
            name="requestType"
            options={[
              { value: 'service', label: 'Routine service' },
              { value: 'repair', label: 'Repair' },
              { value: 'inspection', label: 'Inspection' },
              { value: 'diagnostic', label: 'Diagnostic' },
              { value: 'tyres', label: 'Tyres' },
              { value: 'bodywork', label: 'Bodywork' },
              { value: 'other', label: 'Something else' },
            ]}
          />
        </Field>
        <Field label="Summary" htmlFor="summary">
          <input id="summary" name="summary" required maxLength={300} />
        </Field>
        <Field label="Detail (optional)" htmlFor="detail">
          <textarea id="detail" name="detail" rows={3} maxLength={4000} />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select
            id="priority"
            name="priority"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'low', label: 'Low' },
              { value: 'high', label: 'High' },
              { value: 'vehicle_off_road', label: 'Vehicle off road' },
            ]}
          />
        </Field>
        <Field label="Preferred date (optional)" htmlFor="preferredDate">
          <input id="preferredDate" name="preferredDate" type="date" />
        </Field>
        <Field label="Odometer, km (optional)" htmlFor="odometerKm">
          <input id="odometerKm" name="odometerKm" inputMode="numeric" maxLength={8} />
        </Field>
        <SubmitButton>Send to the workshop</SubmitButton>
      </FormShell>
    </div>
  );
}

export type RequestFilter = 'all' | 'appointments' | 'in_progress' | 'completed';

const FILTERS: Record<RequestFilter, (r: ServiceRequest) => boolean> = {
  all: () => true,
  // An appointment is a request with a date the fleet asked for, that has not
  // finished. A completed job with a past preferred date is not an appointment.
  appointments: (r) =>
    r.preferredDate !== null && !['completed', 'cancelled', 'declined'].includes(r.status),
  in_progress: (r) => ['accepted', 'in_progress'].includes(r.status),
  completed: (r) => r.status === 'completed',
};

const EMPTY: Record<RequestFilter, { title: string; description: string }> = {
  all: {
    title: 'No service requests yet',
    description: 'Use the form above to ask a workshop to look at one of your vehicles.',
  },
  appointments: {
    title: 'Nothing is booked in',
    description:
      'An appointment appears here when you raise a request with a preferred date and the workshop has not finished it.',
  },
  in_progress: {
    title: 'Nothing is in the workshop',
    description:
      'A request appears here once a workshop has accepted it, and stays until they mark it completed.',
  },
  completed: {
    title: 'No completed repairs yet',
    description: 'Work a workshop has marked completed appears here, with what was asked.',
  },
};

export async function RequestRows({ filter }: { filter: RequestFilter }) {
  const result = await apiGet<ServiceRequest[]>('fleet', '/fleet/service-requests');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="fleet" />;

  const rows = result.data.filter(FILTERS[filter]);
  if (rows.length === 0) {
    const e = EMPTY[filter];
    return <EmptyState title={e.title} description={e.description} />;
  }

  return (
    <DataTable<ServiceRequest>
      caption="Service requests"
      rowKey={(r) => r.id}
      rows={rows}
      summary={`${rows.length} request${rows.length === 1 ? '' : 's'}`}
      columns={[
        { key: 'ref', header: 'Reference', cell: (r) => r.reference },
        { key: 'vehicle', header: 'Vehicle', cell: (r) => r.vehicleRegistration },
        { key: 'workshop', header: 'Workshop', cell: (r) => r.workshopName },
        {
          key: 'what',
          header: 'What',
          cell: (r) => (
            <>
              {r.summary}
              {r.declineReason ? (
                <>
                  <br />
                  {/* 🔴 THE DECLINE REASON IS SHOWN, ALWAYS. It is the fleet's
                      only way to learn why, and a refusal a person cannot read
                      is the most expensive defect class recorded here. */}
                  <span style={{ color: themeVar.textSecondary, fontSize: '0.8125rem' }}>
                    Declined: {r.declineReason}
                  </span>
                </>
              ) : null}
            </>
          ),
        },
        { key: 'when', header: 'Preferred', cell: (r) => day(r.preferredDate) },
        { key: 'status', header: 'Status', cell: (r) => requestBadge(r.status) },
      ]}
    />
  );
}

/** The three filtered views over the one dataset. */
export function FleetRequestView({
  filter,
  title,
  description,
}: {
  filter: RequestFilter;
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <RequestRows filter={filter} />
      </Suspense>
    </>
  );
}
