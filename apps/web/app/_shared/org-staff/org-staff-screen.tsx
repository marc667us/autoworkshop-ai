import { Suspense } from 'react';
import { ApiFailure, apiGet, currentViewer, roleLabel } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import type { ActionResult } from '@autoworkshop/ui';
import { AddOrgMemberForm, WithdrawOrgMemberButton } from './org-staff-form';

/**
 * Who has access to a non-workshop organisation, and what they may do.
 *
 * Mounted by the insurance and towing packs. Modelled on
 * `workshop/_screens/staff-screen.tsx`, whose comments explain most of the
 * shape; the differences are noted where they occur.
 *
 * ⚠️ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
 * carries the names and `/memberships` carries the ids a withdrawal needs. Both
 * are tenant-scoped server-side with RLS underneath; joining them here is
 * presentation (CLAUDE.md §8).
 *
 * 🔴 BOTH READS WERE REFUSED FOR THESE ROLES UNTIL 2026-08-17, AND I OPENED
 * ONLY ONE OF THEM BEFORE WRITING THAT THEY WERE BOTH OPEN.
 *
 * `MembershipService.list()` and `UserService.list()` were each gated on
 * `assertWorkshopStaff`, whose set contains no partner role. The Supervisor
 * found the membership half; I widened it and left `/users` refusing — so this
 * screen failed on its FIRST read and rendered `ApiFailure` above its own add
 * form, and the founder still could not appoint anybody. Codex caught the
 * second half and the false comment together. Both are open now.
 *
 * ⚠️ THE ORDER MATTERS TO THE FAILURE MODE: the form sits BELOW both reads, so
 * a single refused read hides the control this whole screen exists to provide.
 */

/*
 * ⚠️ NO `export const dynamic` HERE — it was here and it did NOTHING. Next
 * reads route-segment config only from `page.tsx`/`layout.tsx`, and this is an
 * ordinary imported component. It looked like a guarantee and was inert.
 * The reads use `no-store` and session APIs, which is what actually keeps this
 * dynamic. (Codex, LOW.)
 */

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

export interface OrgRoleOption {
  value: string;
  label: string;
  hint: string;
}

export interface OrgStaffScreenProps {
  /** Which pack this is mounted in — decides the API credential and cookie scope. */
  workspaceId: string;
  /** Page title, e.g. "Users". */
  title: string;
  description: string;
  /** What this organisation is called in prose, e.g. "insurance company". */
  organisationNoun: string;
  /** The roles this organisation type may confer — must match `ROLES_BY_ORG_TYPE`. */
  roles: readonly OrgRoleOption[];
  addAction: (formData: FormData) => Promise<ActionResult>;
  withdrawAction: (formData: FormData) => Promise<ActionResult>;
  /**
   * True when this is rendered INSIDE another page rather than owning the route.
   *
   * 🔴 IT CHANGES THE HEADING LEVEL, AND THAT IS AN ACCESSIBILITY FACT, NOT A
   * STYLE ONE. `PageHeader` emits `<h1>`. Towing renders this section inside
   * `/operations/settings`, which already has one — so the page shipped with
   * TWO `<h1>` elements and a screen-reader user navigating by heading got two
   * page titles for one page. Insurance owns its route and keeps the `<h1>`.
   * (Supervisor, 2026-08-17.)
   */
  embedded?: boolean;
}

export function OrgStaffScreen(props: OrgStaffScreenProps) {
  return (
    <>
      {props.embedded ? (
        <section style={{ marginTop: primitive.space[8] }}>
          <h2 style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: primitive.fontSize.xl }}>
            {props.title}
          </h2>
          <p
            style={{
              margin: `0 0 ${primitive.space[4]}`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {props.description}
          </p>
        </section>
      ) : (
        <PageHeader title={props.title} description={props.description} />
      )}
      <Suspense fallback={<LoadingState label="Loading the people who have access…" />}>
        <OrgStaffList {...props} />
      </Suspense>
    </>
  );
}

async function OrgStaffList({
  workspaceId,
  organisationNoun,
  roles,
  addAction,
  withdrawAction,
}: OrgStaffScreenProps) {
  const viewer = await currentViewer(workspaceId);

  /*
    🔴 NO VIEWER, NO PAGE — AND `currentViewer()` RETURNING NULL IS A REAL,
    DOCUMENTED STATE, not a theoretical one: `viewer.ts:160` degrades to null
    when the API is unreachable while the session is still live.

    The first version fell through with `viewer` null, and TWO safety properties
    silently vanished together:

      · `orgFilter` became '', so `/memberships` was UNFILTERED and the page
        over-reported who can reach this organisation — the exact failure the
        comment below calls "worse than one that says nothing"; and
      · `isSelf` was false for EVERY row, so the Remove button rendered on the
        viewer's OWN row, making a self-lockout reachable by clicking.

    Both defaults failed open. Refusing to render is the only honest option.
    (Supervisor, 2026-08-17.)
  */
  if (!viewer) return <ApiFailure reason="unauthenticated" workspaceId={workspaceId} />;

  /*
    🔴 SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT — the defect the
    workshop version records. `/memberships` unfiltered returns every membership
    in the tenant, and a tenant may hold more than one organisation, so an
    unfiltered list over-reports who can reach THIS one. A page that over-reports
    access is worse than one that says nothing.
  */
  const orgFilter = viewer.organizationId
    ? `?organizationId=${encodeURIComponent(viewer.organizationId)}`
    : '';
  const [users, memberships] = await Promise.all([
    apiGet<UserRow[]>(workspaceId, '/users'),
    apiGet<MembershipRow[]>(workspaceId, `/memberships${orgFilter}`),
  ]);

  if (!users.ok) return <ApiFailure reason={users.reason} workspaceId={workspaceId} />;
  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId={workspaceId} />;

  const byUser = new Map(users.data.map((u) => [u.id, u]));
  // Active memberships only. A revoked one is kept in the database so that "was
  // this person ever granted access?" stays answerable, and showing it in a
  // staff LIST would read as though they still work here.
  const active = memberships.data.filter((m) => m.status === 'active');

  return (
    <>
      {/*
        The form FIRST: on a newly registered organisation the founder is the
        only member, so the whole point of this page is to add somebody, and a
        form under an empty state is a form nobody finds.
      */}
      <AddOrgMemberForm
        action={addAction}
        roles={roles}
        organisationNoun={organisationNoun}
      />

      {/*
        🔴 "ELSE" MEANS EXCLUDING THE VIEWER, AND WITHOUT THAT THIS COULD NEVER
        RENDER. `active` is filtered to the viewer's own organisation, so it
        always contains the viewer's own membership — `active.length === 0` was
        unreachable, and the sole founder this copy was written for saw a
        one-row list of themselves instead. An empty state that cannot appear is
        the same class as a check that cannot fail. (Supervisor, 2026-08-17.)
      */}
      {active.filter((m) => m.userId !== viewer.userId).length === 0 ? (
        <EmptyState
          title="Nobody else has access yet"
          description={`Add a colleague by their email address above. They need an account first — ask them to sign up, then add them here.`}
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
                    {/* A membership can outlive the directory read in one edge
                        case — a user suspended between the two requests — so the
                        name is never assumed to be there. */}
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
                  {/* A suspended account holds a membership and cannot sign in.
                      Marked rather than hidden: dropping them would make somebody
                      who still holds a membership invisible to the only screen
                      that can remove it. */}
                  {person && person.status !== 'active' ? (
                    <div
                      style={{ color: themeVar.statusAttention, fontSize: primitive.fontSize.xs }}
                    >
                      account {person.status} — they cannot sign in
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
                  {/* `roleLabel` so the screen never shows raw snake_case. */}
                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
                  {/*
                    🔴 NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it —
                    withdrawal is not self-referential there — and an
                    administrator who revoked their own membership would lose
                    access to the organisation they registered, with no screen
                    anywhere to undo it. For these two organisation types that is
                    worse than for a workshop: until 085 there was exactly one
                    member, so self-removal was an unrecoverable lockout of the
                    whole business. A control whose success is indistinguishable
                    from a lockout should not be offered.
                  */}
                  {isSelf ? (
                    <span
                      style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}
                    >
                      cannot remove yourself
                    </span>
                  ) : (
                    <WithdrawOrgMemberButton
                      action={withdrawAction}
                      membershipId={m.id}
                      name={person?.displayName ?? 'this person'}
                      organisationNoun={organisationNoun}
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
