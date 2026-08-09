import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, DataTable } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { Badge, PRIORITY_STYLE, REQUEST_BADGE, humanise, when } from './shared';

export const dynamic = 'force-dynamic';

export interface TowingRequest {
  id: string;
  reference: string;
  contactName: string;
  contactPhone: string;
  vehicleDescription: string;
  pickupLocation: string;
  dropoffLocation: string | null;
  faultSummary: string;
  priority: string;
  status: string;
  cancelReason: string | null;
  receivedAt: string;
  recoveryId: string | null;
}

/**
 * `/operations/new-requests` — the queue a roadside call lands in.
 *
 * ⚠️ FILTERED TO `new` BY THE API, NOT BY THIS SCREEN. The list endpoint takes
 * a validated `status`; sending an unrecognised one is a 400 rather than an
 * empty list, because an empty list on this screen reads as "nobody needs
 * help" and that is the most dangerous wrong answer this workspace can give.
 */
export function NewRequestsScreen() {
  return (
    <>
      <PageHeader
        title="New Requests"
        description="Roadside calls waiting to be triaged. Emergencies sort first, then longest waiting."
      />
      <Suspense fallback={<LoadingState label="Loading requests…" />}>
        <Rows />
      </Suspense>
    </>
  );
}

async function Rows() {
  const result = await apiGet<TowingRequest[]>('towing', '/towing/requests?status=new');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No new requests"
        description="When a roadside call is logged it appears here, emergencies first. Triaged calls move to the dispatch board."
      />
    );
  }

  return (
    <DataTable
      caption="New roadside requests"
      summary={`${result.data.length} waiting`}
      rows={result.data}
      rowKey={(r) => r.id}
      columns={[
        { key: 'ref', header: 'Reference', nowrap: true, cell: (r) => r.reference },
        {
          key: 'priority',
          header: 'Priority',
          nowrap: true,
          cell: (r) => <span style={PRIORITY_STYLE[r.priority]}>{humanise(r.priority)}</span>,
        },
        {
          key: 'caller',
          header: 'Caller',
          cell: (r) => (
            <>
              <div style={{ color: themeVar.textPrimary }}>{r.contactName}</div>
              {/* A phone number on a dispatch screen must be dialable in one
                  tap — the dispatcher is often already holding a handset. */}
              <a href={`tel:${r.contactPhone}`} style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {r.contactPhone}
              </a>
            </>
          ),
        },
        { key: 'vehicle', header: 'Vehicle', cell: (r) => r.vehicleDescription },
        {
          key: 'where',
          header: 'Pick-up',
          cell: (r) => (
            <>
              <div>{r.pickupLocation}</div>
              {r.dropoffLocation ? (
                <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  → {r.dropoffLocation}
                </div>
              ) : null}
            </>
          ),
        },
        { key: 'fault', header: 'Reported fault', cell: (r) => r.faultSummary },
        { key: 'received', header: 'Received', numeric: true, nowrap: true, cell: (r) => when(r.receivedAt) },
        { key: 'status', header: 'Status', nowrap: true, cell: (r) => <Badge map={REQUEST_BADGE} value={r.status} /> },
      ]}
    />
  );
}
