import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';

/**
 * PARTS COMPATIBILITY — slice 14.
 *
 * ── 🔴 THIS ANSWERS "WHAT IS RECORDED", NOT "WHAT FITS" ────────────────────
 *
 * `catalogue.part_fitments` holds make/model/year rows that suppliers and the
 * workshop entered. An absent row means NOBODY HAS RECORDED that combination —
 * it does not mean the part will not fit.
 *
 * That distinction is the whole reason this screen says it out loud. A
 * technician who reads a silent empty list as "does not fit" orders a part the
 * workshop already has on the shelf, and a screen that let them believe it
 * would be worse than no screen. `05.txt` §2's ban on disconnected mock pages
 * is the same instinct: do not let a UI imply knowledge the data does not hold.
 */

interface FitmentRow {
  partId: string;
  partNumber: string | null;
  name: string | null;
  make: string;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

function years(r: FitmentRow): string {
  if (r.yearFrom === null && r.yearTo === null) return 'any year';
  if (r.yearFrom !== null && r.yearTo === null) return `${r.yearFrom} onwards`;
  if (r.yearFrom === null && r.yearTo !== null) return `up to ${r.yearTo}`;
  return `${r.yearFrom}–${r.yearTo}`;
}

export async function PartsCompatibilityScreen({
  make,
  partNumber,
}: {
  make?: string;
  partNumber?: string;
}) {
  const qs = new URLSearchParams();
  if (make) qs.set('make', make);
  if (partNumber) qs.set('partNumber', partNumber);
  const fitments = await apiGet<FitmentRow[]>(
    'workshop',
    `/plan-work/compatibility${qs.toString() ? `?${qs}` : ''}`,
  );

  const header = (
    <PageHeader
      title="Parts Compatibility"
      description="Which vehicles a part is RECORDED as fitting. An empty result means nobody has recorded that combination — not that the part does not fit."
    />
  );

  if (!fitments.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={fitments.reason} workspaceId="workshop" />
      </>
    );
  }

  if (fitments.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing recorded for that"
          description="No fitment has been entered for this combination. That is a gap in the register, not a verdict on the part — check the supplier's own listing, and record what you confirm so the next person does not have to."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${fitments.data.length} recorded fitments`}
        rows={fitments.data}
        rowKey={(r) => `${r.partId}:${r.make}:${r.model ?? ''}:${r.yearFrom ?? ''}`}
        columns={[
          { key: 'pn', header: 'Part number', nowrap: true, cell: (r) => r.partNumber ?? '—' },
          { key: 'name', header: 'Part', cell: (r) => r.name ?? '—' },
          { key: 'make', header: 'Make', nowrap: true, cell: (r) => r.make },
          { key: 'model', header: 'Model', nowrap: true, cell: (r) => r.model ?? 'all models' },
          { key: 'years', header: 'Years', nowrap: true, cell: (r) => years(r) },
        ]}
      />
    </>
  );
}
