import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { quickCreateHref } from '@autoworkshop/next-shell';
import { QuickCreateButton } from './quick-create-button';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';

/**
 * The vehicles screen — ONE implementation, mounted at several routes. See
 * `customers-screen.tsx` for why that is necessary; the same role trees route
 * this concept to different paths:
 *
 *   · §34 default    `/customer-reception/vehicles`
 *   · §46 owner      `/customers-and-vehicles/vehicles`
 *   · §48 reception  `/vehicles/vehicle-search`
 *
 * THIS IS WHERE THE OWNER'S SCHEMA RULE BECOMES VISIBLE. Every column that is
 * not a plain vehicle attribute is a JOIN: the owner is `customer_id` →
 * `core.customers.display_name`, the make is `make_id` →
 * `core.vehicle_makes.name`, the model is `model_id` → `core.vehicle_models`.
 * None of it is stored twice, so renaming a customer once corrects every row
 * here — that is what "real foreign keys, joins, normalised tables" buys.
 */

interface Vehicle {
  id: string;
  customerName: string;
  registrationNumber: string;
  vin: string | null;
  make: string;
  model: string | null;
  modelYear: number | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  status: string;
}

/** `12,345 km`, or an em dash when the odometer was never recorded. */
function mileage(km: number | null): string {
  // `0` is a real reading (a new vehicle), so the null check must be explicit —
  // `km ? ... : '—'` would print a dash for a genuine zero.
  return km === null ? '—' : `${km.toLocaleString('en-GB')} km`;
}

export async function VehiclesScreen({ route }: { route: string }) {
  // As the customers screen: the add target differs per tree, so it comes from
  // the viewer's own navigation and is absent when they have no such route.
  const [title, addHref] = await Promise.all([
    navLabelFor('workshop', route, 'Vehicles'),
    quickCreateHref('workshop', 'register-vehicle'),
  ]);

  return (
    <>
      <PageHeader
        title={title}
        description="Every vehicle registered to this workshop's customers, newest first."
        actions={<QuickCreateButton href={addHref} label="Register vehicle" />}
      />
      <Suspense fallback={<LoadingState label="Loading vehicles…" />}>
        <VehiclesTable route={route} />
      </Suspense>
    </>
  );
}

async function VehiclesTable({ route }: { route: string }) {
  const result = await apiGet<Vehicle[]>('workshop', '/vehicles');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No vehicles yet"
        description="Vehicles are registered against a customer at reception or vehicle intake. None have been recorded for this organisation."
      />
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${themeVar.borderDefault}`, borderRadius: primitive.radius.lg }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: primitive.fontSize.sm }}>
        <caption style={{ captionSide: 'bottom', padding: primitive.space[2], color: themeVar.textSecondary, textAlign: 'left' }}>
          {result.data.length} vehicle{result.data.length === 1 ? '' : 's'}
        </caption>
        <thead>
          <tr style={{ background: themeVar.backgroundSecondary }}>
            {['Registration', 'Vehicle', 'Year', 'Owner', 'Fuel', 'Mileage', 'Status'].map((h) => (
              <th
                key={h}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[3],
                  color: themeVar.textSecondary,
                  fontWeight: 600,
                  borderBottom: `1px solid ${themeVar.borderDefault}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.data.map((v) => (
            <tr key={v.id} style={{ borderBottom: `1px solid ${themeVar.borderDefault}` }}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[3],
                  fontWeight: 500,
                  color: themeVar.textPrimary,
                  // `01 (1).txt` §2845 asks for a monospaced face on VINs, part
                  // numbers and technical identifiers. A registration number is
                  // read character by character off a number plate, and in a
                  // proportional font 0/O and 1/I are genuinely ambiguous.
                  fontFamily: primitive.fontFamily.mono,
                  whiteSpace: 'nowrap',
                }}
              >
                <a href={`${route}/${v.id}`} style={{ color: themeVar.textPrimary }}>
                  {v.registrationNumber}
                </a>
              </th>
              <td style={{ padding: primitive.space[3], color: themeVar.textPrimary }}>
                {/* Model is optional by design — a make is always known at the
                    gate, an exact model sometimes is not. */}
                {v.make}
                {v.model ? ` ${v.model}` : ''}
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{v.modelYear ?? '—'}</td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{v.customerName}</td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary, textTransform: 'capitalize' }}>
                {v.fuelType ?? '—'}
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary, whiteSpace: 'nowrap' }}>
                {mileage(v.currentMileageKm)}
              </td>
              <td style={{ padding: primitive.space[3] }}>
                <StatusBadge kind={v.status === 'active' ? 'active' : 'draft'} label={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
