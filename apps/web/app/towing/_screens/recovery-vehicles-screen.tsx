import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, DataTable } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { AVAILABILITY_BADGE, Badge, grid, humanise } from './shared';
import { addVehicleAction } from './towing-actions';

export const dynamic = 'force-dynamic';

export interface RecoveryVehicle {
  id: string;
  registration: string;
  label: string;
  vehicleType: string;
  capacityKg: number | null;
  status: string;
  notes: string | null;
}

/** `/operations/recovery-vehicles` — the fleet, and the only place a truck is added. */
export function RecoveryVehiclesScreen() {
  return (
    <>
      <PageHeader
        title="Recovery Vehicles"
        description="The fleet, what each truck can lift, and which are free."
      />
      <div style={grid}>
        <AddVehicle />
        <Suspense fallback={<LoadingState label="Loading the fleet…" />}>
          <Rows />
        </Suspense>
      </div>
    </>
  );
}

const TYPES = ['flatbed', 'wheel_lift', 'heavy_wrecker', 'service_van'];

function AddVehicle() {
  return (
    <details style={panel}>
      <summary style={summaryStyle}>Add a recovery vehicle</summary>
      <form action={addVehicleAction} style={formRow}>
        <Labelled label="Registration">
          <input name="registration" required maxLength={40} style={control} />
        </Labelled>
        <Labelled label="Name on the board">
          <input name="label" required maxLength={120} style={control} />
        </Labelled>
        <Labelled label="Type">
          <select name="vehicleType" style={control} defaultValue="flatbed">
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Capacity (kg)">
          <input name="capacityKg" type="number" min={1} step={1} style={control} />
        </Labelled>
        <button type="submit" style={submit}>
          Add vehicle
        </button>
      </form>
    </details>
  );
}

async function Rows() {
  const result = await apiGet<RecoveryVehicle[]>('towing', '/towing/vehicles');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No recovery vehicles yet"
        description="Add the first truck above. The dispatch board needs one available before a call can go out."
      />
    );
  }

  return (
    <DataTable
      caption="Recovery vehicles"
      summary={`${result.data.length} in the fleet`}
      rows={result.data}
      rowKey={(v) => v.id}
      columns={[
        { key: 'label', header: 'Truck', cell: (v) => v.label },
        { key: 'reg', header: 'Registration', nowrap: true, cell: (v) => v.registration },
        { key: 'type', header: 'Type', nowrap: true, cell: (v) => humanise(v.vehicleType) },
        {
          key: 'cap',
          header: 'Capacity',
          numeric: true,
          nowrap: true,
          cell: (v) => (v.capacityKg === null ? '—' : `${v.capacityKg} kg`),
        },
        {
          key: 'status',
          header: 'Status',
          nowrap: true,
          cell: (v) => <Badge map={AVAILABILITY_BADGE} value={v.status} />,
        },
      ]}
    />
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: primitive.space[1] }}>
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
      {children}
    </label>
  );
}

const panel: React.CSSProperties = {
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.lg,
  padding: primitive.space[3],
};
const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 600,
  color: themeVar.textPrimary,
};
const formRow: React.CSSProperties = {
  display: 'flex',
  gap: primitive.space[2],
  flexWrap: 'wrap',
  alignItems: 'end',
  marginTop: primitive.space[3],
};
const control: React.CSSProperties = {
  height: '2.25rem',
  padding: `0 ${primitive.space[2]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
};
const submit: React.CSSProperties = {
  ...control,
  cursor: 'pointer',
  fontWeight: 600,
  borderColor: themeVar.textPrimary,
};
