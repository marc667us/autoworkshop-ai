import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, QuickCreateButton } from '@autoworkshop/ui';
import { quickCreateHref } from '@autoworkshop/next-shell';
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
  // Resolved together: the heading, and where THIS viewer may add a customer.
  // `register-customer` sits under a different group in every tree and is
  // permission-gated on the §34 default one, so the href is read out of the
  // viewer's own visible navigation rather than written down a second time.
  const [title, addHref] = await Promise.all([
    navLabelFor('workshop', route, 'Customers'),
    quickCreateHref('workshop', 'register-customer'),
  ]);

  return (
    <>
      <PageHeader
        title={title}
        description="Everyone this workshop services — their contact details and the vehicles registered to them."
        /*
          The way IN to this screen's whole purpose. A customer book with no
          "add" on it sends people hunting through a menu whose wording differs
          per role — and the href differs per role too, which is why it is
          resolved from the viewer's own navigation rather than written here.
          Renders nothing for a viewer whose tree has no such route.
        */
        actions={<QuickCreateButton href={addHref} label="Add customer" />}
      />
      {/* Streams the shell immediately and the table when the API answers, so a
          slow API delays the data and not the navigation around it. */}
      <Suspense fallback={<LoadingState label="Loading customers…" />}>
        {/* `route` is passed through so each row links under the SAME tree the
            viewer is browsing — reception's rows go to their own detail path,
            an owner's to theirs. */}
        <CustomersTable route={route} />
      </Suspense>
    </>
  );
}

async function CustomersTable({ route }: { route: string }) {
  const result = await apiGet<Customer[]>('workshop', '/customers');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
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
              <th scope="row" style={{ textAlign: 'left', padding: primitive.space[3], fontWeight: 500 }}>
                {/* A real link, so it is middle-clickable, openable in a new
                    tab and announced as a link. The whole row is not clickable
                    on purpose: a row-level handler steals text selection and
                    gives assistive technology nothing to announce. */}
                <a href={`${route}/${c.id}`} style={{ color: themeVar.textPrimary }}>
                  {c.displayName}
                </a>
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
