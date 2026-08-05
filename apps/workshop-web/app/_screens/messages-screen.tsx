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
import { navLabelFor } from './nav-label';
import { createThreadAction } from './comms-actions';

/**
 * MESSAGES — slice 7. ONE screen, mounted at six routes.
 *
 * `07.txt` gives each role its own tree, and they disagree about where messages
 * live and what they are called: §46 has customer / technician / supplier
 * messages as separate entries, §49 has specialist support, §48 has customer
 * messages under Customers. All of them are the same conversation list filtered
 * by `thread_kind`, so this takes the kind as a prop and `navLabelFor` reads the
 * heading back from whichever tree the viewer is in.
 *
 * Building six screens would have meant six places for the same defect.
 *
 * ⚠️ THE LIST IS FILTERED BY PARTICIPATION IN THE API, not here. A screen that
 * filtered client-side would still have received every thread in the
 * organisation over the wire — the exact defect fixed on 2026-08-04, where a
 * layout gate hid data that had already shipped in the RSC payload.
 */

interface ThreadRow {
  id: string;
  threadKind: string;
  subject: string;
  status: string;
  jobCardId: string | null;
  jobNumber: string | null;
  customerName: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  participants: { userId: string; displayName: string; partyKind: string }[];
}

interface JobOption { id: string; jobNumber: string; registrationNumber: string | null }

const KIND_LABEL: Record<string, string> = {
  customer: 'Customer',
  technician: 'Technician',
  supplier: 'Supplier',
  internal: 'Internal',
  specialist_support: 'Specialist support',
};

const DESCRIPTION: Record<string, string> = {
  customer:
    'Conversations with customers about their vehicles. A message sent against a job card lands beside that repair rather than in a general inbox.',
  technician:
    'Conversations with the people doing the work — a question about a job, a hand-over, a note that needs an answer.',
  supplier:
    'Conversations with parts suppliers: chasing an order, querying an invoice, confirming a fitment.',
  internal: 'Conversations inside the workshop that are not about one job in particular.',
  specialist_support:
    'Where a technician can ask somebody with deeper knowledge of a system or a model.',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function MessagesScreen({
  route,
  kind,
}: {
  route: string;
  /** Omit to show every conversation this person is part of. */
  kind?: string;
}) {
  const title = await navLabelFor('workshop', route, kind ? KIND_LABEL[kind] ?? 'Messages' : 'Messages');

  const [threads, jobs] = await Promise.all([
    apiGet<ThreadRow[]>('workshop', kind ? `/comms/threads?kind=${kind}` : '/comms/threads'),
    apiGet<JobOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description={
        kind
          ? DESCRIPTION[kind] ?? 'Conversations you are part of.'
          : 'Every conversation you are part of. You see a thread because you are in it, not because of your role.'
      }
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
    <FormShell action={createThreadAction} successPrefix="Started">
      <input type="hidden" name="threadKind" value={kind ?? 'internal'} />
      <Field label="Subject" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field
        label="About which job?"
        htmlFor="jobCardId"
        hint="Optional. Attaching the conversation to a job card is what makes it appear beside that repair instead of in a general list."
      >
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
      <Field label="Message" htmlFor="body">
        <TextInput id="body" name="body" required maxLength={20000} />
      </Field>
      <SubmitButton>Start conversation</SubmitButton>
    </FormShell>
  );

  if (threads.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You are not part of any conversation here"
          description="Threads appear once somebody starts one and adds you. Starting one below adds you automatically."
        />
        {form}
      </>
    );
  }

  const unreadTotal = threads.data.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <>
      {header}
      <DataTable
        caption={`${threads.data.length} conversations · ${unreadTotal} unread`}
        rows={threads.data}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'subject',
            header: 'Subject',
            cell: (r) => (
              <Link href={`/communication/messages/${r.id}`} prefetch={false}>
                {r.subject}
              </Link>
            ),
          },
          {
            key: 'about',
            header: 'About',
            nowrap: true,
            cell: (r) => r.jobNumber ?? r.customerName ?? '—',
          },
          {
            key: 'with',
            header: 'With',
            cell: (r) =>
              r.participants.length <= 1
                ? 'Just you so far'
                : r.participants.map((p) => p.displayName).join(', '),
          },
          {
            key: 'unread',
            header: 'Unread',
            numeric: true,
            nowrap: true,
            cell: (r) =>
              r.unreadCount > 0 ? (
                <StatusBadge kind="attention" label={`${r.unreadCount} unread`} />
              ) : (
                <StatusBadge kind="complete" label="Read" />
              ),
          },
          { key: 'count', header: 'Messages', numeric: true, nowrap: true, cell: (r) => r.messageCount },
          { key: 'last', header: 'Last message', nowrap: true, cell: (r) => when(r.lastMessageAt) },
          {
            key: 'state',
            header: 'State',
            cell: (r) =>
              r.status === 'closed' ? (
                <StatusBadge kind="draft" label="Closed" />
              ) : (
                <StatusBadge kind="active" label="Open" />
              ),
          },
        ]}
      />
      {form}
    </>
  );
}
