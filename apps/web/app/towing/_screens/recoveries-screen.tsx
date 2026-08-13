import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { Badge, RECOVERY_BADGE, card, grid, humanise, money, when } from './shared';
import { advanceRecoveryAction, raiseInvoiceAction, reportIncidentAction } from './towing-actions';

export const dynamic = 'force-dynamic';

export interface Recovery {
  id: string;
  status: string;
  dispatchedAt: string;
  completedAt: string | null;
  distanceKm: string | null;
  cancelReason: string | null;
  notes: string | null;
  reference: string;
  contactName: string;
  pickupLocation: string;
  dropoffLocation: string | null;
  vehicleDescription: string;
  priority: string;
  driverName: string;
  driverPhone: string;
  vehicleRegistration: string;
  vehicleLabel: string;
  invoiceId: string | null;
  invoiceStatus: string | null;
}

/**
 * Two screens, one component: `/operations/active-recoveries` and
 * `/operations/completed-recoveries`.
 *
 * ⚠️ THE SPLIT IS A `scope`, NOT A STATUS FILTER THE CLIENT CHOOSES. Which
 * statuses count as "active" is decided once, in `ACTIVE_RECOVERY_STATUSES`,
 * and the dashboard tile counts with the same list. Two definitions of active
 * is how a board shows four jobs and a tile says three.
 */
export function RecoveriesScreen({ scope }: { scope: 'active' | 'completed' }) {
  const active = scope === 'active';
  return (
    <>
      <PageHeader
        title={active ? 'Active Recoveries' : 'Completed Recoveries'}
        description={
          active
            ? 'Trucks currently out. Move a job along as the driver reports in.'
            : 'Finished and cancelled recoveries, newest first.'
        }
      />
      <Suspense fallback={<LoadingState label="Loading recoveries…" />}>
        <Rows scope={scope} />
      </Suspense>
    </>
  );
}

const NEXT_STATUS: Record<string, string[]> = {
  dispatched: ['en_route', 'cancelled'],
  en_route: ['on_scene', 'cancelled'],
  on_scene: ['towing', 'cancelled'],
  towing: ['completed', 'cancelled'],
};

async function Rows({ scope }: { scope: 'active' | 'completed' }) {
  const result = await apiGet<Recovery[]>('towing', `/towing/recoveries?scope=${scope}`);
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return scope === 'active' ? (
      <EmptyState
        title="No trucks out"
        description="Dispatch a triaged call from the dispatch board and it appears here."
      />
    ) : (
      <EmptyState
        title="Nothing completed yet"
        description="Recoveries move here once they are completed or cancelled."
      />
    );
  }

  return (
    <div style={grid}>
      {result.data.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ color: themeVar.textPrimary }}>{r.reference}</strong>
            <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              {r.driverName} · {r.vehicleLabel} ({r.vehicleRegistration})
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Badge map={RECOVERY_BADGE} value={r.status} />
            </span>
          </div>

          <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
            {r.vehicleDescription} — {r.pickupLocation}
            {r.dropoffLocation ? ` → ${r.dropoffLocation}` : ''}
          </p>
          <p style={{ margin: `${primitive.space[1]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            Dispatched {when(r.dispatchedAt)}
            {r.completedAt ? ` · completed ${when(r.completedAt)}` : ''}
            {r.distanceKm ? ` · ${r.distanceKm} km` : ''}
            {' · '}
            <a href={`tel:${r.driverPhone}`} style={{ color: themeVar.textSecondary }}>
              call {r.driverName.split(' ')[0]}
            </a>
          </p>

          {r.cancelReason ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary }}>
              Cancelled: {r.cancelReason}
            </p>
          ) : null}

          {scope === 'active' ? <Advance recovery={r} /> : <Settle recovery={r} />}
        </div>
      ))}
    </div>
  );
}

/** The forward moves available from this exact status — nothing else. */
function Advance({ recovery }: { recovery: Recovery }) {
  const next = NEXT_STATUS[recovery.status] ?? [];
  return (
    <div style={{ display: 'grid', gap: primitive.space[2], marginTop: primitive.space[3] }}>
      {next.map((status) => (
        <form key={status} action={advanceRecoveryAction} style={row}>
          <input type="hidden" name="recoveryId" value={recovery.id} />
          <input type="hidden" name="status" value={status} />
          {/* Completing prices the invoice, so the distance is asked for HERE
              rather than invented later. The API leaves it unchanged when the
              box is empty, so a driver who does not know yet is not blocked. */}
          {status === 'completed' ? (
            <input name="distanceKm" type="number" min={0} step="0.1" placeholder="km travelled" style={control} />
          ) : null}
          {/* `ck_recovery_cancelled` requires a reason, so the form asks for one
              rather than letting the database refuse a submitted form. */}
          {status === 'cancelled' ? (
            <input name="cancelReason" required maxLength={1000} placeholder="Why is it cancelled?" style={{ ...control, minWidth: '16rem' }} />
          ) : null}
          <button type="submit" style={status === 'cancelled' ? submitQuiet : submit}>
            {status === 'cancelled' ? 'Cancel recovery' : `Mark ${humanise(status).toLowerCase()}`}
          </button>
        </form>
      ))}
      <ReportIncident recoveryId={recovery.id} />
    </div>
  );
}

/** A completed recovery either has an invoice or can be given one. */
function Settle({ recovery }: { recovery: Recovery }) {
  if (recovery.status === 'cancelled') return null;
  if (recovery.invoiceId) {
    return (
      <p style={{ margin: `${primitive.space[3]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Invoiced ({recovery.invoiceStatus}) — see <Link href="/towing/operations/invoices">Invoices</Link>.
      </p>
    );
  }
  return (
    <form action={raiseInvoiceAction} style={{ ...row, marginTop: primitive.space[3] }}>
      <input type="hidden" name="recoveryId" value={recovery.id} />
      <input name="otherCharges" type="number" min={0} step="0.01" placeholder="Other charges" style={control} />
      <button type="submit" style={submit}>
        Raise invoice
      </button>
      <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Call-out fee and per-km rate come from{' '}
        <Link href="/towing/operations/settings">Settings</Link>
        {recovery.distanceKm
          ? ` · ${recovery.distanceKm} km recorded`
          : ' · no distance recorded, so the invoice will be the call-out fee alone'}
      </span>
    </form>
  );
}

function ReportIncident({ recoveryId }: { recoveryId: string }) {
  return (
    <details style={{ marginTop: primitive.space[1] }}>
      <summary style={{ cursor: 'pointer', color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Report an incident on this recovery
      </summary>
      <form action={reportIncidentAction} style={{ ...row, marginTop: primitive.space[2] }}>
        <input type="hidden" name="recoveryId" value={recoveryId} />
        <select name="kind" style={control} defaultValue="other">
          {['vehicle_damage', 'injury', 'equipment_failure', 'delay', 'dispute', 'other'].map((k) => (
            <option key={k} value={k}>
              {humanise(k)}
            </option>
          ))}
        </select>
        <select name="severity" style={control} defaultValue="low">
          {['low', 'medium', 'high'].map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </select>
        <input name="summary" required maxLength={4000} placeholder="What happened?" style={{ ...control, minWidth: '18rem' }} />
        <button type="submit" style={submit}>
          Report
        </button>
      </form>
    </details>
  );
}

const row: React.CSSProperties = {
  display: 'flex',
  gap: primitive.space[2],
  flexWrap: 'wrap',
  alignItems: 'center',
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
const submitQuiet: React.CSSProperties = { ...control, cursor: 'pointer' };
