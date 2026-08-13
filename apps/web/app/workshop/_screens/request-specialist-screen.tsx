import Link from 'next/link';
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
import { createThreadAction } from './comms-actions';

/**
 * REQUEST A SPECIALIST — slice 14.
 *
 * ── 🔴 NO NEW API, AND NO NEW TABLE ────────────────────────────────────────
 *
 * `comms.threads` has carried a `specialist_support` kind since slice 7, and
 * `POST /comms/threads` already creates one. Asking a specialist for help IS a
 * conversation: it has participants, messages, a job card, unread counts and a
 * status. Building a `specialist_requests` table would have produced a second
 * inbox, a second unread count and a second place to answer "who is waiting on
 * me" — and the two would have disagreed the first time either changed.
 *
 * So this screen is a filtered view of something that already works, plus the
 * form that names the kind. Directive §3: extend, do not duplicate.
 *
 * ⚠️ THE REPLY LIVES ON MESSAGES, NOT HERE. A second reply box would mean two
 * ways to post to one thread. This links to the conversation.
 */

interface ThreadRow {
  id: string;
  subject: string;
  status: string;
  jobNumber: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
}

interface JobCardOption {
  id: string;
  jobNumber: string;
}

interface Membership {
  userId: string;
  displayName: string | null;
  roleName: string;
}

export async function RequestSpecialistScreen() {
  const [threads, jobs, members] = await Promise.all([
    apiGet<ThreadRow[]>('workshop', '/comms/threads?kind=specialist_support'),
    apiGet<JobCardOption[]>('workshop', '/job-cards'),
    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
    // it did would have produced a permanently empty dropdown.
    apiGet<Membership[]>('workshop', '/memberships'),
  ]);

  const header = (
    <PageHeader
      title="Request a Specialist"
      description="Ask a colleague with the right expertise to look at a job. It opens a conversation they can answer in, on the job it belongs to."
    />
  );

  if (!threads.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={threads.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createThreadAction} successPrefix="Requested">
      {/* The whole reason this screen differs from Messages. */}
      <input type="hidden" name="threadKind" value="specialist_support" />
      <Field label="What do you need help with" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field label="On which job" htmlFor="jobCardId">
        <Select
          id="jobCardId"
          name="jobCardId"
          options={[
            { value: '', label: 'Not about a specific job' },
            ...(jobs.ok ? jobs.data.map((j) => ({ value: j.id, label: j.jobNumber })) : []),
          ]}
        />
      </Field>
      <Field
        label="Who should look at it"
        htmlFor="participantUserIds"
        hint="Leave blank to ask the workshop generally."
      >
        <Select
          id="participantUserIds"
          name="participantUserIds"
          options={[
            { value: '', label: 'Anyone who can help' },
            ...(members.ok
              ? members.data.map((m) => ({
                  value: m.userId,
                  label: `${m.displayName ?? 'Colleague'} — ${m.roleName.replace(/_/g, ' ')}`,
                }))
              : []),
          ]}
        />
      </Field>
      <Field label="What have you found so far" htmlFor="body">
        <TextInput id="body" name="body" required maxLength={10_000} />
      </Field>
      <SubmitButton>Ask for help</SubmitButton>
    </FormShell>
  );

  if (threads.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No specialist requests open"
          description="When a job needs expertise you do not have, ask here and it becomes a conversation on that job rather than a message nobody can find later."
        />
        {form}
      </>
    );
  }

  const open = threads.data.filter((t) => t.status === 'open').length;

  return (
    <>
      {header}
      <DataTable
        caption={`${threads.data.length} requests · ${open} still open`}
        rows={threads.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'subject', header: 'Asking about', cell: (r) => r.subject },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          {
            key: 'last',
            header: 'Last reply',
            nowrap: true,
            cell: (r) => (r.lastMessageAt ? r.lastMessageAt.slice(0, 10) : 'no replies yet'),
          },
          {
            key: 'state',
            header: 'Status',
            cell: (r) =>
              r.unreadCount > 0 ? (
                <StatusBadge kind="attention" label={`${r.unreadCount} unread`} />
              ) : r.status === 'open' ? (
                <StatusBadge kind="active" label="Open" />
              ) : (
                <StatusBadge kind="complete" label="Closed" />
              ),
          },
          {
            key: 'go',
            header: '',
            nowrap: true,
            // One place to reply, not two.
            cell: () => <Link href="/workshop/communication/messages">Open</Link>,
          },
        ]}
      />
      {form}
    </>
  );
}
