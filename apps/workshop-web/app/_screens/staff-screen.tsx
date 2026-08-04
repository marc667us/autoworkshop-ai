import { Suspense } from 'react';
import { ApiFailure, apiGet, currentViewer } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { roleLabel } from '@autoworkshop/next-shell';
import { AddStaffForm, WithdrawStaffButton } from './staff-form';

/**
 * Workshop staff — `07.txt` pt2 §50, mounted at the owner tree's
 * `/workshop-management/staff` and the default tree's `/settings/staff-and-roles`.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * The navigation has advertised "Staff" since Phase 3 and there was no page.
 * More than cosmetic: `MembershipService.grant()` took a `userId`, and the only
 * source of one is `GET /users`, which lists people who are ALREADY members —
 * so the platform's privilege-granting operation had no reachable caller and a
 * workshop owner could not add a single colleague.
 *
 * ⚠️ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
 * carries the names and `/memberships` carries the ids a withdrawal needs. Both
 * are tenant-scoped server-side and RLS is under both; joining them here is
 * presentation (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

/** Field names taken from `TenantUser` in the API — never guessed. */
interface UserRow {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  status: string;
  roles: string[];
}

/** Field names taken from `Membership` in the API. */
interface MembershipRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  userId: string;
  roleName: string;
  status: 'active' | 'suspended' | 'revoked';
}

export function StaffScreen() {
  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to this workshop, and what they may do. Adding someone gives them access immediately."
      />
      <Suspense fallback={<LoadingState label="Loading your staff…" />}>
        <StaffList />
      </Suspense>
    </>
  );
}

async function StaffList() {
  const viewer = await currentViewer('workshop');
  /*
    🔴 SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT.

    `/memberships` unfiltered returns every membership in the tenant, and a
    tenant may hold several organisations — the dev data has Alpha Motors and
    Alpha Parts Supply. Reception staff belong to both, so this page listed them
    TWICE while promising "everyone who can sign in to this workshop". A page
    that over-reports who has access to your workshop is worse than one that
    says nothing, and the duplicate made it look like a data bug.

    Found by reading the rendered list, not by any test — the same lesson as
    every other defect in this session.
  */
  const orgFilter = viewer?.organizationId
    ? `?organizationId=${encodeURIComponent(viewer.organizationId)}`
    : '';
  const [users, memberships] = await Promise.all([
    apiGet<UserRow[]>('workshop', '/users'),
    apiGet<MembershipRow[]>('workshop', `/memberships${orgFilter}`),
  ]);

  if (!users.ok) return <ApiFailure reason={users.reason} workspaceId="workshop" />;
  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId="workshop" />;

  const byUser = new Map(users.data.map((u) => [u.id, u]));
  // Active memberships only. A revoked one is kept in the database so that "was
  // this person ever granted access?" stays answerable, and showing it in a
  // staff LIST would read as though they still work here.
  const active = memberships.data.filter((m) => m.status === 'active');

  return (
    <>
      {/*
        The form FIRST, because on an empty workshop the whole point of this
        page is to add somebody, and a form under an empty state is a form
        nobody finds.
      */}
      <AddStaffForm />

      {active.length === 0 ? (
        <EmptyState
          title="Nobody else has access yet"
          description="Add a colleague by their email address above. They need an account first — ask them to sign up, then add them here."
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: `${primitive.space[6]} 0 0`,
            padding: 0,
            display: 'grid',
            gap: primitive.space[3],
          }}
        >
          {active.map((m) => {
            const person = byUser.get(m.userId);
            const isSelf = viewer?.userId === m.userId;
            return (
              <li
                key={m.id}
                style={{
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.xl,
                  padding: primitive.space[4],
                  background: themeVar.surfaceRaised,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: primitive.space[3],
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {/*
                      A membership can outlive the directory read in one edge
                      case — a user suspended between the two requests — so the
                      name is never assumed to be there.
                    */}
                    {person?.displayName ?? 'Unknown user'}
                    {isSelf ? (
                      <span
                        style={{
                          marginLeft: primitive.space[2],
                          color: themeVar.textSecondary,
                          fontWeight: 400,
                          fontSize: primitive.fontSize.sm,
                        }}
                      >
                        (you)
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    {person?.email ?? '—'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
                  {/* `roleLabel` so the screen never shows raw snake_case. */}
                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
                  {/*
                    🔴 NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it
                    — withdrawal is not self-referential there — and a workshop
                    owner who revoked their own membership would lose access to
                    the workshop they own, with no screen anywhere to undo it.
                    A control whose success is indistinguishable from a lockout
                    should not be offered.
                  */}
                  {isSelf ? (
                    <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>
                      cannot remove yourself
                    </span>
                  ) : (
                    <WithdrawStaffButton
                      membershipId={m.id}
                      name={person?.displayName ?? 'this person'}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
