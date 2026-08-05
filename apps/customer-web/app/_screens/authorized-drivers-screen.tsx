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
import { addDriverAction } from './selfservice-actions';
import { WithdrawDriver } from './withdraw-driver';

/**
 * AUTHORIZED DRIVERS — slice 9.
 *
 * ── 🔴 THREE SEPARATE PERMISSIONS, AND "APPROVE WORK" DEFAULTS TO OFF ──────
 *
 * Someone trusted to drop a car off is not thereby trusted to approve a bill.
 * Collapsing these into one "authorised" flag would mean every person a
 * customer names to collect their car could also commit them to spending money.
 * The default is off in this form, in the request schema, and in the column.
 *
 * ── ⚠️ WITHDRAWN, NEVER DELETED ────────────────────────────────────────────
 *
 * A collection that happened under an old authorisation must remain explicable,
 * so migration 047 withholds DELETE from the application role entirely. The
 * control says "Withdraw" because that is what it does — the label and the
 * mechanism agree.
 */

interface DriverRow {
  id: string;
  fullName: string;
  phone: string | null;
  relationship: string | null;
  registrationNumber: string | null;
  mayDropOff: boolean;
  mayCollect: boolean;
  mayApproveWork: boolean;
  isActive: boolean;
}

interface VehicleOption { id: string; registrationNumber: string | null }

function permissions(r: DriverRow): string {
  const held = [
    r.mayDropOff ? 'drop off' : null,
    r.mayCollect ? 'collect' : null,
    r.mayApproveWork ? 'approve work' : null,
  ].filter(Boolean);
  return held.length === 0 ? 'nothing' : held.join(', ');
}

export async function AuthorizedDriversScreen({ route }: { route: string }) {
  const [drivers, vehicles] = await Promise.all([
    apiGet<DriverRow[]>('customer', '/self-service/drivers'),
    apiGet<VehicleOption[]>('customer', '/vehicles'),
  ]);

  const header = (
    <PageHeader
      title="Authorized Drivers"
      description="Who else may bring your vehicle in or collect it. Approving work and costs is a separate permission, and it is off unless you turn it on."
    />
  );

  if (!drivers.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={drivers.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={addDriverAction} successPrefix="Saved">
      <Field label="Full name" htmlFor="fullName">
        <TextInput id="fullName" name="fullName" required maxLength={200} />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <TextInput id="phone" name="phone" maxLength={40} />
      </Field>
      <Field label="Relationship to you" htmlFor="relationship">
        <TextInput id="relationship" name="relationship" maxLength={120} />
      </Field>
      <Field
        label="Which vehicle"
        htmlFor="vehicleId"
        hint="Leave as all vehicles if this person may bring in any of yours."
      >
        <Select
          id="vehicleId"
          name="vehicleId"
          defaultValue=""
          options={[
            { value: '', label: 'All my vehicles' },
            ...(vehicles.ok
              ? vehicles.data.map((v) => ({ value: v.id, label: v.registrationNumber ?? 'Vehicle' }))
              : []),
          ]}
        />
      </Field>
      <Field label="May drop the vehicle off" htmlFor="mayDropOff">
        <input id="mayDropOff" name="mayDropOff" type="checkbox" defaultChecked />
      </Field>
      <Field label="May collect the vehicle" htmlFor="mayCollect">
        <input id="mayCollect" name="mayCollect" type="checkbox" defaultChecked />
      </Field>
      <Field
        label="May approve work and costs"
        htmlFor="mayApproveWork"
        hint="Off by default. This lets them commit you to spending money, which is a different thing from collecting a car."
      >
        <input id="mayApproveWork" name="mayApproveWork" type="checkbox" />
      </Field>
      <SubmitButton>Authorize</SubmitButton>
    </FormShell>
  );

  if (drivers.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Only you are authorized"
          description="Nobody else may bring your vehicles in or collect them. That is the safe default and nothing is missing."
        />
        {form}
      </>
    );
  }

  const active = drivers.data.filter((d) => d.isActive).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${drivers.data.length} people · ${active} currently authorized`}
        rows={drivers.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Person', cell: (r) => r.fullName },
          { key: 'rel', header: 'Relationship', cell: (r) => r.relationship ?? '—' },
          { key: 'phone', header: 'Phone', nowrap: true, cell: (r) => r.phone ?? '—' },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? 'All' },
          { key: 'may', header: 'May', cell: (r) => permissions(r) },
          {
            key: 'state',
            header: 'Status',
            cell: (r) =>
              r.isActive ? (
                <StatusBadge kind="complete" label="Authorized" />
              ) : (
                <StatusBadge kind="draft" label="Withdrawn" />
              ),
          },
          {
            key: 'act',
            header: 'Change',
            cell: (r) => (r.isActive ? <WithdrawDriver id={r.id} name={r.fullName} /> : <span>—</span>),
          },
        ]}
      />
      {form}
    </>
  );
}
