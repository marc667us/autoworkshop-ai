import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * WHAT NEEDS YOU — slice 13.
 *
 * ── 🔴 IT REUSES `/self-service/notifications` RATHER THAN COUNTING AGAIN ──
 *
 * That endpoint already answers exactly this question, and answers it well:
 * EVERY row is a real count over a real table, and a category with a count of
 * zero is OMITTED. So an empty page here means nothing is waiting — a true
 * statement — rather than a list of plausible task types with invented numbers.
 *
 * Writing a second aggregation would have produced a second answer to "what is
 * waiting on me", and the two would disagree the first time either changed.
 * Directive §3: extend, do not duplicate.
 *
 * ⚠️ THE UNPAID-INVOICE ROW IS ADDED HERE, not invented here. It comes from
 * `/my/invoices`, which slice 12 built, and only counts invoices with money
 * genuinely outstanding — the same `outstanding > 0` the invoices screen uses,
 * so the two cannot disagree about what is owed.
 */

interface Notice {
  kind: string;
  title: string;
  detail: string;
  href: string;
  count: number;
}

interface MyInvoiceRow {
  outstanding: string;
  currency: string;
  isOverdue: boolean;
}

export async function MyTasksScreen() {
  const [notices, invoices] = await Promise.all([
    apiGet<Notice[]>('customer', '/self-service/notifications'),
    apiGet<MyInvoiceRow[]>('customer', '/my/invoices'),
  ]);

  const header = (
    <PageHeader
      title="My Tasks"
      description="Everything waiting on you, across all your vehicles, in one list."
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

  const rows: Notice[] = [...notices.data];

  // Money owed, from slice 12's own figures rather than a second calculation.
  if (invoices.ok) {
    const owing = invoices.data.filter((i) => Number(i.outstanding) > 0);
    if (owing.length > 0) {
      const total = owing.reduce((s, i) => s + Number(i.outstanding), 0);
      const overdue = owing.filter((i) => i.isOverdue).length;
      rows.push({
        kind: 'invoices',
        title: overdue > 0 ? `${overdue} invoice(s) overdue` : 'Invoices to pay',
        detail: `${owing[0]!.currency} ${total.toFixed(2)} outstanding.`,
        href: '/payments/invoices',
        count: owing.length,
      });
    }
  }

  if (rows.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing is waiting on you"
          description="No approvals, no unread messages, no documents expiring, nothing outstanding. This list is built from real counts, so an empty one genuinely means there is nothing to do."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {rows.map((n) => (
          <Link
            key={n.kind + n.title}
            href={n.href}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.75rem',
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              padding: '0.85rem 1rem',
              textDecoration: 'none',
            }}
          >
            <StatusBadge kind="attention" label={String(n.count)} />
            <span>
              <strong style={{ display: 'block' }}>{n.title}</strong>
              <span style={{ color: themeVar.textSecondary, fontSize: '0.9rem' }}>{n.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
