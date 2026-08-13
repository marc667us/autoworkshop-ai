import Link from 'next/link';
import { ApiFailure, apiGet, NotificationsInbox } from '@autoworkshop/next-shell';
import { markNotificationReadAction } from '../mark-notification-read-action';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * NOTIFICATIONS — the customer's inbox. Slice 9.
 *
 * ⚠️ EVERY ROW IS A REAL COUNT AND EVERY LINK GOES SOMEWHERE THAT EXISTS. The
 * API omits a category entirely when its count is zero, so an empty list means
 * nothing is waiting rather than that the page is unfinished. The alternative —
 * a list of plausible notification types with invented numbers — is the
 * "disconnected mock page" `05.txt` §2 forbids, with the added harm that its
 * links would lead nowhere.
 *
 * ⚠️ EVERY `href` HERE IS A ROUTE THIS SLICE ALSO SHIPPED, checked rather than
 * assumed. A signpost pointing at an unbuilt route is a wall, and that has
 * happened in this repository before.
 *
 * 🔴 `'customer'`, NOT `'workshop'`.
 */

interface Notice {
  kind: string;
  title: string;
  detail: string;
  href: string;
  count: number;
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
export async function MyNotificationsScreen({ route }: { route: string }) {
  const notices = await apiGet<Notice[]>('customer', '/self-service/notifications');

  const header = (
    <PageHeader
      title="Notifications"
      description="Everything waiting on you or on the workshop, counted from your own records."
    />
  );

  if (!notices.ok) {
    return (
      <>
        {header}
      <NotificationsInbox workspace="customer" markReadAction={markNotificationReadAction} withHeader={false} />
        <ApiFailure reason={notices.reason} workspaceId="customer" />
      </>
    );
  }

  if (notices.data.length === 0) {
    return (
      <>
        {header}
      <NotificationsInbox workspace="customer" markReadAction={markNotificationReadAction} withHeader={false} />
        <EmptyState
          title="Nothing needs your attention"
          description="No unread messages, no documents expiring in the next 30 days, no servicing due and no open cases. This list is counted live, so an empty one means there is genuinely nothing here."
        />
      </>
    );
  }

  const total = notices.data.reduce((n, x) => n + x.count, 0);

  return (
    <>
      {header}
      <NotificationsInbox workspace="customer" markReadAction={markNotificationReadAction} withHeader={false} />
      <DataTable
        caption={`${total} things across ${notices.data.length} categories`}
        rows={notices.data}
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
        ]}
      />
    </>
  );
}
