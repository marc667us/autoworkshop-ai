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
import { themeVar } from '@autoworkshop/design-tokens';
import { createCustomerThreadAction, replyToWorkshopAction } from './comms-actions';

/**
 * MESSAGES — the customer's side of slice 7.
 *
 * ── 🔴 `'customer'`, NOT `'workshop'` ──────────────────────────────────────
 *
 * Every `apiGet` here names the CUSTOMER workspace. A copied file carrying its
 * origin's workspace id has been recorded three times in this repository, and
 * LOCAL CAN NEVER CATCH IT: `:3000` and `:3001` share one cookie jar because
 * cookies ignore the port, so the wrong id works perfectly on a developer's
 * machine and fails only on the deployed hosts.
 *
 * ── ⚠️ A CUSTOMER CANNOT NAME WHO TO WRITE TO ──────────────────────────────
 *
 * They do not know who works at the workshop. `CommsService` addresses a
 * customer-started thread to the front desk — reception, owner, manager — and
 * REFUSES with a plain sentence if the workshop has nobody set up to receive
 * messages, rather than accepting a message into a void.
 *
 * ── ⚠️ THE WHOLE THREAD IS ON ONE PAGE ─────────────────────────────────────
 *
 * The workshop side has a list and a detail view because staff hold many
 * conversations. A customer typically has one or two, so a list that must be
 * clicked through to read anything would be a wall between them and a reply.
 */

interface ThreadRow {
  id: string;
  threadKind: string;
  subject: string;
  status: string;
  jobNumber: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
}

interface VehicleOption { id: string; registrationNumber: string | null }

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function CustomerMessagesScreen({ route }: { route: string }) {
  const threads = await apiGet<ThreadRow[]>('customer', '/comms/threads');

  const header = (
    <PageHeader
      title="Messages"
      description="Your conversations with the workshop. A message sent about a particular repair reaches the people working on it."
    />
  );

  if (!threads.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={threads.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={createCustomerThreadAction} successPrefix="Sent">
      <Field label="What is it about?" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field label="Your message" htmlFor="body">
        <TextInput id="body" name="body" required maxLength={20000} />
      </Field>
      <SubmitButton>Send to the workshop</SubmitButton>
    </FormShell>
  );

  if (threads.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have not messaged this workshop"
          description="Anything you send here is kept with your repair history, so both sides can look back at what was agreed."
        />
        {form}
      </>
    );
  }

  const unread = threads.data.reduce((n, t) => n + t.unreadCount, 0);

  return (
    <>
      {header}
      <DataTable
        caption={`${threads.data.length} conversations · ${unread} unread`}
        rows={threads.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'subject', header: 'About', cell: (r) => r.subject },
          { key: 'job', header: 'Repair', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'count', header: 'Messages', numeric: true, nowrap: true, cell: (r) => r.messageCount },
          {
            key: 'unread',
            header: 'Unread',
            nowrap: true,
            cell: (r) =>
              r.unreadCount > 0 ? (
                <StatusBadge kind="attention" label={`${r.unreadCount} new`} />
              ) : (
                <StatusBadge kind="complete" label="Read" />
              ),
          },
          { key: 'last', header: 'Last message', nowrap: true, cell: (r) => when(r.lastMessageAt) },
          {
            key: 'reply',
            header: 'Reply',
            cell: (r) =>
              r.status === 'closed' ? (
                <StatusBadge kind="draft" label="Closed" />
              ) : (
                <FormShell action={replyToWorkshopAction} successPrefix="Sent">
                  <input type="hidden" name="threadId" value={r.id} />
                  <Field label="Reply" htmlFor={`reply-${r.id}`}>
                    <TextInput id={`reply-${r.id}`} name="body" required maxLength={20000} />
                  </Field>
                  <SubmitButton>Send</SubmitButton>
                </FormShell>
              ),
          },
        ]}
      />
      <p style={{ margin: '1rem 0', color: themeVar.textSecondary, maxWidth: '60ch' }}>
        Messages are kept as the record of what was agreed, so neither side can
        edit or delete one after it is sent. Send a correction to the same
        conversation instead.
      </p>
      {form}
    </>
  );
}
