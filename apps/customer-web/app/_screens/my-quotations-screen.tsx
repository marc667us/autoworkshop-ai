import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * YOUR QUOTATIONS — slice 12.
 *
 * ── 🔴 A QUOTATION APPEARS HERE WHEN IT REACHED YOU, NOT WHEN IT WAS WRITTEN ─
 *
 * `repair.quotations` starts as a `draft` and goes through the WORKSHOP'S OWN
 * internal approval before anyone offers it. The customer sees it only once a
 * `repair_proposals` row is `issued`. Listing quotations directly would show
 * prices the workshop is still arguing about internally — including ones it
 * decided not to offer — so the API joins through the proposal and this screen
 * dates each row by when it was ISSUED.
 *
 * ⚠️ THE PRICE EXCLUDES OPTIONAL LINES, matching what the invoice will charge.
 * An option the customer may decline is not part of the price they were quoted,
 * and showing a bigger headline number than the eventual bill is the kind of
 * discrepancy that ends in a dispute.
 *
 * ⚠️ THIS IS THE RECORD, NOT THE DECISION SCREEN. Answering a proposal happens
 * on Repair Proposals, which already exists and carries the consent fields.
 * Building a second answer path here would create two ways to approve the same
 * work — and the two would disagree the first time one changed.
 */

interface MyQuotationRow {
  id: string;
  proposalId: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  versionNo: number;
  status: string;
  decision: string | null;
  currency: string;
  total: string;
  validUntil: string | null;
  recommendedRepair: string | null;
  issuedAt: string | null;
  decidedAt: string | null;
  awaitingYou: boolean;
}

function state(r: MyQuotationRow) {
  if (r.awaitingYou) return <StatusBadge kind="attention" label="Needs your answer" />;
  if (r.decision === 'approved') return <StatusBadge kind="complete" label="You approved" />;
  if (r.decision === 'declined') return <StatusBadge kind="blocked" label="You declined" />;
  if (r.decision === 'changes_requested') {
    return <StatusBadge kind="active" label="Changes requested" />;
  }
  return <StatusBadge kind="active" label={r.status} />;
}

/** Expired is a fact about the DATE, and it is only interesting while unanswered. */
function expired(r: MyQuotationRow): boolean {
  return r.awaitingYou && r.validUntil !== null && new Date(r.validUntil) < new Date();
}

export async function MyQuotationsScreen() {
  const quotes = await apiGet<MyQuotationRow[]>('customer', '/my/quotations');

  const header = (
    <PageHeader
      title="Quotations"
      description="Every price the workshop has quoted you, including the ones you have not answered yet."
    />
  );

  if (!quotes.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={quotes.reason} workspaceId="customer" />
      </>
    );
  }

  if (quotes.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have not been quoted anything yet"
          description="A quotation appears here once the workshop has diagnosed a problem and priced the repair. Work still being looked at has no price yet."
        />
      </>
    );
  }

  const waiting = quotes.data.filter((q) => q.awaitingYou).length;

  return (
    <>
      {header}
      <DataTable
        caption={
          waiting === 0
            ? `${quotes.data.length} quotations · none waiting on you`
            : `${quotes.data.length} quotations · ${waiting} waiting on your answer`
        }
        rows={quotes.data}
        rowKey={(r) => r.proposalId}
        columns={[
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          {
            key: 'what',
            header: 'For',
            cell: (r) => r.recommendedRepair ?? 'See the proposal for detail',
          },
          {
            key: 'issued',
            header: 'Quoted',
            nowrap: true,
            cell: (r) => (r.issuedAt ? r.issuedAt.slice(0, 10) : '—'),
          },
          {
            key: 'valid',
            header: 'Valid until',
            nowrap: true,
            // An expired quotation that still wants an answer is the one fact a
            // customer needs flagged, not buried in a date they must compare.
            cell: (r) =>
              r.validUntil === null ? '—' : expired(r) ? `${r.validUntil} (expired)` : r.validUntil,
          },
          {
            key: 'total',
            header: 'Price',
            numeric: true,
            nowrap: true,
            cell: (r) => `${r.currency} ${r.total}`,
          },
          { key: 'v', header: 'Version', numeric: true, nowrap: true, cell: (r) => r.versionNo },
          { key: 'state', header: 'Status', cell: (r) => state(r) },
        ]}
      />
    </>
  );
}
