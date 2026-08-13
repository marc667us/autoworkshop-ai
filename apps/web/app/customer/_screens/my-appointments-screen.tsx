import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * YOUR APPOINTMENTS — slice 13.
 *
 * 🔴 `/my/appointments`, NOT `/appointments`. The workshop's appointment book
 * is every customer's name, vehicle and time, and it is refused to a customer
 * outright (A5). This is the same table narrowed by a customer predicate the
 * SESSION derives — a different query, not a relaxed gate.
 *
 * ⚠️ NO "BOOK AN APPOINTMENT" BUTTON. Booking is reception's: it needs a bay,
 * a technician's availability and a duration the workshop decides. A form that
 * let a customer pick a time the workshop cannot honour would be a promise the
 * screen makes and the desk cannot keep — so this shows what IS booked and
 * points at the request path that genuinely works.
 *
 * 🔴 `'customer'`, NOT `'workshop'` — the workspace id local testing cannot
 * catch, because `:3000` and `:3001` share one cookie jar.
 */

interface MyAppointmentRow {
  id: string;
  scheduledFor: string;
  status: string;
  purpose: string | null;
  durationMinutes: number | null;
  cancellationReason: string | null;
  registrationNumber: string | null;
  isPast: boolean;
}

function state(r: MyAppointmentRow) {
  if (r.status === 'cancelled') return <StatusBadge kind="blocked" label="Cancelled" />;
  if (r.status === 'completed') return <StatusBadge kind="complete" label="Completed" />;
  if (r.status === 'no_show') return <StatusBadge kind="blocked" label="Missed" />;
  // An upcoming booking and one whose time has passed but was never closed out
  // are different situations, and the customer is the one who can tell the
  // workshop which it was.
  if (r.isPast) return <StatusBadge kind="attention" label="Time has passed" />;
  return <StatusBadge kind="active" label="Booked" />;
}

function when(iso: string): string {
  // `YYYY-MM-DD HH:MM` — no locale formatting, because the server renders this
  // and the viewer's timezone is not knowable here.
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export async function MyAppointmentsScreen() {
  const appts = await apiGet<MyAppointmentRow[]>('customer', '/my/appointments');

  const header = (
    <PageHeader
      title="Appointments"
      description="Times you have booked with the workshop. To arrange a new one, report the problem and the workshop will confirm a slot."
    />
  );

  if (!appts.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={appts.reason} workspaceId="customer" />
      </>
    );
  }

  if (appts.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have no appointments"
          description="Report a problem with one of your vehicles and the workshop will contact you to arrange a time. Anything they book appears here."
        />
      </>
    );
  }

  const upcoming = appts.data.filter((a) => !a.isPast && a.status === 'booked').length;

  return (
    <>
      {header}
      <DataTable
        caption={
          upcoming === 0
            ? `${appts.data.length} appointments · none upcoming`
            : `${appts.data.length} appointments · ${upcoming} upcoming`
        }
        rows={appts.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'when', header: 'When', nowrap: true, cell: (r) => when(r.scheduledFor) },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'what', header: 'For', cell: (r) => r.purpose ?? '—' },
          {
            key: 'mins',
            header: 'Expected',
            numeric: true,
            nowrap: true,
            cell: (r) => (r.durationMinutes === null ? '—' : `${r.durationMinutes} min`),
          },
          {
            key: 'note',
            header: 'Note',
            // A cancellation the customer cannot see the reason for is the kind
            // of gap that produces a phone call.
            cell: (r) => r.cancellationReason ?? '—',
          },
          { key: 'state', header: 'Status', cell: (r) => state(r) },
        ]}
      />
    </>
  );
}
