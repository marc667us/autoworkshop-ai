import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
// Reused, never re-derived: two stage vocabularies would drift and tell the
// customer two different things about one car.
import { customerStage, needsCustomer } from './repair-journey';
// Pure and import-free so it can be unit-tested — this screen cannot be,
// because next-shell pulls in next-auth.
import { currentRepairByVehicle, type JobCardStatus } from './garage-status';

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

/**
 * The card's answer to "what is happening to my car?".
 *
 * 🔴 THE DEFECT THIS FIXES. This card showed `v.status` — the VEHICLE RECORD's
 * status, which reads `active` or `draft`. That is a database lifecycle field
 * about the row, and it was the only badge on the card, so a customer whose car
 * was in the workshop being repaired saw the word "active" and learned nothing.
 * Owner, 2026-08-06: *"they must have views on each section or card outputs on
 * what the status on their vehicle repair"*.
 *
 * `stage` is the REPAIR's stage, and `customerStage()` turns it into the
 * customer's own words — "Being repaired", "Waiting for your approval". That map
 * already existed for the repair-journey screen; it is reused rather than
 * re-derived, because two stage vocabularies would drift and the customer would
 * be told two different things about one car.
 */
async function GarageList() {
  // 🔴 FETCHED IN PARALLEL, AND THE JOB CARDS ARE ALLOWED TO FAIL.
  //
  // The vehicles are the point of this screen; the repair status is an
  // enrichment. If `/job-cards` is unavailable the garage must still list the
  // cars — degrading to "no status shown" is a far smaller failure than an
  // error page where the customer's own vehicles used to be. So its result is
  // consulted, never asserted.
  const [result, cards] = await Promise.all([
    apiGet<Vehicle[]>('customer', '/vehicles'),
    apiGet<JobCardStatus[]>('customer', '/job-cards'),
  ]);

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="customer" />;
  }

  const current = currentRepairByVehicle(cards.ok ? cards.data : []);

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
            {/*
              THE REPAIR'S STATUS WHEN THERE IS ONE, THE RECORD'S WHEN THERE IS
              NOT. A car with nothing open genuinely has no repair status, and
              inventing "no active repair" as a badge would be noise on every
              card in a garage of parked cars. The vehicle badge stays as the
              honest fallback.
            */}
            <span style={{ marginLeft: 'auto' }}>
              {current.has(v.id) ? (
                <StatusBadge
                  kind={customerStage(current.get(v.id)!.stage).badge}
                  label={customerStage(current.get(v.id)!.stage).label}
                />
              ) : (
                <StatusBadge kind={v.status === 'active' ? 'active' : 'draft'} label={v.status} />
              )}
            </span>
          </div>

          {/*
            One sentence of what is actually happening, and a way through to it.
            A badge alone says "Waiting for your approval" without saying what
            to approve or where — which is the shape of every status display
            that leaves people stuck.
          */}
          {current.has(v.id) ? (
            <p
              style={{
                margin: `${primitive.space[2]} 0 0 0`,
                color: needsCustomer(current.get(v.id)!.stage)
                  ? themeVar.textPrimary
                  : themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
                fontWeight: needsCustomer(current.get(v.id)!.stage) ? 600 : 400,
              }}
            >
              {customerStage(current.get(v.id)!.stage).detail}{' '}
              <Link href="/service-and-repairs/repair-tracking">Track this repair</Link>
            </p>
          ) : null}

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
