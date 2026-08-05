import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';

/**
 * THE WORKSHOP CALENDAR — slice 2, `/home/workshop-calendar`.
 *
 * ── ⚠️ A WEEK OF DAY COLUMNS, NOT A MONTH GRID ─────────────────────────────
 *
 * A month grid is what people picture when they hear "calendar", and it is the
 * wrong instrument here: a workshop's unit of planning is a DAY (which cars are
 * in, which bays are free), and a month cell can show about three characters. A
 * seven-day board shows every booking in full, which is the question the screen
 * is actually asked.
 *
 * ── ⚠️ IT DOES NOT DRAW HOURS TO SCALE ─────────────────────────────────────
 *
 * A proportional day column would need a time axis, drag-to-move, and an
 * overlap-resolution layout — and would be a worse answer today than an ordered
 * list, because bookings are sparse and durations are estimates. The times are
 * shown as text and the order is chronological. When there is enough real data
 * to justify a timeline, this is the screen that grows one.
 *
 * ── ⚠️ NO WRITES HERE, DELIBERATELY ────────────────────────────────────────
 *
 * §34 puts the calendar under HOME, which every workshop role reaches — including
 * the technician, whose tree contains no reception group at all. A booking form
 * here would offer an action the API then refuses, and "hidden is not secure"
 * cuts both ways: showing a control that cannot work is its own defect. The
 * screen links to the diary, which IS role-gated.
 */

interface AppointmentRow {
  id: string;
  customerName: string | null;
  registrationNumber: string | null;
  serviceSummary: string;
  scheduledFor: string;
  durationMinutes: number;
  bayName: string | null;
  assignedToName: string | null;
  status: string;
  bayClashes: number;
}

const STATUS_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  booked: 'active',
  confirmed: 'active',
  arrived: 'complete',
  converted: 'complete',
  no_show: 'attention',
  cancelled: 'blocked',
};

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function dayKey(d: Date): string {
  // Local calendar day, not a UTC slice. `toISOString().slice(0,10)` would put
  // an 00:30 booking on the previous day for anyone east of UTC — the kind of
  // off-by-one nobody notices until a customer arrives on the wrong morning.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function WorkshopCalendarScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Workshop Calendar');

  const from = startOfToday();
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const appointments = await apiGet<AppointmentRow[]>(
    'workshop',
    `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
  );

  const header = (
    <PageHeader
      title={title}
      description="The next seven days: what is booked in, for whom, and in which bay. Cancelled and no-show bookings stay visible — a gap in the day is information too."
    />
  );

  if (!appointments.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={appointments.reason} workspaceId="workshop" />
      </>
    );
  }

  if (appointments.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing booked this week"
          description="Appointments taken at the front desk appear here. The repair staging board shows what is physically in the workshop right now."
        />
      </>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * 86400000));
  const byDay = new Map<string, AppointmentRow[]>();
  for (const a of appointments.data) {
    const key = dayKey(new Date(a.scheduledFor));
    const list = byDay.get(key);
    if (list) list.push(a);
    else byDay.set(key, [a]);
  }

  return (
    <>
      {header}
      <div
        style={{
          display: 'grid',
          // Scrolls INSIDE this container rather than making the document
          // scroll — T-0044's failure is the DOCUMENT moving sideways.
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(14rem, 1fr)',
          gap: '0.75rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
        }}
      >
        {days.map((day) => {
          const key = dayKey(day);
          const list = (byDay.get(key) ?? []).sort((a, b) =>
            a.scheduledFor.localeCompare(b.scheduledFor),
          );
          const isToday = key === dayKey(startOfToday());
          return (
            <section
              key={key}
              aria-label={day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: '0.5rem',
                padding: '0.625rem',
                display: 'grid',
                gap: '0.5rem',
                alignContent: 'start',
                minHeight: '10rem',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '0.8125rem' }}>
                {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {isToday ? (
                  <span style={{ marginLeft: '0.375rem', fontWeight: 400, opacity: 0.75 }}>· today</span>
                ) : null}
              </h2>

              {list.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>Nothing booked</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                  {list.map((a) => (
                    <li
                      key={a.id}
                      style={{
                        border: `1px solid ${themeVar.borderDefault}`,
                        borderRadius: '0.375rem',
                        padding: '0.5rem',
                        display: 'grid',
                        gap: '0.25rem',
                        // A cancelled booking is dimmed rather than hidden: the
                        // slot being free is what the reader needs to see.
                        opacity: a.status === 'cancelled' || a.status === 'no_show' ? 0.55 : 1,
                      }}
                    >
                      <strong style={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(a.scheduledFor).toLocaleTimeString('sv-SE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        <span style={{ fontWeight: 400, opacity: 0.75 }}>{a.durationMinutes}m</span>
                      </strong>
                      <span style={{ fontSize: '0.8125rem' }}>{a.serviceSummary}</span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {a.customerName ?? 'Customer not named'}
                        {a.registrationNumber ? ` · ${a.registrationNumber}` : ''}
                      </span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {a.bayName ?? 'No bay'}
                        {a.bayClashes > 0 ? ` · shares with ${a.bayClashes}` : ''}
                        {a.assignedToName ? ` · ${a.assignedToName}` : ''}
                      </span>
                      <StatusBadge
                        kind={STATUS_TONE[a.status] ?? 'draft'}
                        label={a.status.replace('_', ' ')}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
