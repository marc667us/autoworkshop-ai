import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createWalkInAction } from './reception-actions';

/**
 * WALK-INS — somebody at the counter with no booking. Slice 2.
 *
 * ── ⚠️ WHY THIS IS NOT AN APPOINTMENT WITH `scheduledFor = now()` ──────────
 *
 * Because the record is genuinely different. A walk-in carries FREE TEXT for the
 * person and the car, since the whole point is that neither is on file yet and
 * somebody is standing at the desk with thirty seconds of patience. Forcing a
 * customer record first is exactly how a queue forms at the counter — the
 * product would be making the workshop slower than the paper it replaced.
 *
 * The customer and vehicle records get created later, if the visit turns into
 * work. `customer_id` and `vehicle_id` are nullable on purpose.
 */

interface WalkInRow {
  id: string;
  contactName: string;
  contactPhone: string | null;
  vehicleDescription: string;
  registrationNumber: string | null;
  complaint: string;
  status: string;
  convertedJobCardId: string | null;
  outcomeNote: string | null;
  receivedByName: string | null;
  receivedAt: string;
}

const STATUS_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  waiting: 'attention',
  in_progress: 'active',
  converted: 'complete',
  turned_away: 'blocked',
  left: 'draft',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function WalkInsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Walk-in Requests');
  const walkIns = await apiGet<WalkInRow[]>('workshop', '/walk-ins');

  const header = (
    <PageHeader
      title={title}
      description="Anyone who arrived without an appointment. Record them in one pass — the customer and vehicle records come later, if the visit turns into work."
    />
  );

  if (!walkIns.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={walkIns.reason} workspaceId="workshop" />
      </>
    );
  }

  const waiting = walkIns.data.filter((w) => w.status === 'waiting').length;

  return (
    <>
      {header}

      {walkIns.data.length === 0 ? (
        <EmptyState
          title="Nobody is waiting"
          description="Walk-ins recorded here stay at the top of this list until they are closed or turned into a job card."
        />
      ) : (
        <DataTable
          caption="Walk-ins"
          // The number that matters at a counter is how many people are still
          // standing there, not how many ever came.
          summary={`${waiting} still waiting · ${walkIns.data.length} today and earlier`}
          rowKey={(w) => w.id}
          rows={walkIns.data}
          columns={[
            { key: 'received', header: 'Arrived', nowrap: true, numeric: true,
              cell: (w) => when(w.receivedAt) },
            { key: 'who', header: 'Person',
              cell: (w) => (w.contactPhone ? `${w.contactName} · ${w.contactPhone}` : w.contactName) },
            { key: 'vehicle', header: 'Vehicle',
              cell: (w) =>
                w.registrationNumber
                  ? `${w.vehicleDescription} (${w.registrationNumber})`
                  : w.vehicleDescription },
            { key: 'complaint', header: 'Reported', cell: (w) => w.complaint },
            { key: 'taken', header: 'Taken by', secondary: true,
              cell: (w) => w.receivedByName ?? '—' },
            {
              key: 'status', header: 'Status',
              cell: (w) => (
                <StatusBadge kind={STATUS_TONE[w.status] ?? 'draft'} label={w.status.replace('_', ' ')} />
              ),
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Record a walk-in</h2>
      <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: 0 }}>
        Nothing here needs the customer to be on file. Write what they told you.
      </p>
      <FormShell action={createWalkInAction} successPrefix="Recorded">
        <Field label="Name" htmlFor="contactName">
          <TextInput id="contactName" name="contactName" required maxLength={200} />
        </Field>
        <Field label="Contact number" htmlFor="contactPhone">
          <TextInput id="contactPhone" name="contactPhone" maxLength={40} />
        </Field>
        <Field
          label="Vehicle"
          hint="However they described it — “blue Corolla, about 2015” is enough."
          htmlFor="vehicleDescription"
        >
          <TextInput id="vehicleDescription" name="vehicleDescription" required maxLength={500} />
        </Field>
        <Field label="Registration" hint="If they know it." htmlFor="registrationNumber">
          <TextInput id="registrationNumber" name="registrationNumber" maxLength={40} />
        </Field>
        <Field
          label="What is wrong"
          hint="Their words, not a diagnosis."
          htmlFor="complaint"
        >
          <TextInput id="complaint" name="complaint" required maxLength={2000} />
        </Field>
        <SubmitButton>Record the walk-in</SubmitButton>
      </FormShell>
    </>
  );
}
