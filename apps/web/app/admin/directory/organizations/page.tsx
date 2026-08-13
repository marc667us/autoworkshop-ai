import { Suspense } from 'react';
import {
  requireWorkspaceAccess,
  apiGet,
  describeApiFailure,
} from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Organizations — THE FIRST SCREEN IN THIS APPLICATION THAT READS REAL DATA.
 *
 * Eight endpoints had been built under `/api/v1` and the front end called
 * exactly one of them, `/me`, only to work out who the viewer was. Every module
 * route rendered an honest "not built yet" placeholder. This page closes that
 * loop for the first time: browser → Next server → `GET /api/v1/organizations`
 * → OrganizationService → Postgres, with the tenant predicate in the query and
 * RLS underneath it.
 *
 * IT IS ALSO THE PATTERN THE REST OF THE PRODUCT COPIES, so the parts that look
 * like ceremony are the parts worth copying:
 *
 *   · `requireWorkspaceAccess()` FIRST, before any data access. A concrete page
 *     is resolved ahead of the catch-all, so it carries no gate of its own
 *     (T-0005 finding 4). `check-page-gates.sh` fails the build if this line is
 *     missing, called with the wrong arguments, or placed after a fetch.
 *   · every state is rendered, because `05.txt` §2 requires loading, empty AND
 *     error states — and `apiGet` returns failures as values precisely so this
 *     page can render them instead of throwing the route away.
 *   · the three failure reasons are told apart. "Sign in again", "you may not
 *     see this" and "the service is down" are different problems with different
 *     remedies, and merging them into "something went wrong" is how a session
 *     problem gets escalated as an outage.
 *
 * NOT A SECURITY CONTROL. The gate above decides what the UI admits exists; the
 * API's TenantGuard and Postgres RLS deny independently and this page would be
 * safe without either (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

interface Organization {
  id: string;
  name: string;
  orgType: string;
  status: string;
  createdAt: string;
}

export default async function OrganizationsPage() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS. See the note above.
  await requireWorkspaceAccess('admin', 'platform.admin');

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organisation registered in this tenant — workshops, suppliers, fleets and insurers."
      />
      {/* Streams the shell immediately and the table when the API answers, so a
          slow API delays the data and not the navigation around it. */}
      <Suspense fallback={<LoadingState label="Loading organizations…" />}>
        <OrganizationsTable />
      </Suspense>
    </>
  );
}

async function OrganizationsTable() {
  const result = await apiGet<Organization[]>('admin', '/organizations');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    // ErrorState, not a thrown error: the shell, the navigation and the
    // sign-out control must survive an API that is having a bad day.
    return <ErrorState title={title} message={description} />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No organizations yet"
        description="Organisations are created when a workshop, supplier, fleet or insurer is onboarded. None exist in this tenant."
      />
    );
  }

  return (
    // The table scrolls inside its own container rather than pushing the page
    // sideways — a horizontally scrolling document is the responsive defect
    // T-0030 was mistaken for, and it is trivially avoidable here.
    <div style={{ overflowX: 'auto', border: `1px solid ${themeVar.borderDefault}`, borderRadius: primitive.radius.lg }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: primitive.fontSize.sm }}>
        <caption style={{ captionSide: 'bottom', padding: primitive.space[2], color: themeVar.textSecondary, textAlign: 'left' }}>
          {result.data.length} organisation{result.data.length === 1 ? '' : 's'}
        </caption>
        <thead>
          <tr style={{ background: themeVar.backgroundSecondary }}>
            {['Name', 'Type', 'Status', 'Created'].map((h) => (
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
          {result.data.map((org) => (
            <tr key={org.id} style={{ borderBottom: `1px solid ${themeVar.borderDefault}` }}>
              <th scope="row" style={{ textAlign: 'left', padding: primitive.space[3], fontWeight: 500, color: themeVar.textPrimary }}>
                {org.name}
              </th>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{org.orgType}</td>
              <td style={{ padding: primitive.space[3] }}>
                <StatusBadge kind={org.status === 'active' ? 'active' : 'draft'} label={org.status} />
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary, whiteSpace: 'nowrap' }}>
                {/* An ISO date rendered raw is unreadable; formatted on the
                    server with a fixed locale so the markup does not differ
                    between server and client and trigger a hydration mismatch. */}
                {new Date(org.createdAt).toLocaleDateString('en-GB', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
