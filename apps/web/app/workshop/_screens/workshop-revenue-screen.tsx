import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { money } from './finance-shared';

/**
 * WORKSHOP REVENUE — money the workshop actually has. Slice 3,
 * `/finance/workshop-revenue`.
 *
 * ── 🔴 COUNTED FROM PAYMENTS RECEIVED, NET OF REFUNDS ──────────────────────
 *
 * NOT from invoices issued. An invoice is a CLAIM; a payment is money. A
 * revenue screen that counted issued invoices would report a workshop as
 * healthy while every customer on the list had yet to pay — which is precisely
 * how a business believes it is solvent when it is not.
 *
 * Refunds are subtracted in the same month they were issued, not the month of
 * the original payment. That is deliberate: it matches what the bank balance
 * did, which is the question this screen is asked.
 *
 * ── ⚠️ GROUPED BY CURRENCY, NEVER SUMMED ACROSS ONE ────────────────────────
 *
 * Adding GHS to USD produces a number that is wrong in a way nobody can see.
 * The rows stay separate even when there is only one currency today.
 *
 * ── ⚠️ NO CHART ────────────────────────────────────────────────────────────
 *
 * A bar chart over three months of a new workshop's data is decoration that
 * implies a trend it cannot support. The table is the honest instrument until
 * there is enough history to draw anything.
 */

interface RevenueRow {
  month: string;
  currency: string;
  taken: string;
  refunded: string;
  net: string;
}

function monthLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export async function WorkshopRevenueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Workshop Revenue');
  const revenue = await apiGet<RevenueRow[]>('workshop', '/finance/revenue?months=12');

  const header = (
    <PageHeader
      title={title}
      description="Money actually received, by month, less anything refunded. Issued-but-unpaid invoices are on the Outstanding Balances screen — they are not revenue."
    />
  );

  if (!revenue.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={revenue.reason} workspaceId="workshop" />
      </>
    );
  }

  if (revenue.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No money received yet"
          description="Once a payment is recorded on the collection desk it appears here, in the month it arrived."
        />
      </>
    );
  }

  // Grouped by currency — never summed across one. See the header.
  const byCurrency = new Map<string, RevenueRow[]>();
  for (const row of revenue.data) {
    const list = byCurrency.get(row.currency);
    if (list) list.push(row);
    else byCurrency.set(row.currency, [row]);
  }

  return (
    <>
      {header}

      {[...byCurrency.entries()].map(([currency, rows]) => {
        const total = rows.reduce((sum, r) => sum + Number(r.net), 0);
        return (
          <section key={currency} style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.9375rem' }}>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(total.toFixed(2), currency)}
              </strong>{' '}
              received over the last {rows.length} month{rows.length === 1 ? '' : 's'}, after refunds.
            </p>
            <DataTable
              caption={`Revenue in ${currency}`}
              summary={`${rows.length} month${rows.length === 1 ? '' : 's'}`}
              rowKey={(r) => `${r.month}-${r.currency}`}
              rows={rows}
              columns={[
                { key: 'month', header: 'Month', nowrap: true, cell: (r) => monthLabel(r.month) },
                { key: 'taken', header: 'Received', numeric: true, nowrap: true,
                  cell: (r) => money(r.taken, r.currency) },
                {
                  key: 'refunded', header: 'Refunded', numeric: true, nowrap: true,
                  cell: (r) => (Number(r.refunded) > 0 ? money(r.refunded, r.currency) : '—'),
                },
                {
                  key: 'net', header: 'Net', numeric: true, nowrap: true,
                  cell: (r) => (
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {money(r.net, r.currency)}
                    </strong>
                  ),
                },
              ]}
            />
          </section>
        );
      })}

      <p
        style={{
          fontSize: '0.8125rem',
          opacity: 0.8,
          borderLeft: `3px solid ${themeVar.borderDefault}`,
          paddingLeft: '0.75rem',
        }}
      >
        This counts payments in the month they were <strong>received</strong>, and subtracts
        refunds in the month they were <strong>issued</strong> — which is what the workshop&rsquo;s
        bank balance actually did. It is not an accounting period report.
      </p>
    </>
  );
}
