import { Suspense } from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';

/**
 * The customers screen — ONE implementation, mounted at several routes.
 *
 * ⚠️ WHY IT IS SHARED RATHER THAN A PAGE. This was found by signing in as
 * `reception_staff` and getting a 404 on the screen built for them. The four
 * workshop role trees (`07.txt` pt2 §46-§49) do not route this concept to the
 * same path — they are not variations on one URL, they are different URLs:
 *
 *   · §34 default    `/customer-reception/customers`      (platform admin, and
 *                                                          any role with no
 *                                                          tree of its own)
 *   · §46 owner      `/customers-and-vehicles/customers`
 *   · §48 reception  `/customers/customer-search`
 *   · §47 manager    — no customer list at all —
 *   · §49 technician — no customer list at all —
 *
 * A screen built at one of those paths is invisible to every role that uses
 * another. The navigation is approved specification and CLAUDE.md forbids
 * changing it without review, so the screen moves to the routes rather than the
 * routes moving to the screen: each path gets a thin `page.tsx` that gates
 * itself and renders this.
 *
 * `_screens` is underscore-prefixed, so Next treats it as a private folder and
 * never routes it — the component cannot be reached except through a page that
 * has gated itself.
 *
 * The heading comes from `navLabelFor`, so reception reads "Customer Search"
 * and an owner reads "Customers" without a second copy of either word.
 */

interface Customer {
  id: string;
  displayName: string;
  customerType: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  status: string;
  vehicleCount: number;
  createdAt: string;
}

export async function CustomersScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Customers');

  return (
    <>
      <PageHeader
        title={title}
        description="Everyone this workshop services — their contact details and the vehicles registered to them."
      />
      {/* Streams the shell immediately and the table when the API answers, so a
          slow API delays the data and not the navigation around it. */}
      <Suspense fallback={<LoadingState label="Loading customers…" />}>
        <CustomersTable />
      </Suspense>
    </>
  );
}

async function CustomersTable() {
  const result = await apiGet<Customer[]>('workshop', '/customers');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    // ErrorState, not a thrown error: the shell, the navigation and the
    // sign-out control must survive an API that is having a bad day.
    //
    // `forbidden` is a REAL case on this screen, not a theoretical one — the
    // API refuses a technician, a storekeeper and a QC inspector outright, and
    // this is what they would see if they reached the route another way.
    return <ErrorState title={title} message={description} />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        description="Customers are added at reception when a vehicle is booked in. None have been recorded for this organisation."
      />
    );
  }

  return (
    // Scrolls inside its own container rather than pushing the page sideways.
    <div style={{ overflowX: 'auto', border: `1px solid ${themeVar.borderDefault}`, borderRadius: primitive.radius.lg }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: primitive.fontSize.sm }}>
        <caption style={{ captionSide: 'bottom', padding: primitive.space[2], color: themeVar.textSecondary, textAlign: 'left' }}>
          {result.data.length} customer{result.data.length === 1 ? '' : 's'}
        </caption>
        <thead>
          <tr style={{ background: themeVar.backgroundSecondary }}>
            {['Name', 'Type', 'Contact', 'Location', 'Vehicles', 'Status'].map((h) => (
              <th
                key={h}
                // `scope` is what lets a screen reader announce which column a
                // cell belongs to. Without it a data table is a wall of values.
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
          {result.data.map((c) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${themeVar.borderDefault}` }}>
              <th scope="row" style={{ textAlign: 'left', padding: primitive.space[3], fontWeight: 500, color: themeVar.textPrimary }}>
                {c.displayName}
              </th>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>
                {c.customerType === 'business' ? 'Business' : 'Individual'}
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>
                {/* Phone first: it is what reception actually rings. `1.txt`
                    §1646 keeps contact details out of the AUDIT TRAIL; this
                    screen is the workshop's own customer book, and the roles
                    permitted to load it are exactly who is looking at it. */}
                {c.phone ?? c.email ?? '—'}
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{c.location ?? '—'}</td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>
                {/* Counted by a LEFT JOIN in the service, so a customer with no
                    vehicle shows 0 and stays in the list rather than vanishing. */}
                {c.vehicleCount}
              </td>
              <td style={{ padding: primitive.space[3] }}>
                <StatusBadge kind={c.status === 'active' ? 'active' : 'draft'} label={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
