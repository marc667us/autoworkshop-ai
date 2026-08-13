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
import { navLabelFor } from './nav-label';
import { createCallAction } from './calls-actions';
import { CallRoom } from './call-room';
import { CompleteCall } from './complete-call';

/**
 * CALLS AND CONSULTATIONS — slice 11. ONE screen at four routes.
 *
 * §46 names Calls, Voice Calls and Video Consultations separately; §49 names
 * Specialist Consultations. All four are the same list filtered by `call_kind`
 * or by medium, so this takes them as props and `navLabelFor` reads the heading
 * back from whichever tree the viewer is in.
 *
 * ── 🔴 VOICE AND VIDEO ARE CARRIED IN THIS APP ─────────────────────────────
 *
 * `CallRoom` is real WebRTC: signalling through our own API, media directly
 * between the two browsers. It never touches this platform and is never
 * recorded. The alternative considered — embedding somebody else's meeting
 * room — would have routed a customer's conversation about their car through a
 * third party.
 *
 * ── ⚠️ THE ROOM IS ONLY RENDERED WHEN IT CAN WORK ──────────────────────────
 *
 * A `phone` or `in_person` call gets NO call room, because there is nothing to
 * join — those exist so a workshop that rings a customer still records the
 * outcome, which is D7's promise that an app with nothing configured works. A
 * Join button on a phone call would be a control with nowhere to go.
 */

interface CallRow {
  id: string;
  callKind: string;
  medium: string;
  subject: string;
  status: string;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  outcome: string | null;
  jobCardId: string | null;
  jobNumber: string | null;
  threadId: string | null;
  participants: { userId: string; displayName: string; partyKind: string; joined: boolean }[];
}

interface JobOption { id: string; jobNumber: string; registrationNumber: string | null }
interface Membership { id: string; userId: string; roleName: string; status: string }

const MEDIA = [
  { value: 'voice', label: 'Voice call in the app' },
  { value: 'video', label: 'Video call in the app' },
  { value: 'phone', label: 'Phone (rung separately, logged here)' },
  { value: 'in_person', label: 'In person' },
];

const MEDIUM_LABEL: Record<string, string> = {
  voice: 'In-app voice',
  video: 'In-app video',
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
  completed: 'Completed',
  no_answer: 'No answer',
  failed: 'Could not connect',
  cancelled: 'Cancelled',
};

const ROLE_LABEL: Record<string, string> = {
  workshop_owner: 'Owner',
  workshop_manager: 'Manager',
  workshop_supervisor: 'Supervisor',
  reception_staff: 'Reception',
  technician: 'Technician',
  storekeeper: 'Storekeeper',
  cashier: 'Cashier',
  // `quality_control_inspector`, NOT `quality_controller`. The latter is not
  // a role in ROLE_PRECEDENCE and never was — it sat in seven API role lists
  // for months, failing CLOSED, so a quality inspector was silently refused
  // and nothing said so. Here the cost was only cosmetic (the lookup falls
  // back to the raw string), which is exactly why it survived the API fix.
  quality_control_inspector: 'Quality control',
  platform_administrator: 'Platform administrator',
};

function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function CallsScreen({
  route,
  kind,
  fallbackTitle,
}: {
  route: string;
  kind?: string;
  fallbackTitle: string;
}) {
  const title = await navLabelFor('workshop', route, fallbackTitle);

  const [calls, jobs, members, viewer] = await Promise.all([
    apiGet<CallRow[]>('workshop', kind ? `/calls?kind=${kind}` : '/calls'),
    apiGet<JobOption[]>('workshop', '/job-cards'),
    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
    // it cost a permanently empty dropdown in slice 10 before it was caught.
    apiGet<Membership[]>('workshop', '/memberships'),
    currentViewer('workshop'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Calls with customers, colleagues and specialists. Voice and video happen in this app — the audio goes straight between the two devices and is not recorded."
    />
  );

  if (!calls.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={calls.reason} workspaceId="workshop" />
      </>
    );
  }

  const myUserId = viewer?.userId ?? '';

  const form = (
    <FormShell action={createCallAction} successPrefix="Started">
      <input type="hidden" name="callKind" value={kind ?? 'customer'} />
      <Field label="What is it about?" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field
        label="How"
        htmlFor="medium"
        hint="Voice and video happen inside this app. Phone and in person are for calls you make another way and record here."
      >
        <Select id="medium" name="medium" options={MEDIA} defaultValue="voice" />
      </Field>
      <Field label="Who with" htmlFor="participantUserIds">
        <Select
          id="participantUserIds"
          name="participantUserIds"
          required
          options={
            members.ok
              ? members.data
                  .filter((m) => m.status === 'active' && m.userId !== myUserId)
                  .map((m) => ({
                    value: m.userId,
                    label: `${ROLE_LABEL[m.roleName] ?? m.roleName} · ${m.userId.slice(0, 8)}`,
                  }))
              : []
          }
        />
      </Field>
      <Field label="About which job?" htmlFor="jobCardId">
        <Select
          id="jobCardId"
          name="jobCardId"
          defaultValue=""
          options={[
            { value: '', label: 'Not about a particular job' },
            ...(jobs.ok
              ? jobs.data.map((j) => ({
                  value: j.id,
                  label: `${j.jobNumber}${j.registrationNumber ? ` · ${j.registrationNumber}` : ''}`,
                }))
              : []),
          ]}
        />
      </Field>
      <Field
        label="Schedule it for later"
        htmlFor="scheduledFor"
        hint="Leave blank to call now."
      >
        <TextInput id="scheduledFor" name="scheduledFor" type="datetime-local" />
      </Field>
      <SubmitButton>Start call</SubmitButton>
    </FormShell>
  );

  if (calls.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No calls yet"
          description="A call started here is recorded against the job, so what was agreed on the phone does not live only in somebody's memory."
        />
        {form}
      </>
    );
  }

  // The one call that is live right now, if any. Only in-app media gets a room.
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
            apiBase="/api/call-signalling"
          />
          <CompleteCall callId={live.id} subject={live.subject} />
        </>
      ) : null}

      <DataTable
        caption={`${calls.data.length} calls`}
        rows={calls.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'subject', header: 'Subject', cell: (r) => r.subject },
          {
            key: 'medium',
            header: 'How',
            nowrap: true,
            cell: (r) => MEDIUM_LABEL[r.medium] ?? r.medium,
          },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          {
            key: 'with',
            header: 'With',
            cell: (r) =>
              r.participants
                .filter((p) => p.userId !== myUserId)
                .map((p) => `${p.displayName}${p.joined ? '' : ' (not joined)'}`)
                .join(', ') || '—',
          },
          {
            key: 'when',
            header: 'When',
            nowrap: true,
            cell: (r) => when(r.startedAt ?? r.scheduledFor),
          },
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
          {
            key: 'outcome',
            header: 'What was agreed',
            cell: (r) => r.outcome ?? 'Not recorded yet',
          },
        ]}
      />
      {form}
    </>
  );
}
