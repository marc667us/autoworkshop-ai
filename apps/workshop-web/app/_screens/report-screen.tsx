import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';

/**
 * A REPORT — slice 8. ONE screen for all fourteen report routes.
 *
 * ── 🔴 THE BASIS IS PRINTED, NOT ASSUMED ───────────────────────────────────
 *
 * Every report the API returns carries a `basis` sentence saying what its
 * numbers MEAN, and this screen renders it above the table. That is the whole
 * design: "revenue" that counts money received is a different number from
 * "revenue" that counts money billed, and a reader who assumes the wrong one
 * makes a decision on a figure that was never wrong — only misread.
 *
 * The finance report says out loud that an unpaid invoice appears in neither
 * it nor the workshop-revenue screen. Without that sentence the two agreeing
 * would look like a coincidence rather than a guarantee.
 *
 * ── ⚠️ AN EMPTY REPORT IS NOT A BROKEN ONE ─────────────────────────────────
 *
 * Zero rows means the question has no answer yet — no delayed jobs, no warranty
 * claims. That is distinguished from an API failure, which renders
 * `ApiFailure`. Conflating the two is how "nothing is late" comes to look like
 * an outage, and how an outage comes to look like good news.
 *
 * ── ⚠️ FOURTEEN ROUTES, ONE IMPLEMENTATION ─────────────────────────────────
 *
 * §46 and §47 each name several of the same reports under different headings.
 * `navLabelFor` reads the heading back from whichever tree the viewer is in, so
 * "Operations" and "Job Progress" can be the same report without becoming two
 * copies of the same arithmetic.
 */

interface ReportColumn {
  key: string;
  header: string;
  numeric?: boolean;
}

interface ReportResult {
  key: string;
  title: string;
  basis: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generatedAt: string;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function ReportScreen({
  route,
  reportKey,
  fallbackTitle,
}: {
  route: string;
  reportKey: string;
  fallbackTitle: string;
}) {
  const title = await navLabelFor('workshop', route, fallbackTitle);
  const report = await apiGet<ReportResult>('workshop', `/reports/${reportKey}`);

  if (!report.ok) {
    return (
      <>
        <PageHeader title={title} description="" />
        {/* A refused financial report renders the API's own sentence, which
            names the operational reports this viewer CAN read. A generic
            "forbidden" would be a wall. */}
        <ApiFailure reason={report.reason} workspaceId="workshop" />
      </>
    );
  }

  const { basis, columns, rows, generatedAt } = report.data;

  return (
    <>
      <PageHeader title={title} description={basis} />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to report"
          description="This report has no rows, which means the question has no answer yet rather than that anything is wrong. It fills as the work it measures happens."
        />
      ) : (
        <DataTable
          caption={`${rows.length} rows · read at ${when(generatedAt)}`}
          rows={rows}
          rowKey={(r) => columns.map((c) => String(r[c.key])).join('|')}
          columns={columns.map((c) => ({
            key: c.key,
            header: c.header,
            numeric: c.numeric,
            nowrap: c.numeric,
            cell: (r: Record<string, unknown>) => cell(r[c.key]),
          }))}
        />
      )}

      <p style={{ margin: '1rem 0 0', color: themeVar.textSecondary, maxWidth: '60ch' }}>
        Computed from the operational records when you opened this page — there
        is no stored copy to go stale. Reload to re-read.
      </p>
      <div style={{ marginTop: '0.5rem' }}>
        <StatusBadge kind="active" label={`Read at ${when(generatedAt)}`} />
      </div>
    </>
  );
}
