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
import { createBayAction } from './reception-actions';

/**
 * SERVICE BAYS — where the car physically goes. Slice 2.
 *
 * ONE screen at TWO routes (§34 `/workshop-floor/service-bays`, §46
 * `/workshop-management/service-bays`).
 *
 * ── ⚠️ A BAY IS RETIRED, NEVER DELETED ─────────────────────────────────────
 *
 * `core.service_bays` carries no DELETE grant at all. A bay that closes still
 * appears on every past appointment, and removing the row would orphan history
 * somebody may need to answer a question about a job from last year. The screen
 * therefore offers "retire", and says so rather than looking like a delete that
 * failed.
 *
 * ── ⚠️ CREATING A BAY IS NARROWER THAN BOOKING ONE ─────────────────────────
 *
 * Reception assigns a car to a bay all day; deciding this workshop HAS a paint
 * booth is a change to the business. `mayConfigureBays` gives that to the owner
 * and the manager, and the API refuses anyone else whatever this form sends.
 * Rendering the form is a UI decision; refusing the write is an authorization
 * one, and they live in different places on purpose (CLAUDE.md §8).
 */

interface BayRow {
  id: string;
  name: string;
  bayType: string;
  notes: string | null;
  isActive: boolean;
}

/** Mirrors migration 041's CHECK. The API refuses anything else. */
const BAY_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'lift', label: 'Lift' },
  { value: 'alignment', label: 'Wheel alignment' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'bodywork', label: 'Bodywork' },
  { value: 'paint', label: 'Paint booth' },
  { value: 'wash', label: 'Wash' },
  { value: 'inspection', label: 'Inspection' },
];

export async function ServiceBaysScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Service Bays');
  const bays = await apiGet<BayRow[]>('workshop', '/service-bays?includeRetired=true');

  const header = (
    <PageHeader
      title={title}
      description="The physical bays this workshop has. Appointments are scheduled against them, and the diary shows a clash rather than refusing to double-book."
    />
  );

  if (!bays.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={bays.reason} workspaceId="workshop" />
      </>
    );
  }

  const active = bays.data.filter((b) => b.isActive).length;

  return (
    <>
      {header}

      {bays.data.length === 0 ? (
        <EmptyState
          title="No bays yet"
          description="Add the bays this workshop actually has. Until one exists, an appointment can be booked but not given a place to happen."
        />
      ) : (
        <DataTable
          caption="Service bays"
          summary={`${active} in use · ${bays.data.length} on record`}
          rowKey={(b) => b.id}
          rows={bays.data}
          columns={[
            { key: 'name', header: 'Bay', nowrap: true, cell: (b) => b.name },
            {
              key: 'type', header: 'Type',
              cell: (b) => BAY_TYPES.find((t) => t.value === b.bayType)?.label ?? b.bayType,
            },
            { key: 'notes', header: 'Notes', secondary: true, cell: (b) => b.notes ?? '—' },
            {
              key: 'status', header: 'Status',
              cell: (b) =>
                b.isActive ? (
                  <StatusBadge kind="complete" label="In use" />
                ) : (
                  // "Retired", not "deleted" — the row is deliberately still here.
                  <StatusBadge kind="draft" label="Retired" />
                ),
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Add a bay</h2>
      <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: 0 }}>
        Only the owner and the workshop manager can change what bays exist. A bay is
        retired rather than deleted, because past appointments still refer to it.
      </p>
      <FormShell action={createBayAction} successPrefix="Added">
        <Field label="Name" hint="What the workshop calls it — “Bay 3”, “Paint booth”." htmlFor="name">
          <TextInput id="name" name="name" required maxLength={120} />
        </Field>
        <Field label="Type" htmlFor="bayType">
          <Select id="bayType" name="bayType" options={BAY_TYPES} defaultValue="general" />
        </Field>
        <Field label="Notes" hint="Anything a person scheduling work should know." htmlFor="notes">
          <TextInput id="notes" name="notes" maxLength={1000} />
        </Field>
        <SubmitButton>Add the bay</SubmitButton>
      </FormShell>
    </>
  );
}
