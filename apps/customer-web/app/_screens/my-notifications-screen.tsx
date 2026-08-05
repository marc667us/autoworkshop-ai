import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
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
        <ApiFailure reason={notices.reason} workspaceId="customer" />
      </>
    );
  }

  if (notices.data.length === 0) {
    return (
      <>
        {header}
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
