import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { requestTowingAction } from './my-towing-actions';

/**
 * RECOVERY — slice 13.
 *
 * ── 🔴 A RECOVERY REQUEST IS A SUPPORT CASE ────────────────────────────────
 *
 * There is no `towing_requests` table and deliberately so (migration 055): a
 * second table would be a second inbox for the workshop to watch and a second
 * answer to "what has this customer asked us for?". It is a `support.cases`
 * row with category `towing`, priority `urgent`, and the two facts a recovery
 * needs that a billing complaint does not — WHERE the vehicle is and WHAT
 * NUMBER to ring. The database enforces both.
 *
 * ⚠️ THERE IS NO TRUCK TRACKING, AND THE PAGE SAYS SO. The signpost promised
 * "tracks the truck". Nothing in this product knows where a recovery vehicle
 * is — there is no telematics feed and no driver app — so a map with a moving
 * icon would be fiction. What exists is a request the workshop can see and a
 * status they update, and that is what is shown.
 *
 * ⚠️ THE FORM IS FIRST, ABOVE THE HISTORY. Someone opening this page is
 * usually at the roadside. The list of past requests is not what they came for.
 */

interface MyTowingRow {
  id: string;
  reference: string;
  description: string;
  status: string;
  location: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface VehicleOption {
  id: string;
  registrationNumber: string | null;
}

function state(r: MyTowingRow) {
  if (r.status === 'resolved' || r.status === 'closed') {
    return <StatusBadge kind="complete" label="Done" />;
  }
  if (r.status === 'in_progress') return <StatusBadge kind="active" label="On the way" />;
  return <StatusBadge kind="attention" label="Requested" />;
}

export async function MyTowingScreen() {
  const [requests, vehicles] = await Promise.all([
    apiGet<MyTowingRow[]>('customer', '/my/towing'),
    apiGet<VehicleOption[]>('customer', '/vehicles'),
  ]);

  const header = (
    <PageHeader
      title="Recovery"
      description="Ask the workshop to recover a vehicle that cannot be driven. They see the request immediately — if the vehicle is somewhere unsafe, telephone them as well."
    />
  );

  const form = (
    <FormShell action={requestTowingAction} successPrefix="Requested">
      <Field
        label="Where is the vehicle?"
        htmlFor="location"
        hint="In your own words — a landmark is more use to a driver than a postcode."
      >
        <TextInput id="location" name="location" required maxLength={500} />
      </Field>
      <Field label="Number to ring" htmlFor="contactPhone" hint="Whoever will be with the vehicle.">
        <TextInput id="contactPhone" name="contactPhone" required maxLength={40} />
      </Field>
      <Field label="Which vehicle" htmlFor="vehicleId">
        <Select
          id="vehicleId"
          name="vehicleId"
          options={[
            { value: '', label: 'Not listed / another vehicle' },
            ...(vehicles.ok
              ? vehicles.data.map((v) => ({
                  value: v.id,
                  label: v.registrationNumber ?? 'Vehicle',
                }))
              : []),
          ]}
        />
      </Field>
      <Field label="What has happened" htmlFor="description">
        <TextInput id="description" name="description" required maxLength={2000} />
      </Field>
      <SubmitButton>Request recovery</SubmitButton>
    </FormShell>
  );

  if (!requests.ok) {
    return (
      <>
        {header}
        {/* The form still renders on a read failure — the request is the point
            of the page, and refusing to show it because a HISTORY list could
            not load would be the wrong thing to break. */}
        {form}
        <ApiFailure reason={requests.reason} workspaceId="customer" />
      </>
    );
  }

  return (
    <>
      {header}
      {form}
      {requests.data.length > 0 && (
        <DataTable
          caption={`${requests.data.length} recovery request${requests.data.length === 1 ? '' : 's'}`}
          rows={requests.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'ref', header: 'Reference', nowrap: true, cell: (r) => r.reference },
            { key: 'when', header: 'Requested', nowrap: true, cell: (r) => r.createdAt.slice(0, 10) },
            { key: 'where', header: 'Where', cell: (r) => r.location ?? '—' },
            { key: 'what', header: 'What happened', cell: (r) => r.description },
            {
              key: 'outcome',
              header: 'Outcome',
              cell: (r) => r.resolution ?? '—',
            },
            { key: 'state', header: 'Status', cell: (r) => state(r) },
          ]}
        />
      )}
    </>
  );
}
