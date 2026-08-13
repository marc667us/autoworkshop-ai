import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { Badge, PRIORITY_STYLE, REQUEST_BADGE, card, grid, humanise, when } from './shared';
import type { TowingRequest } from './requests-screen';
import type { Driver } from './drivers-screen';
import type { RecoveryVehicle } from './recovery-vehicles-screen';
import { dispatchAction } from './towing-actions';

export const dynamic = 'force-dynamic';

/**
 * `/operations/dispatch-board` — the one screen where a request becomes a job.
 *
 * ⚠️ THE THREE LISTS ARE FETCHED IN PARALLEL. Sequentially they would be three
 * round trips before anything renders, and this is the screen somebody is
 * looking at while a caller waits on the line.
 *
 * ⚠️ WHEN THERE IS NO DRIVER OR NO TRUCK, THE FORM SAYS SO INSTEAD OF
 * RENDERING A DISABLED BUTTON. A control that cannot work, with no explanation
 * of what to do instead, is the "wall" defect this repository has paid for more
 * than any other — the API told technicians to start a new inspection and the
 * UI had no way to.
 */
export function DispatchBoardScreen() {
  return (
    <>
      <PageHeader
        title="Dispatch Board"
        description="Triaged calls, and the drivers and trucks free to take them."
      />
      <Suspense fallback={<LoadingState label="Loading the board…" />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  const [requests, drivers, vehicles] = await Promise.all([
    apiGet<TowingRequest[]>('towing', '/towing/requests?status=triaged'),
    apiGet<Driver[]>('towing', '/towing/drivers'),
    apiGet<RecoveryVehicle[]>('towing', '/towing/vehicles'),
  ]);

  // Any one failing makes the board wrong rather than partial: dispatching
  // against a stale driver list is how two jobs go to one person.
  if (!requests.ok) return <ApiFailure reason={requests.reason} workspaceId="towing" />;
  if (!drivers.ok) return <ApiFailure reason={drivers.reason} workspaceId="towing" />;
  if (!vehicles.ok) return <ApiFailure reason={vehicles.reason} workspaceId="towing" />;

  const freeDrivers = drivers.data.filter((d) => d.status === 'available');
  const freeVehicles = vehicles.data.filter((v) => v.status === 'available');

  if (requests.data.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting to be dispatched"
        description="Calls appear here once they have been triaged. New calls are on the New Requests screen."
      />
    );
  }

  return (
    <div style={grid}>
      <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        {freeDrivers.length} driver{freeDrivers.length === 1 ? '' : 's'} and {freeVehicles.length} truck
        {freeVehicles.length === 1 ? '' : 's'} available.
      </p>

      {requests.data.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ color: themeVar.textPrimary }}>{r.reference}</strong>
            <span style={PRIORITY_STYLE[r.priority]}>{humanise(r.priority)}</span>
            <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              waiting since {when(r.receivedAt)}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Badge map={REQUEST_BADGE} value={r.status} />
            </span>
          </div>

          <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
            {r.vehicleDescription} — {r.faultSummary}
          </p>
          <p style={{ margin: `${primitive.space[1]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {r.pickupLocation}
            {r.dropoffLocation ? ` → ${r.dropoffLocation}` : ''} · {r.contactName}{' '}
            <a href={`tel:${r.contactPhone}`} style={{ color: themeVar.textSecondary }}>
              {r.contactPhone}
            </a>
          </p>

          {freeDrivers.length === 0 || freeVehicles.length === 0 ? (
            // The refusal names the reachable alternative, as every refusal here must.
            <p
              style={{
                margin: `${primitive.space[3]} 0 0 0`,
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {freeDrivers.length === 0 && freeVehicles.length === 0
                ? 'No driver and no truck are free. '
                : freeDrivers.length === 0
                  ? 'No driver is free. '
                  : 'No truck is free. '}
              Free one by completing a job on{' '}
              <Link href="/operations/active-recoveries">Active Recoveries</Link>, or add to the roster on{' '}
              <Link href="/operations/drivers">Drivers</Link> and{' '}
              <Link href="/operations/recovery-vehicles">Recovery Vehicles</Link>.
            </p>
          ) : (
            <form
              action={dispatchAction}
              style={{
                display: 'flex',
                gap: primitive.space[2],
                flexWrap: 'wrap',
                alignItems: 'end',
                marginTop: primitive.space[3],
              }}
            >
              <input type="hidden" name="requestId" value={r.id} />
              <label style={{ display: 'grid', gap: primitive.space[1] }}>
                <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>Driver</span>
                <select name="driverId" required style={control}>
                  {freeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: primitive.space[1] }}>
                <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>Truck</span>
                <select name="vehicleId" required style={control}>
                  {freeVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} ({v.registration})
                    </option>
                  ))}
                </select>
              </label>
              {/* 🔴 A SUBMIT BUTTON. A form shipped without one is a recorded
                  defect in this repository — 2 of 49 screens, found on live. */}
              <button type="submit" style={submit}>
                Dispatch
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

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
