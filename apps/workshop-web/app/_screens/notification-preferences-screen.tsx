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
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { setNotificationPrefAction } from './settings-actions';

/**
 * NOTIFICATION PREFERENCES — slice 6.
 *
 * ⚠️ THESE ARE THE ORGANISATION'S DEFAULTS. The table also supports a row naming
 * a specific user, which overrides the default for that person; this screen sets
 * the organisation-wide row (`user_id IS NULL`) and shows any per-person
 * overrides that exist so they are not invisible.
 *
 * ⚠️ AND DELIVERY DEPENDS ON A CONNECTED ACCOUNT. Enabling SMS here does not
 * conjure an SMS gateway — under D7 the workshop brings its own, on the
 * Integrations page. A preference for a channel with nothing behind it is a
 * stated wish, and the screen says so rather than implying messages are going
 * out.
 */

interface PrefRow {
  id: string;
  eventKey: string;
  channel: string;
  isEnabled: boolean;
  userId: string | null;
}

const EVENTS = [
  { value: 'job.stage_changed', label: 'A job moves to a new stage' },
  { value: 'job.ready_for_collection', label: 'A vehicle is ready for collection' },
  { value: 'approval.requested', label: 'An approval is requested' },
  { value: 'approval.overdue', label: 'An approval is overdue' },
  { value: 'part.arrived', label: 'A part arrives' },
  { value: 'stock.below_reorder', label: 'Stock falls to its reorder level' },
  { value: 'invoice.issued', label: 'An invoice is issued' },
  { value: 'payment.received', label: 'A payment is received' },
  { value: 'warranty.claim_decided', label: 'A warranty claim is decided' },
];

const CHANNELS = [
  { value: 'in_app', label: 'In the app' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text message' },
  { value: 'push', label: 'Push notification' },
];

function label(list: { value: string; label: string }[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

export async function NotificationPreferencesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Notifications');
  const prefs = await apiGet<PrefRow[]>('workshop', '/settings/notification-preferences');

  const header = (
    <PageHeader
      title={title}
      description="Which events this workshop wants to hear about, and how. These are the workshop-wide defaults; an individual can hold an override."
    />
  );

  if (!prefs.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={prefs.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={setNotificationPrefAction} successPrefix="Saved">
      <Field label="Event" htmlFor="eventKey">
        <Select id="eventKey" name="eventKey" options={EVENTS} defaultValue={EVENTS[0]!.value} />
      </Field>
      <Field
        label="Channel"
        htmlFor="channel"
        hint="Email, text and push need a connected account — see Integrations. In-app notifications need nothing."
      >
        <Select id="channel" name="channel" options={CHANNELS} defaultValue="in_app" />
      </Field>
      <Field label="Send it" htmlFor="isEnabled">
        <input id="isEnabled" name="isEnabled" type="checkbox" defaultChecked />
      </Field>
      <SubmitButton>Save preference</SubmitButton>
    </FormShell>
  );

  if (prefs.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No preferences are recorded"
          description="Nothing has been chosen either way. Recording a preference here is what makes it explicit — and what a future change can be audited against."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${prefs.data.length} preferences recorded`}
        rows={prefs.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'event', header: 'Event', cell: (r) => label(EVENTS, r.eventKey) },
          { key: 'channel', header: 'Channel', nowrap: true, cell: (r) => label(CHANNELS, r.channel) },
          {
            key: 'scope',
            header: 'Applies to',
            cell: (r) => (r.userId === null ? 'Everyone in this workshop' : 'One person'),
          },
          {
            key: 'state',
            header: 'Send it?',
            cell: (r) =>
              r.isEnabled ? (
                <StatusBadge kind="complete" label="Yes" />
              ) : (
                <StatusBadge kind="draft" label="No" />
              ),
          },
        ]}
      />
      {form}
    </>
  );
}
