import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * YOUR WARRANTY — slice 12.
 *
 * ⚠️ "ACTIVE" IS COMPUTED FROM THE DATE, NOT READ FROM `status`. A policy's
 * stored status moves to `expired` only when something updates it, and nothing
 * runs nightly in this product. Telling a customer a warranty is active because
 * a column was never updated is the "stored flag goes stale" defect the
 * maintenance schedule already refuses to make — and here it would be a promise
 * of cover that does not exist.
 *
 * 🔴 THE MILEAGE LIMIT IS SHOWN, NOT JUDGED. Whether the vehicle has passed it
 * depends on an odometer reading nobody has taken since the last visit. The
 * screen states the limit and lets the customer compare it against their own
 * dashboard; deriving a verdict from a stale reading would be a confident wrong
 * answer to "am I covered?".
 */

interface MyPolicyRow {
  id: string;
  policyNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  coverSummary: string;
  startsOn: string;
  expiresOn: string | null;
  expiresAtOdometer: number | null;
  status: string;
  isActive: boolean;
  daysRemaining: number | null;
  claimCount: number;
}

function state(r: MyPolicyRow) {
  if (r.status === 'voided') return <StatusBadge kind="blocked" label="Voided" />;
  if (!r.isActive) return <StatusBadge kind="blocked" label="Expired" />;
  // Thirty days is the same look-ahead the customer's notifications use for
  // documents, so the two do not disagree about what "soon" means.
  if (r.daysRemaining !== null && r.daysRemaining <= 30) {
    return <StatusBadge kind="attention" label={`Ends in ${r.daysRemaining} days`} />;
  }
  return <StatusBadge kind="complete" label="Active" />;
}

function limit(r: MyPolicyRow): string {
  const parts: string[] = [];
  if (r.expiresOn) parts.push(r.expiresOn);
  if (r.expiresAtOdometer !== null) parts.push(`${r.expiresAtOdometer.toLocaleString()} km`);
  // 043 requires at least one limit, so this is defensive rather than expected.
  return parts.length === 0 ? 'no stated limit' : parts.join(' or ');
}

export async function MyWarrantyScreen() {
  const policies = await apiGet<MyPolicyRow[]>('customer', '/my/warranty');

  const header = (
    <PageHeader
      title="Warranty"
      description="The warranty covering each completed repair, what it covers and when it ends. Where a mileage limit applies, check it against your own odometer."
    />
  );

  if (!policies.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={policies.reason} workspaceId="customer" />
      </>
    );
  }

  if (policies.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No warranties yet"
          description="A warranty appears here when the workshop issues one against a completed repair. Terms for work you have approved are stated on the repair proposal."
        />
      </>
    );
  }

  const active = policies.data.filter((p) => p.isActive).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${policies.data.length} warranties · ${active} still active`}
        rows={policies.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'no', header: 'Policy', nowrap: true, cell: (r) => r.policyNumber },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'job', header: 'Job', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'cover', header: 'Covers', cell: (r) => r.coverSummary },
          { key: 'from', header: 'From', nowrap: true, cell: (r) => r.startsOn },
          { key: 'until', header: 'Until', nowrap: true, cell: (r) => limit(r) },
          {
            key: 'claims',
            header: 'Claims',
            numeric: true,
            nowrap: true,
            cell: (r) => (r.claimCount === 0 ? '—' : r.claimCount),
          },
          { key: 'state', header: 'Status', cell: (r) => state(r) },
        ]}
      />
    </>
  );
}
