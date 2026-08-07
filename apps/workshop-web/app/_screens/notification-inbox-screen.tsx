import Link from 'next/link';
import { ApiFailure, apiGet, NotificationsInbox } from '@autoworkshop/next-shell';
import { markNotificationReadAction } from '../mark-notification-read-action';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';

/**
 * NOTIFICATION INBOX — slice 7. One place for everything waiting.
 *
 * ── 🔴 EVERY ROW IS A REAL COUNT AND EVERY LINK GOES SOMEWHERE THAT EXISTS ──
 *
 * The signpost this replaces promised "one place for every alert the workshop
 * raises — a job stalled, a part in, an approval overdue". The tempting build
 * is a list of plausible alert types with invented counts, which is exactly the
 * "disconnected mock page" `05.txt` §2 forbids, with the extra harm that its
 * links would lead to screens that do not exist.
 *
 * So the API returns only categories it can COUNT from a real table today —
 * unread messages, stock at reorder level, repairs awaiting a decision — and
 * omits a category entirely when its count is zero. An empty inbox therefore
 * means nothing is waiting, which is a true and useful statement.
 *
 * ⚠️ THE HREFS WERE CHECKED AGAINST THE NAV TREES, not assumed. A signpost that
 * points at an unreachable route is a wall, and `planned-workshop.spec.ts`
 * exists because that has happened here before.
 */

interface InboxItem {
  kind: string;
  title: string;
  detail: string;
  href: string;
  at: string | null;
  count: number;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * 🔔 THE MESSAGE INBOX WAS MERGED IN HERE, 2026-08-07.
 *
 * Owner: "give every user a notification inbox to receive notices in app".
 * This screen already existed and counts what is WAITING — proposals to
 * approve, documents expiring — derived live from real tables. Migration 060
 * introduced something different: actual MESSAGES the system sends ("a customer
 * has asked for service", "your request was accepted").
 *
 * They are not the same thing, but they are the same QUESTION — "what should I
 * know?" — and the navigation already had exactly one Notifications entry. A
 * second one would have been two screens with one name, which is how they start
 * disagreeing. So the messages render above the derived counts, in one place.
 */
export async function NotificationInboxScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Notification Inbox');
  const inbox = await apiGet<InboxItem[]>('workshop', '/comms/inbox');

  const header = (
    <PageHeader
      title={title}
      description="Everything waiting on this workshop, counted from the real records rather than from a list of notifications somebody has to clear."
    />
  );

  if (!inbox.ok) {
    return (
      <>
        {header}
      <NotificationsInbox workspace="workshop" markReadAction={markNotificationReadAction} withHeader={false} />
        <ApiFailure reason={inbox.reason} workspaceId="workshop" />
      </>
    );
  }

  if (inbox.data.length === 0) {
    return (
      <>
        {header}
      <NotificationsInbox workspace="workshop" markReadAction={markNotificationReadAction} withHeader={false} />
        <EmptyState
          title="Nothing is waiting"
          description="No unread messages, no stock at its reorder level, and no repair waiting on a customer's decision. This list is counted live, so an empty one means there is genuinely nothing here."
        />
      </>
    );
  }

  const total = inbox.data.reduce((sum, i) => sum + i.count, 0);

  return (
    <>
      {header}
      <NotificationsInbox workspace="workshop" markReadAction={markNotificationReadAction} withHeader={false} />
      <DataTable
        caption={`${total} things waiting across ${inbox.data.length} categories`}
        rows={inbox.data}
        rowKey={(r) => r.kind}
        columns={[
          {
            key: 'what',
            header: 'What',
            cell: (r) => (
              <Link href={r.href} prefetch={false}>
                {r.title}
              </Link>
            ),
          },
          { key: 'detail', header: 'Meaning', cell: (r) => r.detail },
          {
            key: 'count',
            header: 'How many',
            numeric: true,
            nowrap: true,
            cell: (r) => <StatusBadge kind="attention" label={String(r.count)} />,
          },
          { key: 'at', header: 'Most recent', nowrap: true, cell: (r) => when(r.at) },
        ]}
      />
    </>
  );
}
