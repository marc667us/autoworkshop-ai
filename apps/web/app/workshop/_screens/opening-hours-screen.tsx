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
import { setOpeningHoursAction } from './settings-actions';

/**
 * OPENING HOURS — slice 6.
 *
 * 🔴 THE ONE SETTINGS SCREEN WHOSE EFFECT IS VISIBLE TO A STRANGER. Publishing
 * a day puts it on the workshop's public profile, which is why the migration
 * gives `core.opening_hours` a `public_read` policy gated on `is_published` and
 * why this form has a publish control at all. A workshop that has not published
 * is not broken — it simply has not chosen to advertise.
 *
 * ⚠️ ISO-8601 WEEKDAYS: 1 = Monday … 7 = Sunday. Postgres' `extract(isodow)`
 * uses the same numbering, so a query can compare without a translation table —
 * and a translation table is where an off-by-one weekday lives.
 */

interface HoursRow {
  id: string;
  weekday: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  isPublished: boolean;
}

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

function dayName(weekday: number): string {
  return DAYS.find((d) => d.value === String(weekday))?.label ?? `Day ${weekday}`;
}

/** `08:00:00` from Postgres reads better as `08:00`. Seconds are never set. */
function hhmm(t: string | null): string {
  if (!t) return '—';
  return t.slice(0, 5);
}

export async function OpeningHoursScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Opening Hours');
  const hours = await apiGet<HoursRow[]>('workshop', '/settings/opening-hours');

  const header = (
    <PageHeader
      title={title}
      description="When this workshop is open. Publish a day and it appears on the workshop's public profile, where a customer can see it before deciding to book."
    />
  );

  if (!hours.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={hours.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={setOpeningHoursAction} successPrefix="Saved">
      <Field label="Day" htmlFor="weekday">
        <Select id="weekday" name="weekday" options={DAYS} defaultValue="1" />
      </Field>
      <Field
        label="Closed all day"
        htmlFor="isClosed"
        hint="Tick this and leave the times blank. A day is either closed, or it has both an opening and a closing time — half an answer renders as an open-ended promise."
      >
        <input id="isClosed" name="isClosed" type="checkbox" />
      </Field>
      <Field label="Opens at" htmlFor="opensAt" hint="24-hour, for example 08:00.">
        <TextInput id="opensAt" name="opensAt" type="time" />
      </Field>
      <Field label="Closes at" htmlFor="closesAt">
        <TextInput id="closesAt" name="closesAt" type="time" />
      </Field>
      <Field
        label="Show on the public profile"
        htmlFor="isPublished"
        hint="Unpublished days are visible to this workshop only."
      >
        <input id="isPublished" name="isPublished" type="checkbox" defaultChecked />
      </Field>
      <SubmitButton>Save day</SubmitButton>
    </FormShell>
  );

  if (hours.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No opening hours are recorded"
          description="Until a day is saved here, the public profile says nothing about when this workshop is open, and booking screens have no hours to check against."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${hours.data.length} of 7 days recorded`}
        rows={hours.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'day', header: 'Day', cell: (r) => dayName(r.weekday), nowrap: true },
          {
            key: 'hours',
            header: 'Hours',
            nowrap: true,
            cell: (r) =>
              r.isClosed ? (
                <StatusBadge kind="draft" label="Closed" />
              ) : (
                `${hhmm(r.opensAt)} – ${hhmm(r.closesAt)}`
              ),
          },
          {
            key: 'published',
            header: 'Public profile',
            cell: (r) =>
              r.isPublished ? (
                <StatusBadge kind="complete" label="Shown" />
              ) : (
                <StatusBadge kind="draft" label="Not shown" />
              ),
          },
        ]}
      />
      {form}
    </>
  );
}
