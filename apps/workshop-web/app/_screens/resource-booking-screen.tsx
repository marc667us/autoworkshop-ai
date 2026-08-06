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
import { bookResourceAction } from './planning-actions';

/**
 * BOOKING A TOOL OR A BAY — slice 14.
 *
 * ── ONE SCREEN, TWO ROUTES ─────────────────────────────────────────────────
 *
 * `/plan-work/tool-reservation` and `/plan-work/equipment-reservation` are two
 * menu entries and one idea: a technician needs a physical thing, for a job,
 * between two times. Building two screens would mean two places to fix the next
 * bug in either, and they would drift — the same reasoning migration 056 uses
 * for keeping both in one table.
 *
 * 🔴 "AVAILABLE" IS COMPUTED FROM THE BOOKINGS, NOT FROM A STATUS COLUMN. A
 * flag on the tool goes stale the moment a booking starts or ends, and a screen
 * that trusted it would send two technicians to the same ramp.
 *
 * ⚠️ THE CLASH IS REFUSED BY THE DATABASE, not by this form. An
 * `EXCLUDE USING gist` constraint wins the race two simultaneous bookings
 * create; a check in the service would not. The form's job is to make the
 * refusal readable.
 */

interface BookableResource {
  id: string;
  kind: string;
  name: string;
  detail: string | null;
  isAvailable: boolean;
}

interface BookingRow {
  id: string;
  resourceKind: string;
  resourceName: string | null;
  jobNumber: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  bookedByName: string | null;
}

interface JobCardOption {
  id: string;
  jobNumber: string;
}

function when(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function state(r: BookingRow) {
  if (r.status === 'released') return <StatusBadge kind="complete" label="Returned" />;
  if (r.status === 'cancelled') return <StatusBadge kind="blocked" label="Cancelled" />;
  if (new Date(r.endsAt) < new Date()) {
    // Still 'booked' but its window has passed: nobody gave it back. That is
    // the one row a workshop actually needs flagged.
    return <StatusBadge kind="attention" label="Overdue back" />;
  }
  return <StatusBadge kind="active" label="Booked" />;
}

export async function ResourceBookingScreen({ kind }: { kind: 'tool' | 'bay' }) {
  const noun = kind === 'tool' ? 'tool' : 'bay';
  const [resources, bookings, jobs] = await Promise.all([
    apiGet<BookableResource[]>('workshop', kind === 'tool' ? '/plan-work/tools' : '/plan-work/bays'),
    apiGet<BookingRow[]>('workshop', `/plan-work/bookings?kind=${kind}`),
    apiGet<JobCardOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={kind === 'tool' ? 'Tool Reservation' : 'Equipment Reservation'}
      description={
        kind === 'tool'
          ? 'Book a tool for a job so nobody else takes it, and see what is out.'
          : 'Book a service bay for a job, and see what is occupied.'
      }
    />
  );

  if (!resources.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={resources.reason} workspaceId="workshop" />
      </>
    );
  }

  // 🔴 THE FORM IS ONLY OFFERED WHEN THERE IS SOMETHING TO BOOK. A select with
  // no options is a form that cannot be submitted and gives no reason — the
  // "wall with no escape hatch" this repository has paid most for.
  const form =
    resources.data.length === 0 ? (
      <EmptyState
        title={`No ${noun}s recorded`}
        description={
          kind === 'tool'
            ? 'Add the workshop tools first — a reservation needs something to reserve.'
            : 'Add the service bays first — a reservation needs something to reserve.'
        }
      />
    ) : (
      <FormShell action={bookResourceAction} successPrefix="Booked">
        <input type="hidden" name="resourceKind" value={kind} />
        <Field label={kind === 'tool' ? 'Which tool' : 'Which bay'} htmlFor="resourceId">
          <Select
            id="resourceId"
            name="resourceId"
            required
            options={resources.data.map((r) => ({
              value: r.id,
              // The availability is stated in the option itself: a technician
              // picking from a list should not have to cross-reference a table
              // below to find out what is already out.
              label: `${r.name}${r.detail ? ` (${r.detail})` : ''}${r.isAvailable ? '' : ' — in use now'}`,
            }))}
          />
        </Field>
        <Field label="For which job" htmlFor="jobCardId">
          <Select
            id="jobCardId"
            name="jobCardId"
            required
            options={
              jobs.ok ? jobs.data.map((j) => ({ value: j.id, label: j.jobNumber })) : []
            }
          />
        </Field>
        <Field label="From" htmlFor="startsAt">
          <TextInput id="startsAt" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Until" htmlFor="endsAt" hint="An overlapping booking is refused outright.">
          <TextInput id="endsAt" name="endsAt" type="datetime-local" required />
        </Field>
        <SubmitButton>Book it</SubmitButton>
      </FormShell>
    );

  const free = resources.data.filter((r) => r.isAvailable).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${resources.data.length} ${noun}s · ${free} free right now`}
        rows={resources.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: kind === 'tool' ? 'Tool' : 'Bay', cell: (r) => r.name },
          { key: 'detail', header: kind === 'tool' ? 'Asset tag' : 'Type', cell: (r) => r.detail ?? '—' },
          {
            key: 'free',
            header: 'Now',
            cell: (r) =>
              r.isAvailable ? (
                <StatusBadge kind="complete" label="Free" />
              ) : (
                <StatusBadge kind="attention" label="In use" />
              ),
          },
        ]}
      />

      {form}

      {bookings.ok && bookings.data.length > 0 && (
        <DataTable
          caption={`${bookings.data.length} bookings`}
          rows={bookings.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'what', header: kind === 'tool' ? 'Tool' : 'Bay', cell: (r) => r.resourceName ?? '—' },
            { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
            { key: 'from', header: 'From', nowrap: true, cell: (r) => when(r.startsAt) },
            { key: 'to', header: 'Until', nowrap: true, cell: (r) => when(r.endsAt) },
            { key: 'who', header: 'Booked by', cell: (r) => r.bookedByName ?? '—' },
            { key: 'state', header: 'Status', cell: (r) => state(r) },
          ]}
        />
      )}
    </>
  );
}
