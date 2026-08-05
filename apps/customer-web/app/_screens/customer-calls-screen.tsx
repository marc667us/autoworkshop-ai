import { ApiFailure, apiGet, currentViewer } from '@autoworkshop/next-shell';
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
import { CallRoom } from './call-room';
import { startCustomerCallAction } from './calls-actions';

/**
 * THE CUSTOMER'S CALLS — slice 11.
 *
 * ── 🔴 `'customer'`, NOT `'workshop'`, AND `/api/call-signalling` IS THIS
 * APP'S OWN ROUTE ──────────────────────────────────────────────────────────
 *
 * Both matter. A copied file carrying its origin's workspace id is recorded
 * three times in this repository, and LOCAL TESTING CANNOT CATCH IT: `:3000`
 * and `:3001` share one cookie jar because cookies ignore the port, so the
 * wrong id works perfectly on a developer's machine and fails only once
 * deployed to two hosts.
 *
 * `CallRoom` itself names no workspace — it takes `apiBase` as a prop for
 * exactly this reason, so the shared component cannot be the thing that is
 * wrong.
 *
 * ── ⚠️ A CUSTOMER CANNOT NAME WHO TO RING ──────────────────────────────────
 *
 * They do not know who works at the workshop. `CallsService` addresses a
 * customer's call to the front desk — reception, owner, manager — and REFUSES
 * with a plain sentence if the workshop has nobody set up to take calls, rather
 * than ringing into a void.
 */

interface CallRow {
  id: string;
  callKind: string;
  medium: string;
  subject: string;
  status: string;
  scheduledFor: string | null;
  startedAt: string | null;
  durationMinutes: number | null;
  outcome: string | null;
  jobNumber: string | null;
  participants: { userId: string; displayName: string; partyKind: string; joined: boolean }[];
}

const MEDIA = [
  { value: 'voice', label: 'Voice call' },
  { value: 'video', label: 'Video call' },
];

const MEDIUM_LABEL: Record<string, string> = {
  voice: 'Voice',
  video: 'Video',
  phone: 'Phone',
  in_person: 'In person',
};

const STATUS_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  scheduled: 'attention',
  ringing: 'attention',
  in_progress: 'active',
  completed: 'complete',
  no_answer: 'draft',
  failed: 'blocked',
  cancelled: 'draft',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  ringing: 'Ringing',
  in_progress: 'In progress',
  completed: 'Finished',
  no_answer: 'No answer',
  failed: 'Could not connect',
  cancelled: 'Cancelled',
};

function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function CustomerCallsScreen({
  route,
  fallbackTitle,
}: {
  route: string;
  fallbackTitle: string;
}) {
  const [calls, viewer] = await Promise.all([
    apiGet<CallRow[]>('customer', '/calls'),
    currentViewer('customer'),
  ]);

  const header = (
    <PageHeader
      title={fallbackTitle}
      description="Talk to the workshop about your vehicle. The call happens in this app — the audio and video go straight between your device and theirs, and are not recorded."
    />
  );

  if (!calls.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={calls.reason} workspaceId="customer" />
      </>
    );
  }

  const myUserId = viewer?.userId ?? '';

  const form = (
    <FormShell action={startCustomerCallAction} successPrefix="Calling">
      <Field label="What is it about?" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field label="Voice or video" htmlFor="medium">
        <Select id="medium" name="medium" options={MEDIA} defaultValue="voice" />
      </Field>
      <SubmitButton>Call the workshop</SubmitButton>
    </FormShell>
  );

  const live = calls.data.find(
    (c) =>
      (c.status === 'ringing' || c.status === 'in_progress') &&
      (c.medium === 'voice' || c.medium === 'video'),
  );

  return (
    <>
      {header}

      {live ? (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>{live.subject}</h2>
          <CallRoom
            callId={live.id}
            medium={live.medium}
            myUserId={myUserId}
            peerUserIds={live.participants
              .filter((p) => p.userId !== myUserId)
              .map((p) => p.userId)}
            // 🔴 THIS APP'S OWN PROXY ROUTE. See the header.
            apiBase="/api/call-signalling"
          />
        </>
      ) : null}

      {calls.data.length === 0 ? (
        <EmptyState
          title="You have not called the workshop"
          description="A call started here is kept with your repair history, so what was agreed does not live only in somebody's memory."
        />
      ) : (
        <DataTable
          caption={`${calls.data.length} calls`}
          rows={calls.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'subject', header: 'About', cell: (r) => r.subject },
            { key: 'medium', header: 'How', nowrap: true, cell: (r) => MEDIUM_LABEL[r.medium] ?? r.medium },
            { key: 'job', header: 'Repair', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
            { key: 'when', header: 'When', nowrap: true, cell: (r) => when(r.startedAt ?? r.scheduledFor) },
            {
              key: 'length',
              header: 'Length',
              numeric: true,
              nowrap: true,
              cell: (r) => (r.durationMinutes === null ? '—' : `${r.durationMinutes} min`),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <StatusBadge
                  kind={STATUS_TONE[r.status] ?? 'draft'}
                  label={STATUS_LABEL[r.status] ?? r.status}
                />
              ),
            },
            { key: 'outcome', header: 'What was agreed', cell: (r) => r.outcome ?? 'Not recorded yet' },
          ]}
        />
      )}

      {form}
    </>
  );
}
