import * as React from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { DefinitionList, DetailSection, BackLink, mileage } from './detail-parts';

/**
 * One vehicle, in full — `2.txt` §537's fields as they were captured.
 *
 * The owner's name is a JOIN, and it is also a LINK to that customer, which is
 * the relationship becoming navigable rather than merely correct: the same
 * `customer_id` that guarantees integrity is what lets this page point at the
 * person.
 *
 * Insurance expiry is compared against today, because "expires 12 March 2026"
 * is a date and "expired" is the fact reception actually needs at the counter.
 */

interface Vehicle {
  id: string;
  customerId: string;
  customerName: string;
  registrationNumber: string;
  vin: string | null;
  make: string;
  model: string | null;
  variant: string | null;
  modelYear: number | null;
  engineType: string | null;
  transmissionType: string | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  colour: string | null;
  insurerName: string | null;
  insuranceExpiresOn: string | null;
  status: string;
  createdAt: string;
}

const TRANSMISSION_LABEL: Record<string, string> = {
  manual: 'Manual',
  automatic: 'Automatic',
  cvt: 'CVT',
  dual_clutch: 'Dual clutch',
  other: 'Other',
};

function titleCase(v: string | null): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
}

/** `12 March 2026`, plus an expired flag when the date has passed. */
function expiry(iso: string | null): React.ReactNode {
  if (!iso) return '—';
  const when = new Date(`${iso}T00:00:00Z`);
  const formatted = when.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  // Compared date-only in UTC on both sides, so a vehicle does not read as
  // expired for part of the day depending on the server's timezone.
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (when.getTime() >= todayUtc) return formatted;
  return (
    <>
      {formatted}{' '}
      {/* Text, not just a colour — §66 forbids colour as the only signal. */}
      <StatusBadge kind="blocked" label="Expired" />
    </>
  );
}

export async function VehicleDetailScreen({
  id,
  listHref,
  customerHrefBase,
}: {
  id: string;
  listHref: string;
  /** Where this role reads customers, so the owner link lands somewhere they may go. */
  customerHrefBase: string;
}) {
  const result = await apiGet<Vehicle>('workshop', `/vehicles/${id}`);

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return (
      <>
        <BackLink href={listHref} label="Back to the vehicle list" />
        <ErrorState title={title} message={description} />
      </>
    );
  }

  const v = result.data;
  const modelLine = [v.make, v.model, v.variant].filter(Boolean).join(' ');

  return (
    <>
      <BackLink href={listHref} label="Back to the vehicle list" />
      <PageHeader
        title={v.registrationNumber}
        description={`${modelLine}${v.modelYear ? ` · ${v.modelYear}` : ''}`}
        actions={<StatusBadge kind={v.status === 'active' ? 'active' : 'draft'} label={v.status} />}
      />

      <DetailSection title="Owner">
        <a
          href={`${customerHrefBase}/${v.customerId}`}
          style={{ color: themeVar.textPrimary, fontSize: primitive.fontSize.lg }}
        >
          {v.customerName}
        </a>
      </DetailSection>

      <DetailSection title="Vehicle">
        <DefinitionList
          items={[
            { term: 'Registration', value: v.registrationNumber, mono: true },
            { term: 'VIN', value: v.vin ?? '—', mono: true },
            { term: 'Make', value: v.make },
            { term: 'Model', value: v.model ?? v.variant ?? '—' },
            { term: 'Year', value: v.modelYear ?? '—' },
            { term: 'Colour', value: v.colour ?? '—' },
          ]}
        />
      </DetailSection>

      <DetailSection title="Mechanical">
        <DefinitionList
          items={[
            { term: 'Fuel', value: titleCase(v.fuelType) },
            {
              term: 'Transmission',
              value: v.transmissionType
                ? (TRANSMISSION_LABEL[v.transmissionType] ?? v.transmissionType)
                : '—',
            },
            { term: 'Engine', value: v.engineType ?? '—' },
            { term: 'Mileage', value: mileage(v.currentMileageKm) },
          ]}
        />
      </DetailSection>

      <DetailSection title="Insurance">
        <DefinitionList
          items={[
            { term: 'Insurer', value: v.insurerName ?? '—' },
            { term: 'Expires', value: expiry(v.insuranceExpiresOn) },
          ]}
        />
      </DetailSection>
    </>
  );
}
