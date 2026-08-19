import { Suspense } from 'react';
import Link from 'next/link';
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
        // 🔴 THIS USED TO SAY "vehicles are added from Fleet Assets", WHICH WAS
        // A CONTROL THAT DOES NOT EXIST. Codex caught it: this slice ships a
        // vehicle LIST and no create route, so the sentence sent a reader
        // looking for a button that is not there — an empty state that invents
        // its own way out is worse than one that admits there is none.
        //
        // Said plainly instead, with the thing that IS reachable named.
        description="Adding a vehicle is not built in this workspace yet — vehicle records are created by the workshop that takes the vehicle in. Once a vehicle is on file here you can raise service requests against it."
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
          <Field label="Full name" htmlFor="fullName" required>
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
              ? // ⚠️ NOT "add a vehicle first" — there is no create route in this
                // slice, so that would name an unreachable action. Codex, LOW.
                'Your fleet has no vehicles on file yet, so there is nothing to send. Vehicle records are created by the workshop that takes a vehicle in.'
              : 'No workshop has published a directory entry yet, so there is nobody to send a vehicle to.'
          }
        />
      </div>
    );
  }

  return (
    <div style={panel}>
      <FormShell action={raiseServiceRequestAction} successPrefix="The request is">
        <Field label="Vehicle" htmlFor="vehicleId" required>
          <Select
            id="vehicleId"
            name="vehicleId"
            options={vehicles.data.map((v) => ({
              value: v.id,
              label: `${v.registrationNumber} — ${[v.make, v.model].filter(Boolean).join(' ') || 'vehicle'}`,
            }))}
          />
        </Field>
        <Field label="Workshop" htmlFor="workshopDirectoryId" required>
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
        <Field label="Summary" htmlFor="summary" required>
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
          {/* ⚠️ `max` MATCHES THE API's `z.number().max(9999999)`. An eight-digit
              reading used to pass this form's own validation and then be
              refused by the API — two validators disagreeing, which reads to
              the person who typed a correct number as a server fault. */}
          <input
            id="odometerKm"
            name="odometerKm"
            type="number"
            min={0}
            max={9999999}
            step={1}
          />
        </Field>
        <SubmitButton>Send to the workshop</SubmitButton>
      </FormShell>
    </div>
  );
}

export type RequestFilter = 'all' | 'appointments' | 'in_progress' | 'completed';

/**
 * 🔴 ONE STATUS PER VIEW, AND THAT IS A CORRECTION.
 *
 * The first version defined an appointment as "a request with a preferred date
 * that has not finished", which included a **submitted** request — one the
 * workshop has not even seen yet. Codex, 2026-08-19: *"turning a fleet
 * preference into a booking."* Exactly right. `preferredDate` is what the FLEET
 * asked for; nothing in this model is a date a workshop CONFIRMED, so no filter
 * over it can honestly be called an appointment.
 *
 * It also put `accepted` under "Repairs in Progress", where a job nobody has
 * started yet does not belong.
 *
 * So each view is now exactly one status, and the title means what it says:
 *   · accepted    — the workshop has agreed to do it. Booked in.
 *   · in_progress — they have started.
 *   · completed   — they have finished.
 *
 * ⚠️ AND NOTHING IS LOST. `submitted`, `declined` and `cancelled` appear in
 * Service Requests, which shows everything — so no request is invisible in all
 * four screens.
 *
 * ▶ A REAL appointment needs a workshop-CONFIRMED date, which the schema does
 *   not carry. That is a follow-up, not something to fake with a filter.
 */
const FILTERS: Record<RequestFilter, (r: ServiceRequest) => boolean> = {
  all: () => true,
  appointments: (r) => r.status === 'accepted',
  in_progress: (r) => r.status === 'in_progress',
  completed: (r) => r.status === 'completed',
};

/**
 * ⚠️ EVERY ONE OF THESE NAMES SOMETHING THE READER CAN ACTUALLY REACH.
 *
 * Codex found three that did not: they described how rows eventually appear and
 * left the person on an empty screen with nowhere to go. A refusal or an empty
 * state with no reachable next action is the most expensive defect class
 * recorded in this repository, and an empty state is where it is easiest to
 * commit by accident.
 */
const EMPTY: Record<RequestFilter, { title: string; description: string; href?: string; hrefLabel?: string }> = {
  all: {
    title: 'No service requests yet',
    description: 'Use the form above to ask a workshop to look at one of your vehicles.',
  },
  appointments: {
    title: 'Nothing is booked in',
    description:
      'A request appears here once a workshop ACCEPTS it. Raise one and they will accept or decline.',
    href: '/fleet/service-management/service-requests',
    hrefLabel: 'Go to Service Requests',
  },
  in_progress: {
    title: 'Nothing is in the workshop',
    description:
      'A request appears here once a workshop has started the work, and stays until they mark it completed.',
    href: '/fleet/service-management/service-requests',
    hrefLabel: 'Go to Service Requests',
  },
  completed: {
    title: 'No completed repairs yet',
    description: 'Work a workshop has marked completed appears here, with what was asked.',
    href: '/fleet/service-management/service-requests',
    hrefLabel: 'Go to Service Requests',
  },
};

export async function RequestRows({ filter }: { filter: RequestFilter }) {
  const result = await apiGet<ServiceRequest[]>('fleet', '/fleet/service-requests');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="fleet" />;

  const rows = result.data.filter(FILTERS[filter]);
  if (rows.length === 0) {
    const e = EMPTY[filter];
    return (
      <>
        <EmptyState title={e.title} description={e.description} />
        {e.href ? (
          <p style={{ marginTop: primitive.space[4] }}>
            <Link href={e.href}>{e.hrefLabel}</Link>
          </p>
        ) : null}
      </>
    );
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
