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
import { addMaintenanceAction } from './selfservice-actions';

/**
 * MAINTENANCE SCHEDULE — slice 9.
 *
 * 🔴 "DUE" IS COMPUTED, NEVER STORED. The API compares each item against the
 * VEHICLE'S CURRENT MILEAGE and today's date on every read. A stored `is_due`
 * flag goes stale the instant a mileage is recorded, and would tell a customer
 * a service is not due when it is — the same "counter that drifts" refusal
 * slices 3 and 4 both made about money and stock.
 *
 * ⚠️ A MILEAGE-BASED ITEM ON A VEHICLE WITH NO RECORDED MILEAGE CAN NEVER COME
 * DUE, and this screen says so rather than showing it as comfortably in the
 * future. Silence there would be a reminder that looks like cover and is not.
 *
 * 🔴 `'customer'`, NOT `'workshop'` — the workspace id local testing cannot
 * catch, because `:3000` and `:3001` share one cookie jar.
 */

interface MaintenanceRow {
  id: string;
  vehicleId: string;
  registrationNumber: string | null;
  item: string;
  dueAtKm: number | null;
  dueOn: string | null;
  lastDoneKm: number | null;
  lastDoneOn: string | null;
  currentMileageKm: number | null;
  isDue: boolean;
  notes: string | null;
}

interface VehicleOption { id: string; registrationNumber: string | null }

function due(r: MaintenanceRow) {
  if (r.isDue) return <StatusBadge kind="attention" label="Due now" />;
  // The honest case: an item that can never fire, said out loud.
  if (r.dueOn === null && r.dueAtKm !== null && r.currentMileageKm === null) {
    return <StatusBadge kind="blocked" label="No mileage recorded" />;
  }
  return <StatusBadge kind="complete" label="Not yet" />;
}

function target(r: MaintenanceRow): string {
  const parts: string[] = [];
  if (r.dueAtKm !== null) parts.push(`${r.dueAtKm.toLocaleString()} km`);
  if (r.dueOn !== null) parts.push(r.dueOn);
  return parts.join(' or ');
}

export async function MaintenanceScheduleScreen({ route }: { route: string }) {
  const [items, vehicles] = await Promise.all([
    apiGet<MaintenanceRow[]>('customer', '/self-service/maintenance'),
    apiGet<VehicleOption[]>('customer', '/vehicles'),
  ]);

  const header = (
    <PageHeader
      title="Maintenance Schedule"
      description="What each of your vehicles is due for, and when. Mileage-based items are measured against the mileage the workshop last recorded."
    />
  );

  if (!items.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={items.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={addMaintenanceAction} successPrefix="Saved">
      <Field label="Vehicle" htmlFor="vehicleId">
        <Select
          id="vehicleId"
          name="vehicleId"
          required
          options={
            vehicles.ok
              ? vehicles.data.map((v) => ({ value: v.id, label: v.registrationNumber ?? 'Vehicle' }))
              : []
          }
        />
      </Field>
      <Field label="What is due" htmlFor="item">
        <TextInput id="item" name="item" required maxLength={300} />
      </Field>
      <Field
        label="Due at mileage (km)"
        htmlFor="dueAtKm"
        hint="Give a mileage, a date, or both. Neither means the reminder can never fire."
      >
        <TextInput id="dueAtKm" name="dueAtKm" type="number" min={1} step={1} />
      </Field>
      <Field label="Due on" htmlFor="dueOn">
        <TextInput id="dueOn" name="dueOn" type="date" />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <TextInput id="notes" name="notes" maxLength={2000} />
      </Field>
      <SubmitButton>Add to schedule</SubmitButton>
    </FormShell>
  );

  if (items.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing is scheduled"
          description="Adding a service item here means both you and the workshop can see what is coming up, rather than remembering it."
        />
        {form}
      </>
    );
  }

  const dueNow = items.data.filter((i) => i.isDue).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${items.data.length} items · ${dueNow} due now`}
        rows={items.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'item', header: 'Service', cell: (r) => r.item },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'target', header: 'Due at', nowrap: true, cell: (r) => target(r) },
          {
            key: 'now',
            header: 'Current mileage',
            numeric: true,
            nowrap: true,
            cell: (r) =>
              r.currentMileageKm === null ? 'not recorded' : r.currentMileageKm.toLocaleString(),
          },
          {
            key: 'last',
            header: 'Last done',
            nowrap: true,
            cell: (r) =>
              r.lastDoneOn ?? (r.lastDoneKm === null ? '—' : `${r.lastDoneKm.toLocaleString()} km`),
          },
          { key: 'state', header: 'Status', cell: (r) => due(r) },
        ]}
      />
      {form}
    </>
  );
}
