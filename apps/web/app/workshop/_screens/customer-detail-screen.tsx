import { ApiFailure, apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, ErrorState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { DefinitionList, DetailSection, BackLink, mileage } from './detail-parts';

/**
 * One customer, and the vehicles registered to them.
 *
 * THIS IS THE RELATIONSHIP THE SCHEMA RULE BOUGHT. The vehicles below are not a
 * column on the customer — they are `core.vehicles` rows found by
 * `customer_id`, fetched through `GET /customers/:id/vehicles`, with the make
 * joined from the taxonomy. One fact, one place; the count on the list page and
 * the rows here cannot disagree because neither is stored.
 *
 * BOTH CALLS ARE SEPARATELY AUTHORISED. `findById` and the nested vehicle list
 * each re-check the role, the tenant and the organisation, so a viewer who
 * guesses an id gets 404 rather than a record from another organisation. The
 * page gate above only decides whether the screen exists for them (§8).
 */

interface Customer {
  id: string;
  displayName: string;
  customerType: string;
  email: string | null;
  phone: string | null;
  preferredContact: string;
  location: string | null;
  status: string;
  vehicleCount: number;
  createdAt: string;
}

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
  variant: string | null;
  modelYear: number | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  status: string;
}

const CONTACT_LABEL: Record<string, string> = {
  phone: 'Telephone call',
  sms: 'SMS',
  email: 'Email',
  in_app: 'In the app',
};

export async function CustomerDetailScreen({
  id,
  listHref,
}: {
  id: string;
  /** The list this viewer came from — differs per role tree. */
  listHref: string;
}) {
  // Fetched together: the vehicle list does not depend on the customer having
  // loaded, and serialising them would double the wait for no benefit.
  const [customer, vehicles] = await Promise.all([
    apiGet<Customer>('workshop', `/customers/${id}`),
    apiGet<Vehicle[]>('workshop', `/customers/${id}/vehicles`),
  ]);

  if (!customer.ok) {
    const __reason = customer.reason;
    return (
      <>
        <BackLink href={listHref} label="Back to the customer list" />
        <ApiFailure reason={__reason} workspaceId="workshop" />
      </>
    );
  }

  const c = customer.data;

  return (
    <>
      <BackLink href={listHref} label="Back to the customer list" />
      <PageHeader
        title={c.displayName}
        description={c.customerType === 'business' ? 'Business customer' : 'Individual customer'}
        actions={<StatusBadge kind={c.status === 'active' ? 'active' : 'draft'} label={c.status} />}
      />

      <DetailSection title="Contact">
        <DefinitionList
          items={[
            { term: 'Telephone', value: c.phone ?? '—' },
            { term: 'Email', value: c.email ?? '—' },
            { term: 'Prefers', value: CONTACT_LABEL[c.preferredContact] ?? c.preferredContact },
            { term: 'Location', value: c.location ?? '—' },
            {
              term: 'Customer since',
              value: new Date(c.createdAt).toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            },
          ]}
        />
      </DetailSection>

      <DetailSection title={`Vehicles (${c.vehicleCount})`}>
        {!vehicles.ok ? (
          // The vehicle list failing must not take out the customer's contact
          // details above it — reception may still need the phone number.
          <ErrorState
            title={describeApiFailure(vehicles.reason).title}
            message={describeApiFailure(vehicles.reason).description}
          />
        ) : vehicles.data.length === 0 ? (
          <EmptyState
            title="No vehicles registered"
            description="This customer has no vehicle on file yet. Register one from the Vehicles section."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
            {vehicles.data.map((v) => (
              <li
                key={v.id}
                style={{
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.md,
                  padding: primitive.space[4],
                  background: themeVar.surfaceRaised,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: primitive.space[4],
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    fontFamily: primitive.fontFamily.mono,
                    fontWeight: 600,
                    color: themeVar.textPrimary,
                  }}
                >
                  {v.registrationNumber}
                </span>
                <span style={{ color: themeVar.textPrimary }}>
                  {v.make}
                  {v.model ? ` ${v.model}` : ''}
                  {v.variant ? ` ${v.variant}` : ''}
                  {v.modelYear ? ` · ${v.modelYear}` : ''}
                </span>
                <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  {mileage(v.currentMileageKm)}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusBadge kind={v.status === 'active' ? 'active' : 'draft'} label={v.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </>
  );
}
