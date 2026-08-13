import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import Link from 'next/link';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * WHAT YOUR VEHICLES NEED — slice 13.
 *
 * ── 🔴 THIS IS NOT A RECOMMENDER, AND IT DOES NOT PRETEND TO BE ────────────
 *
 * The signpost promised suggestions "based on what has been fitted and how far
 * they have run". This product has no model, no purchase history worth mining
 * and no basis for "customers like you also bought" — and inventing one is the
 * disconnected mock page `05.txt` §2 forbids, dressed up as intelligence.
 *
 * So every row is a FACT already in the database: a maintenance item that has
 * come due against the vehicle's own recorded mileage, or a document expiring
 * within thirty days. An empty list means nothing is due, which is a true and
 * useful statement — as against a grid of plausible parts that means nothing.
 *
 * The page is named for what it does. When there is real fitment and interval
 * data to reason from, this is where that would go.
 */

interface RecommendationRow {
  kind: string;
  title: string;
  detail: string;
  registrationNumber: string | null;
  href: string;
}

export async function MyRecommendationsScreen() {
  const recs = await apiGet<RecommendationRow[]>('customer', '/my/recommendations');

  const header = (
    <PageHeader
      title="Recommendations"
      description="What your vehicles need next, taken from your own service schedule and documents — not from guesswork."
    />
  );

  if (!recs.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={recs.reason} workspaceId="customer" />
      </>
    );
  }

  if (recs.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing is due"
          description="No servicing has come due and no document is expiring in the next thirty days. This list is built from your maintenance schedule and your vehicle documents, so adding items there is what makes it useful."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${recs.data.length} thing${recs.data.length === 1 ? '' : 's'} to look at`}
        rows={recs.data}
        rowKey={(r) => `${r.kind}:${r.title}:${r.registrationNumber ?? ''}`}
        columns={[
          {
            key: 'kind',
            header: 'Kind',
            nowrap: true,
            cell: (r) =>
              r.kind === 'servicing' ? (
                <StatusBadge kind="attention" label="Servicing" />
              ) : (
                <StatusBadge kind="attention" label="Document" />
              ),
          },
          { key: 'title', header: 'What', cell: (r) => r.title },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'detail', header: 'Why', cell: (r) => r.detail },
          {
            key: 'go',
            header: '',
            nowrap: true,
            // Every row goes somewhere real. A recommendation with no next step
            // is a notification, and this page is not that.
            cell: (r) => <Link href={r.href}>Open</Link>,
          },
        ]}
      />
    </>
  );
}
