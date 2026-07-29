import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The vehicle owner's garage — `01 (1).txt` §33, and the first screen in this
 * product built for a CUSTOMER rather than for workshop staff.
 *
 * ⚠️ THIS IS THE SCREEN THAT FINALLY EXERCISES OWNER-SCOPING. `01 (1).txt` §19:
 * "Vehicle owners shall see only vehicles they own or are authorized to manage."
 * `VehicleService.list` implements that by narrowing a viewer whose role is
 * `customer` to vehicles whose customer record carries THEIR `user_id` — and
 * until this page existed, nothing had ever called it with such a viewer. The
 * rule was written, tested against a mock, and never once run against real data.
 *
 * RLS CANNOT DO THIS. A customer sits INSIDE the tenant, so the tenant policy is
 * satisfied for every row in it; without the predicate in the service, a
 * signed-in customer would see the workshop's entire vehicle register. The
 * proof that it works is that this page shows FEWER vehicles than the workshop
 * screens do, for the same tenant, at the same moment.
 *
 * It calls the SAME endpoint the workshop's list calls — `GET /vehicles`. The
 * difference is entirely who is asking, which is the property worth having:
 * there is no customer-only endpoint that could drift from the staff one.
 */

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
  variant: string | null;
  modelYear: number | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  insurerName: string | null;
  insuranceExpiresOn: string | null;
  status: string;
}

function mileage(km: number | null): string {
  // `0` is a real reading on a new vehicle, so this must not use falsiness.
  return km === null ? '—' : `${km.toLocaleString('en-GB')} km`;
}

export function GarageScreen() {
  return (
    <>
      <PageHeader
        title="Vehicle Garage"
        description="The vehicles registered to you. Only your own vehicles appear here."
      />
      <Suspense fallback={<LoadingState label="Loading your vehicles…" />}>
        <GarageList />
      </Suspense>
    </>
  );
}

async function GarageList() {
  const result = await apiGet<Vehicle[]>('customer', '/vehicles');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="customer" />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No vehicles yet"
        description="When a workshop registers a vehicle to you, it appears here with its full service history. You can also add one yourself from Add Vehicle."
      />
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
      {result.data.map((v) => (
        <li
          key={v.id}
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.surfaceRaised,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
            <span
              style={{
                // A plate is read character by character — `01 (1).txt` §2845.
                fontFamily: primitive.fontFamily.mono,
                fontWeight: 600,
                fontSize: primitive.fontSize.lg,
                color: themeVar.textPrimary,
              }}
            >
              {v.registrationNumber}
            </span>
            <span style={{ color: themeVar.textPrimary }}>
              {[v.make, v.model, v.variant].filter(Boolean).join(' ')}
              {v.modelYear ? ` · ${v.modelYear}` : ''}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <StatusBadge kind={v.status === 'active' ? 'active' : 'draft'} label={v.status} />
            </span>
          </div>
          <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {mileage(v.currentMileageKm)}
            {v.fuelType ? ` · ${v.fuelType}` : ''}
            {v.insurerName ? ` · insured with ${v.insurerName}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
