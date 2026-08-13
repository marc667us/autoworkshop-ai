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
import { setMyPreferenceAction } from './selfservice-actions';

/**
 * COMMUNICATION PREFERENCES — slice 9.
 *
 * ⚠️ NO NEW TABLE. `core.notification_preferences` from migration 045 already
 * carries a nullable `user_id`: a row naming a user overrides the
 * organisation's default for that person. Slice 6's settings screen writes the
 * organisation row; this writes the personal one. A second preferences table
 * would have produced two answers to the same question and no rule for which
 * one wins.
 *
 * The "Applies to" column exists so a customer can tell a setting they chose
 * from a default the workshop chose — without it, a workshop default would look
 * like a personal decision they had made and forgotten.
 *
 * ⚠️ AND DELIVERY DEPENDS ON THE WORKSHOP HAVING A CONNECTED ACCOUNT. Asking
 * for text messages does not conjure an SMS gateway; under D7 the workshop
 * brings its own. Saying so is the difference between a preference and a
 * promise.
 */

interface PrefRow {
  eventKey: string;
  channel: string;
  isEnabled: boolean;
  isPersonal: boolean;
}

const EVENTS = [
  { value: 'job.stage_changed', label: 'My repair moves to a new stage' },
  { value: 'job.ready_for_collection', label: 'My vehicle is ready to collect' },
  { value: 'approval.requested', label: 'The workshop needs my approval' },
  { value: 'invoice.issued', label: 'An invoice is issued to me' },
  { value: 'payment.received', label: 'A payment of mine is received' },
  { value: 'warranty.claim_decided', label: 'A warranty claim of mine is decided' },
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

export async function CommunicationPreferencesScreen({ route }: { route: string }) {
  const prefs = await apiGet<PrefRow[]>('customer', '/self-service/preferences');

  const header = (
    <PageHeader
      title="Communication Preferences"
      description="How this workshop should reach you. Your own choices override the workshop's defaults."
    />
  );

  if (!prefs.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={prefs.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={setMyPreferenceAction} successPrefix="Saved">
      <Field label="Tell me when" htmlFor="eventKey">
        <Select id="eventKey" name="eventKey" options={EVENTS} defaultValue={EVENTS[0]!.value} />
      </Field>
      <Field
        label="By"
        htmlFor="channel"
        hint="Email, text and push depend on the workshop having connected an account of its own. In-app notifications always work."
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
          title="Nothing has been chosen either way"
          description="The workshop has set no defaults and you have set no preferences. Saving one here records your choice explicitly."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${prefs.data.length} preferences`}
        rows={prefs.data}
        rowKey={(r) => `${r.eventKey}:${r.channel}:${r.isPersonal}`}
        columns={[
          { key: 'event', header: 'When', cell: (r) => label(EVENTS, r.eventKey) },
          { key: 'channel', header: 'By', nowrap: true, cell: (r) => label(CHANNELS, r.channel) },
          {
            key: 'scope',
            header: 'Applies to',
            cell: (r) =>
              r.isPersonal ? (
                <StatusBadge kind="active" label="Your choice" />
              ) : (
                <StatusBadge kind="draft" label="Workshop default" />
              ),
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
