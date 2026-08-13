import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { postMessageAction } from './comms-actions';
import { MarkThreadRead } from './mark-thread-read';

/**
 * ONE CONVERSATION — slice 7.
 *
 * 🔴 THIS SCREEN SHIPPED IN THE SAME COMMIT AS THE LINK THAT REACHES IT.
 * `messages-screen.tsx` makes every subject a link to `/communication/messages/
 * <id>`; a link whose target does not exist is the dead-end defect this
 * repository has recorded more than any other. The two are one change.
 *
 * ⚠️ THE API REFUSES A THREAD YOU ARE NOT IN, and gives the same answer as for a
 * thread that does not exist. That is deliberate — distinguishing them would
 * tell a prober which conversations exist — so this screen renders that refusal
 * as the API worded it rather than inventing a "not found".
 */

interface MessageRow {
  id: string;
  body: string;
  senderUserId: string;
  senderName: string;
  sentAt: string;
  isMine: boolean;
  readByMe: boolean;
  attachmentCount: number;
}

interface ThreadRow {
  id: string;
  subject: string;
  status: string;
  jobNumber: string | null;
  jobCardId: string | null;
  customerName: string | null;
  unreadCount: number;
  participants: { userId: string; displayName: string; partyKind: string }[];
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function ThreadScreen({ threadId }: { threadId: string }) {
  // The thread list is the only place carrying the subject and participants, so
  // it is read alongside the messages rather than adding an endpoint whose only
  // caller would be this screen.
  const [messages, threads] = await Promise.all([
    apiGet<MessageRow[]>('workshop', `/comms/threads/${threadId}/messages`),
    apiGet<ThreadRow[]>('workshop', '/comms/threads'),
  ]);

  if (!messages.ok) {
    return (
      <>
        <PageHeader title="Conversation" description="" />
        <ApiFailure reason={messages.reason} workspaceId="workshop" />
      </>
    );
  }

  const thread = threads.ok ? threads.data.find((t) => t.id === threadId) : undefined;

  return (
    <>
      <PageHeader
        title={thread?.subject ?? 'Conversation'}
        description={
          thread
            ? [
                thread.jobNumber ? `About job ${thread.jobNumber}` : null,
                thread.customerName,
                thread.participants.length > 1
                  ? `With ${thread.participants.map((p) => p.displayName).join(', ')}`
                  : 'Nobody else has been added yet',
              ]
                .filter(Boolean)
                .join(' · ')
            : 'A conversation you are part of.'
        }
      />

      <p style={{ margin: '0 0 1rem' }}>
        <Link href="/workshop/communication/messages" prefetch={false}>
          ← All conversations
        </Link>
      </p>

      {thread?.status === 'closed' ? (
        <div style={{ margin: '0 0 1rem' }}>
          <StatusBadge kind="draft" label="Closed" />
          <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
            This conversation is closed and cannot take new messages. It stays
            readable as the record of what was said — start a new conversation if
            there is more to discuss.
          </p>
        </div>
      ) : null}

      {messages.data.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Nothing has been said in this conversation."
        />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {messages.data.map((m) => (
            <li
              key={m.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: '0.75rem',
                background: themeVar.surfaceRaised,
                padding: '0.875rem 1rem',
                marginBottom: '0.75rem',
                // The sender is distinguished by an indent AND by the name
                // below — never by alignment or colour alone (§66).
                marginInlineStart: m.isMine ? '2rem' : 0,
              }}
            >
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
              <p
                style={{
                  margin: '0.5rem 0 0',
                  fontSize: '0.8125rem',
                  color: themeVar.textSecondary,
                }}
              >
                {m.isMine ? 'You' : m.senderName} · {when(m.sentAt)}
                {m.attachmentCount > 0
                  ? ` · ${m.attachmentCount} attachment${m.attachmentCount === 1 ? '' : 's'}`
                  : ''}
                {!m.isMine && !m.readByMe ? ' · unread' : ''}
              </p>
            </li>
          ))}
        </ol>
      )}

      {/* Marking read is a deliberate act, not a side effect of the page
          loading. An automatic mark-on-render would clear the badge for
          somebody who opened the page by accident and never read a word. */}
      <MarkThreadRead
        threadId={threadId}
        unreadCount={messages.data.filter((m) => !m.isMine && !m.readByMe).length}
      />

      {thread?.status === 'closed' ? null : (
        <FormShell action={postMessageAction} successPrefix="Sent">
          <input type="hidden" name="threadId" value={threadId} />
          <Field label="Reply" htmlFor="body">
            <TextInput id="body" name="body" required maxLength={20000} />
          </Field>
          <SubmitButton>Send</SubmitButton>
        </FormShell>
      )}
    </>
  );
}
