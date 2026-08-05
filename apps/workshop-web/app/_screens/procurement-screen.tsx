import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { raiseRequisitionAction } from './parts-actions';
import { RequisitionDecision } from './requisition-decision';

/**
 * PROCUREMENT — what the workshop needs and what it has ordered. Slice 4.
 *
 * Mounted at §46 `/parts-and-suppliers/procurement`, §34
 * `/parts-and-supply/procurement` and §48 `/parts/purchase-requisitions`.
 *
 * ── ⚠️ RAISING A REQUISITION IS DELIBERATELY WIDE ──────────────────────────
 *
 * A technician, the supervisor and reception can all ask for a part. That is not
 * looseness: a technician who CANNOT raise one writes it on a scrap of paper,
 * and the workshop loses both the request and the reason. Approving is narrow —
 * it commits the workshop's money — which is the same asymmetry as recording a
 * payment versus issuing a refund.
 *
 * ── ⚠️ FREE TEXT AS WELL AS A STOCK LINE ───────────────────────────────────
 *
 * `stock_item_id` is optional. Asking for something the workshop has never
 * carried is the normal case, and forcing a stock line first is exactly how the
 * request ends up on paper.
 */

interface RequisitionRow {
  id: string;
  requisition_number: string;
  description: string;
  quantity: string;
  part_number: string | null;
  job_number: string | null;
  needed_by: string | null;
  status: string;
  decision_reason: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  requested_at: string;
}

interface PurchaseOrderRow {
  id: string;
  order_number: string;
  supplier_name: string;
  status: string;
  currency: string;
  total: string;
  line_count: string;
  receipt_count: string;
  expected_on: string | null;
  created_at: string;
}

interface StockOption { stockItemId: string; partNumber: string; name: string }
interface JobOption { id: string; jobNumber: string; registrationNumber: string | null }

const REQ_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  requested: 'attention',
  approved: 'active',
  ordered: 'complete',
  rejected: 'blocked',
  cancelled: 'draft',
};

const PO_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  draft: 'draft',
  sent: 'active',
  part_received: 'attention',
  received: 'complete',
  cancelled: 'blocked',
};

function day(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('sv-SE');
  } catch {
    return iso;
  }
}

export async function ProcurementScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Procurement');

  const [requisitions, orders, stock, jobs] = await Promise.all([
    apiGet<RequisitionRow[]>('workshop', '/requisitions'),
    apiGet<PurchaseOrderRow[]>('workshop', '/purchase-orders'),
    apiGet<StockOption[]>('workshop', '/stock'),
    apiGet<JobOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="What the workshop has asked for, and what has been ordered. Anyone can raise a requisition; approving one commits the workshop's money, so that is narrower."
    />
  );

  if (!requisitions.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={requisitions.reason} workspaceId="workshop" />
      </>
    );
  }

  const open = requisitions.data.filter((r) => r.status === 'requested');

  return (
    <>
      {header}

      {requisitions.data.length === 0 ? (
        <EmptyState
          title="Nothing has been requested"
          description="Raise a requisition for a part the workshop needs. It stays here until somebody approves or rejects it — with a reason either way."
        />
      ) : (
        <DataTable
          caption="Requisitions"
          summary={`${open.length} waiting on a decision · ${requisitions.data.length} in total`}
          rowKey={(r) => r.id}
          rows={requisitions.data}
          columns={[
            { key: 'no', header: 'Request', nowrap: true, cell: (r) => r.requisition_number },
            { key: 'what', header: 'What', cell: (r) => r.description },
            { key: 'qty', header: 'How many', numeric: true, nowrap: true, cell: (r) => r.quantity },
            { key: 'part', header: 'Stock line', secondary: true,
              cell: (r) => r.part_number ?? 'Not stocked' },
            { key: 'job', header: 'For job', secondary: true, nowrap: true,
              cell: (r) => r.job_number ?? '—' },
            { key: 'by', header: 'Asked by', secondary: true,
              cell: (r) => r.requested_by_name ?? '—' },
            { key: 'needed', header: 'Needed by', numeric: true, nowrap: true,
              cell: (r) => day(r.needed_by) },
            {
              key: 'status', header: 'Status',
              cell: (r) => (
                <>
                  <StatusBadge kind={REQ_TONE[r.status] ?? 'draft'} label={r.status} />
                  {/* The reason belongs beside the decision, not on another
                      screen — it is the thing the person who asked wants. */}
                  {r.decision_reason ? (
                    <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8 }}>
                      {r.decision_reason}
                    </span>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      )}

      {open.length > 0 ? (
        <>
          <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Decide a requisition</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {open.map((r) => (
              <li key={r.id}>
                <RequisitionDecision
                  requisitionId={r.id}
                  revalidate={route}
                  summary={`${r.requisition_number} — ${r.quantity} × ${r.description}${r.requested_by_name ? ` (${r.requested_by_name})` : ''}`}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Purchase orders</h2>
      {!orders.ok || orders.data.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description="Parts bought through the public marketplace basket become an order here once the supplier confirms. Orders placed by telephone can be recorded too."
        />
      ) : (
        <DataTable
          caption="Purchase orders"
          summary={`${orders.data.length} order${orders.data.length === 1 ? '' : 's'}`}
          rowKey={(o) => o.id}
          rows={orders.data}
          columns={[
            { key: 'no', header: 'Order', nowrap: true, cell: (o) => o.order_number },
            { key: 'supplier', header: 'Supplier', cell: (o) => o.supplier_name },
            { key: 'lines', header: 'Lines', numeric: true, nowrap: true, secondary: true,
              cell: (o) => o.line_count },
            { key: 'total', header: 'Total', numeric: true, nowrap: true,
              cell: (o) => `${o.currency} ${Number(o.total).toFixed(2)}` },
            { key: 'expected', header: 'Expected', numeric: true, nowrap: true,
              cell: (o) => day(o.expected_on) },
            {
              key: 'received', header: 'Deliveries', numeric: true, nowrap: true, secondary: true,
              cell: (o) => (Number(o.receipt_count) === 0 ? 'None yet' : o.receipt_count),
            },
            { key: 'status', header: 'Status',
              cell: (o) => <StatusBadge kind={PO_TONE[o.status] ?? 'draft'} label={o.status.replace('_', ' ')} /> },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Ask for a part</h2>
      <FormShell action={raiseRequisitionAction} successPrefix="Raised">
        <Field
          label="What is needed"
          hint="Plain words are fine — it does not have to be something the workshop already stocks."
          htmlFor="description"
        >
          <TextInput id="description" name="description" required maxLength={1000} />
        </Field>
        <Field label="How many" htmlFor="quantity">
          <TextInput id="quantity" name="quantity" type="number" min={1} step="0.001" required />
        </Field>
        <Field label="Existing stock line" hint="Optional — only if the workshop already carries it." htmlFor="stockItemId">
          <Select
            id="stockItemId"
            name="stockItemId"
            options={[
              { value: '', label: 'Not a stocked part' },
              ...(stock.ok
                ? stock.data.map((s) => ({ value: s.stockItemId, label: `${s.partNumber} — ${s.name}` }))
                : []),
            ]}
          />
        </Field>
        <Field label="For which job" hint="Optional." htmlFor="jobCardId">
          <Select
            id="jobCardId"
            name="jobCardId"
            options={[
              { value: '', label: 'Not for a specific job' },
              ...(jobs.ok
                ? jobs.data.map((j) => ({
                    value: j.id,
                    label: `${j.jobNumber}${j.registrationNumber ? ` — ${j.registrationNumber}` : ''}`,
                  }))
                : []),
            ]}
          />
        </Field>
        <Field label="Needed by" htmlFor="neededBy">
          <TextInput id="neededBy" name="neededBy" type="date" />
        </Field>
        <SubmitButton>Raise the requisition</SubmitButton>
      </FormShell>
    </>
  );
}
