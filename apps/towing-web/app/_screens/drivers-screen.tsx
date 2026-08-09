import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, DataTable } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { AVAILABILITY_BADGE, Badge, grid } from './shared';
import { addDriverAction } from './towing-actions';

export const dynamic = 'force-dynamic';

export interface Driver {
  id: string;
  fullName: string;
  phone: string;
  licenceNumber: string | null;
  licenceExpires: string | null;
  status: string;
  userId: string | null;
  completedCount: number;
}

/**
 * `/operations/drivers` — the roster, and the only place a driver is added.
 *
 * ⚠️ THE CREATE FORM IS ON THE LIST SCREEN, not behind an "Add new" that leads
 * elsewhere. Open item A3 in the handover is that 2 of ~40 list screens have
 * any way to create anything; a roster you cannot add to is a read-only view of
 * an empty table on day one, and the dispatch board is dead until it has rows.
 */
export function DriversScreen() {
  return (
    <>
      <PageHeader title="Drivers" description="Who can be dispatched, and who is already out." />
      <div style={grid}>
        <AddDriver />
        <Suspense fallback={<LoadingState label="Loading the roster…" />}>
          <Rows />
        </Suspense>
      </div>
    </>
  );
}

function AddDriver() {
  return (
    <details style={panel}>
      <summary style={summaryStyle}>Add a driver</summary>
      <form action={addDriverAction} style={formRow}>
        <Labelled label="Full name">
          <input name="fullName" required maxLength={200} style={control} />
        </Labelled>
        <Labelled label="Phone">
          <input name="phone" required maxLength={40} inputMode="tel" style={control} />
        </Labelled>
        <Labelled label="Licence number">
          <input name="licenceNumber" maxLength={80} style={control} />
        </Labelled>
        <Labelled label="Licence expires">
          <input name="licenceExpires" type="date" style={control} />
        </Labelled>
        {/* 🔴 A SUBMIT BUTTON. A form shipped without one is a recorded defect
            here — 2 of 49 screens, found on live rather than in a test. */}
        <button type="submit" style={submit}>
          Add driver
        </button>
      </form>
    </details>
  );
}

async function Rows() {
  const result = await apiGet<Driver[]>('towing', '/towing/drivers');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No drivers yet"
        description="Add the first driver above. Until one is available the dispatch board cannot send anybody out."
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DataTable
      caption="Recovery drivers"
      summary={`${result.data.length} on the roster`}
      rows={result.data}
      rowKey={(d) => d.id}
      columns={[
        { key: 'name', header: 'Driver', cell: (d) => d.fullName },
        {
          key: 'phone',
          header: 'Phone',
          nowrap: true,
          cell: (d) => (
            <a href={`tel:${d.phone}`} style={{ color: themeVar.textSecondary }}>
              {d.phone}
            </a>
          ),
        },
        {
          key: 'licence',
          header: 'Licence',
          nowrap: true,
          // An expired licence is a legal problem, not a cosmetic one, so it is
          // called out on the row rather than left for someone to compute.
          cell: (d) => {
            if (!d.licenceExpires) return d.licenceNumber ?? '—';
            const expired = d.licenceExpires < today;
            return (
              <span style={{ fontWeight: expired ? 700 : 400 }}>
                {d.licenceNumber ?? '—'} {expired ? '(EXPIRED)' : `to ${d.licenceExpires}`}
              </span>
            );
          },
        },
        { key: 'done', header: 'Completed', numeric: true, cell: (d) => d.completedCount },
        {
          key: 'status',
          header: 'Status',
          nowrap: true,
          cell: (d) => <Badge map={AVAILABILITY_BADGE} value={d.status} />,
        },
      ]}
    />
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: primitive.space[1] }}>
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
      {children}
    </label>
  );
}

const panel: React.CSSProperties = {
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.lg,
  padding: primitive.space[3],
};
const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 600,
  color: themeVar.textPrimary,
};
const formRow: React.CSSProperties = {
  display: 'flex',
  gap: primitive.space[2],
  flexWrap: 'wrap',
  alignItems: 'end',
  marginTop: primitive.space[3],
};
const control: React.CSSProperties = {
  height: '2.25rem',
  padding: `0 ${primitive.space[2]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
};
const submit: React.CSSProperties = {
  ...control,
  cursor: 'pointer',
  fontWeight: 600,
  borderColor: themeVar.textPrimary,
};
