codex.cmd : OpenAI Codex v0.147.0
At line:1 char:436
+ ...  -Raw; $p | & C:\Users\USER\nodejs\codex.cmd exec --skip-git-repo-che ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (OpenAI Codex v0.147.0:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
--------
workdir: C:\Users\USER\Documents\autoworkshop-ai
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a010f4-860b-7e02-9d87-3514ebaa033a
--------
user
Review the uncommitted change (`git status --short`, then `git diff` and read the
new files under apps/web/app/_shared/org-staff/).

CONTEXT. Migration 085 added `insurance_owner` and `towing_owner` as org-admin
roles, because insurers and towing firms could hold exactly one member (the
founder) for ever. A Supervisor pass then found 085 was only half the fix: the
grant authority had NO CALLER. The only POST /memberships in the product was the
WORKSHOP pack's staff-actions.ts, so an insurance founder held the permission and
had no screen to use it from â€” the nav entry it revealed fell through
[...slug]/page.tsx to the "not built yet" placeholder.

THIS CHANGE is that missing caller:
  - apps/web/app/_shared/org-staff/org-staff-core.ts â€” shared implementation of
    add/withdraw, parameterised by workspaceId + revalidate paths.
  - org-staff-screen.tsx (server) + org-staff-form.tsx (client) â€” shared UI.
  - insurance/_screens/staff-actions.ts + staff-screen.tsx, and a NEW route
    apps/web/app/insurance/settings/users/page.tsx (the nav already declared
    `settings > users`, gated on organization.admin).
  - towing/_screens/staff-actions.ts + staff-section.tsx, rendered INSIDE the
    existing /towing/operations/settings page â€” because 02.txt Â§52 defines only
    one settings entry for towing and CLAUDE.md prohibits changing approved
    navigation without review.

REVIEW FOR, concretely:
1. SECURITY. Is the workspace id genuinely server-side? Can a client influence
   which workspace/credential the grant uses, or which organisation it targets?
   Is there any way to grant into an organisation you do not administer?
2. Does the route gating actually hold? `requireNavRoute` before data access, no
   RSC payload leak, and the three independent layers CLAUDE.md Â§8 requires.
3. Are the offered roles exactly what `ROLES_BY_ORG_TYPE` admits for each org
   type? An offered role the API refuses is a form that fails on submit.
4. Server-action correctness in Next: are the 'use server' boundaries right? Is
   passing a server action as a prop into a client component valid here?
5. Did I miss a state â€” loading, empty, error, permission â€” that the Definition
   of Complete requires?
6. Anything a comment claims that the code does not do.

Be concrete: file, line, what breaks, failing input. Severity
CRITICAL/HIGH/MEDIUM/LOW. If a claim of mine is wrong, say so plainly.


codex
I’ll inspect the repository guidance first, then trace the diff through authorization, role definitions, routes, and UI states. I’ll keep this review read-only and report only concrete, 
reproducible findings.
2026-08-17T18:21:15.520595Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force | Select-Object Name,Mode; rg 
--files -g 'AGENTS.md' -g 'CLAUDE.md' -g '02.txt' -g '"'!node_modules'"' -g '"'!dist'"'"` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force | Select-Object Name,Mode; rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g '02.txt' -g 
'"'!node_modules'"' -g '"'!dist'"'" in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force | Select-Object Name,Mode; rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g '02.txt' -g 
'"'!node_modules'"' -g '"'!dist'"'"` rejected: blocked by policy
2026-08-17T18:21:21.088810Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force | Select-Object Name,Mode'` 
rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force | Select-Object Name,Mode' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force | Select-Object Name,Mode'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files -g AGENTS.md -g CLAUDE.md -g 02.txt' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 595ms:
 M apps/web/app/towing/operations/settings/page.tsx
?? apps/web/app/_shared/
?? apps/web/app/insurance/_screens/staff-actions.ts
?? apps/web/app/insurance/_screens/staff-screen.tsx
?? apps/web/app/insurance/settings/
?? apps/web/app/towing/_screens/staff-actions.ts
?? apps/web/app/towing/_screens/staff-section.tsx
?? reviews/codex-t1a-org-staff-2026-08-17.md

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg --files -g AGENTS.md -g CLAUDE.md -g 02.txt' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'git diff -- apps/web/app/towing/operations/settings/page.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg --files apps/web/app/_shared/org-staff apps/web/app/insurance/_screens apps/web/app/insurance/settings 
apps/web/app/towing/_screens' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1036ms:
diff --git a/apps/web/app/towing/operations/settings/page.tsx b/apps/web/app/towing/operations/settings/page.tsx
index e7a990e..c32e5e1 100644
--- a/apps/web/app/towing/operations/settings/page.tsx
+++ b/apps/web/app/towing/operations/settings/page.tsx
@@ -1,5 +1,6 @@
 import { requireNavRoute } from '@autoworkshop/next-shell';
 import { SettingsScreen } from '../../_screens/settings-screen';
+import { TowingStaffSection } from '../../_screens/staff-section';
 
 /**
  * `/operations/settings` — the rates every invoice is priced from.
@@ -11,5 +12,20 @@ import { SettingsScreen } from '../../_screens/settings-screen';
  */
 export default async function Page() {
   await requireNavRoute('towing', '/operations/settings');
-  return <SettingsScreen />;
+  return (
+    <>
+      <SettingsScreen />
+      {/*
+        🔴 THE PEOPLE SECTION — the towing half of what migration 085 unblocked.
+        Until 085 a towing company had exactly one member, its founder, and no
+        way to appoint a second; the grant authority 085 created then had no
+        caller until this shipped.
+
+        Rendered here rather than at its own route because §52 defines ONE
+        settings entry for this tree, and this route already carries the
+        `organization.admin` gate that `towing_owner` newly satisfies.
+      */}
+      <TowingStaffSection />
+    </>
+  );
 }

 succeeded in 1171ms:
apps/web/app/_shared/org-staff\org-staff-screen.tsx
apps/web/app/_shared/org-staff\org-staff-form.tsx
apps/web/app/_shared/org-staff\org-staff-core.ts
apps/web/app/insurance/_screens\staff-screen.tsx
apps/web/app/insurance/_screens\staff-actions.ts
apps/web/app/insurance/_screens\register-product-screen.tsx
apps/web/app/insurance/_screens\product-actions.ts
apps/web/app/insurance/_screens\policies-sold-screen.tsx
apps/web/app/insurance/_screens\platform-levies-screen.tsx
apps/web/app/insurance/_screens\my-products-screen.tsx
apps/web/app/insurance/_screens\create-insurer-screen.tsx
apps/web/app/insurance/_screens\create-insurer-actions.ts
apps/web/app/towing/_screens\dispatch-board-screen.tsx
apps/web/app/towing/_screens\dashboard-screen.tsx
apps/web/app/towing/_screens\create-towing-screen.tsx
apps/web/app/towing/_screens\invoices-screen.tsx
apps/web/app/towing/_screens\incidents-screen.tsx
apps/web/app/towing/_screens\drivers-screen.tsx
apps/web/app/towing/_screens\recoveries-screen.tsx
apps/web/app/towing/_screens\create-towing-actions.ts
apps/web/app/towing/_screens\recovery-vehicles-screen.tsx
apps/web/app/towing/_screens\requests-screen.tsx
apps/web/app/towing/_screens\towing-actions.ts
apps/web/app/towing/_screens\staff-section.tsx
apps/web/app/towing/_screens\staff-actions.ts
apps/web/app/towing/_screens\shared.tsx
apps/web/app/towing/_screens\settings-screen.tsx
apps/web/app/insurance/settings\users\page.tsx

 succeeded in 1232ms:
CLAUDE.md

codex
The changed surface is small, but the decisive checks live outside it: the shared membership endpoint, permission helpers, navigation metadata, and the canonical role map. I’m tracing those now 
so findings aren’t based on UI appearance alone.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content -Raw CLAUDE.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content -Raw apps/web/app/_shared/org-staff/org-staff-core.ts; Get-Content -Raw 
apps/web/app/_shared/org-staff/org-staff-screen.tsx; Get-Content -Raw apps/web/app/_shared/org-staff/org-staff-form.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content -Raw apps/web/app/insurance/_screens/staff-actions.ts; Get-Content -Raw 
apps/web/app/insurance/_screens/staff-screen.tsx; Get-Content -Raw apps/web/app/insurance/settings/users/page.tsx; Get-Content -Raw apps/web/app/towing/_screens/staff-actions.ts; Get-Content -Raw 
apps/web/app/towing/_screens/staff-section.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "ROLES_BY_ORG_TYPE|POST.*/memberships|memberships|staff-actions|requireNavRoute|organization.admin" 
apps packages -g "*.ts" -g "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 957ms:
import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, currentViewer } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Appointing and removing members of a NON-WORKSHOP organisation.
 *
 * â”€â”€ ðŸ”´ WHY THIS EXISTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Migration 085 gave insurers and towing firms an org-admin role, because
 * neither had one: `insurance_assessor` and `towing_operator` are absent from
 * `CAN_GRANT_MEMBERSHIP`, so those two organisation types could hold exactly one
 * member â€” the founder â€” for ever.
 *
 * The Supervisor then found that 085 was only half the fix. **The grant
 * authority had no caller.** The only `POST /memberships` in the product was
 * `workshop/_screens/staff-actions.ts`, so an insurer's founder could hold the
 * permission and still have no screen to use it from â€” the navigation entry it
 * revealed fell through to the "not built yet" placeholder. A capability with no
 * way in is not a feature; this repository records that as "a route with no
 * caller is not shipped".
 *
 * â”€â”€ WHY THE IMPLEMENTATION IS SHARED AND THE ACTIONS ARE NOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * The rules â€” organisation from the session, email not uuid, revoke not delete,
 * every refusal naming a way forward â€” are identical for every organisation
 * type, and CLAUDE.md Â§3 says extend rather than duplicate. So the behaviour
 * lives here once.
 *
 * The `'use server'` entry points stay per-pack because a server action is
 * identified by its module, and the workspace id decides which API credential
 * and which cookie scope the request uses. Passing it as a parameter from the
 * CLIENT would make the workspace attacker-controlled; binding it in a
 * per-pack server module keeps it a server-side constant.
 */

/** Read a trimmed field, or `undefined` when it is blank. */
function read(formData: FormData, key: string): string | undefined {
  const v = String(formData.get(key) ?? '').trim();
  return v === '' ? undefined : v;
}

/**
 * Appoint somebody to the caller's own organisation.
 *
 * âš ï¸ THE ORGANISATION COMES FROM THE SESSION, NEVER FROM THE FORM â€” the same
 * rule the workshop version documents. A hidden field would let a caller
 * attempt a grant into another organisation whose id they happen to know. The
 * API re-checks it against the active tenant, but a form that offers the value
 * at all invites the attempt and fails confusingly.
 */
export async function addOrgMember(
  workspaceId: string,
  revalidate: readonly string[],
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await currentViewer(workspaceId);
  if (!viewer) return { error: 'Your session has ended. Sign in again, then retry.' };

  const result = await apiPost(workspaceId, '/memberships', {
    userEmail: read(formData, 'userEmail'),
    organizationId: viewer.organizationId,
    roleName: read(formData, 'roleName'),
  });

  if (!result.ok) {
    // âš ï¸ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape hatch
    // does not exist is a wall, and walls are the most expensive defect class
    // recorded in this repository. The API's own sentence is preferred wherever
    // it sends one, because it knows which rule refused.
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check the email and the role.')
        : result.reason === 'forbidden'
          ? (result.message ??
            'Your role may not appoint people. Only the administrator who registered this organisation can.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? (result.message ??
                'No account with that email address. Ask them to sign up first, then add them here.')
              : 'The service did not respond. Nothing has been changed â€” try again shortly.';
    return { error };
  }

  for (const path of revalidate) revalidatePath(path);
  return { created: 'Added. They can sign in and will see this organisation immediately.' };
}

/**
 * Remove somebody's access.
 *
 * âš ï¸ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
 * that "was this person ever granted access, and by whom?" stays answerable â€”
 * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
 *
 * ðŸ”´ THIS IS THE HALF THAT WAS UNREACHABLE. `withdraw()` needs a membership id,
 * and the only source of one is `GET /memberships` â€” which was gated on
 * `assertWorkshopStaff` and refused every partner role. So before this screen
 * existed, an appointment made through the API could never be reversed.
 */
export async function withdrawOrgMember(
  workspaceId: string,
  revalidate: readonly string[],
  formData: FormData,
): Promise<ActionResult> {
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };

  const result = await apiPatch(workspaceId, `/memberships/${membershipId}/status`, {
    // `revoked`, not `suspended`: this control is "remove". Suspension is a
    // different decision and deserves its own control rather than being what
    // "remove" quietly does.
    status: 'revoked',
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'That change was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not change who has access.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That membership no longer exists. Reload the page.'
              : 'The service did not respond. Nothing has been changed â€” try again shortly.';
    return { error };
  }

  for (const path of revalidate) revalidatePath(path);
  return { created: 'Removed. They can no longer see this organisation.' };
}

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
 * âš ï¸ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
 * carries the names and `/memberships` carries the ids a withdrawal needs. Both
 * are tenant-scoped server-side with RLS underneath; joining them here is
 * presentation (CLAUDE.md Â§8).
 *
 * ðŸ”´ BOTH READS WERE REFUSED FOR THESE ROLES UNTIL 2026-08-17. `list()` was
 * gated on `assertWorkshopStaff`, whose set contains no partner role, so this
 * screen could not have existed: `POST /memberships` answered 201 and
 * `GET /memberships` answered 403.
 */

export const dynamic = 'force-dynamic';

/** Field names taken from `TenantUser` in the API â€” never guessed. */
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
  /** Which pack this is mounted in â€” decides the API credential and cookie scope. */
  workspaceId: string;
  /** Page title, e.g. "Users". */
  title: string;
  description: string;
  /** What this organisation is called in prose, e.g. "insurance company". */
  organisationNoun: string;
  /** The roles this organisation type may confer â€” must match `ROLES_BY_ORG_TYPE`. */
  roles: readonly OrgRoleOption[];
  addAction: (formData: FormData) => Promise<ActionResult>;
  withdrawAction: (formData: FormData) => Promise<ActionResult>;
}

export function OrgStaffScreen(props: OrgStaffScreenProps) {
  return (
    <>
      <PageHeader title={props.title} description={props.description} />
      <Suspense fallback={<LoadingState label="Loading the people who have accessâ€¦" />}>
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
    ðŸ”´ SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT â€” the defect the
    workshop version records. `/memberships` unfiltered returns every membership
    in the tenant, and a tenant may hold more than one organisation, so an
    unfiltered list over-reports who can reach THIS one. A page that over-reports
    access is worse than one that says nothing.
  */
  const orgFilter = viewer?.organizationId
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

      {active.length === 0 ? (
        <EmptyState
          title="Nobody else has access yet"
          description={`Add a colleague by their email address above. They need an account first â€” ask them to sign up, then add them here.`}
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
                        case â€” a user suspended between the two requests â€” so the
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
                    {person?.email ?? 'â€”'}
                  </div>
                  {/* A suspended account holds a membership and cannot sign in.
                      Marked rather than hidden: dropping them would make somebody
                      who still holds a membership invisible to the only screen
                      that can remove it. */}
                  {person && person.status !== 'active' ? (
                    <div
                      style={{ color: themeVar.statusAttention, fontSize: primitive.fontSize.xs }}
                    >
                      account {person.status} â€” they cannot sign in
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
                  {/* `roleLabel` so the screen never shows raw snake_case. */}
                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
                  {/*
                    ðŸ”´ NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it â€”
                    withdrawal is not self-referential there â€” and an
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

'use client';

import * as React from 'react';
import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import type { ActionResult } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import type { OrgRoleOption } from './org-staff-screen';

/**
 * The appointment form, shared by the insurance and towing packs.
 *
 * âš ï¸ THE ACTION IS PASSED IN, NOT CHOSEN HERE. Each pack supplies its own
 * `'use server'` entry point with the workspace id already bound server-side.
 * A workspace chosen in client code would be attacker-controlled, and the
 * workspace decides which API credential and cookie scope the request uses.
 */
export function AddOrgMemberForm({
  action,
  roles,
  organisationNoun,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  roles: readonly OrgRoleOption[];
  organisationNoun: string;
}) {
  // The FIRST option is the default, and each pack lists its operational role
  // first â€” appointing another administrator is the rarer, weightier act and
  // should be a deliberate choice rather than the value already in the box.
  const [role, setRole] = React.useState(roles[0]?.value ?? '');
  const hint = roles.find((r) => r.value === role)?.hint;

  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.xl,
        padding: primitive.space[6],
        background: themeVar.surfaceRaised,
      }}
    >
      <h2 style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: primitive.fontSize.lg }}>
        Add a colleague
      </h2>
      <p
        style={{
          margin: `0 0 ${primitive.space[4]}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/*
          Stated up front rather than discovered through a failure. There is no
          invitation flow yet (T-0028), and a form that looks like it will send
          an invite and instead refuses an unknown address is worse than one
          that says so first.
        */}
        They need an account already. Ask them to sign up, then add them here with
        the same email address.
      </p>

      <FormShell action={action} successPrefix="">
        <Field label="Their email address" htmlFor="userEmail">
          <TextInput
            id="userEmail"
            name="userEmail"
            type="email"
            required
            autoComplete="off"
            placeholder="colleague@example.com"
          />
        </Field>

        <Field label="What they may do" htmlFor="roleName" hint={hint}>
          <Select
            id="roleName"
            name="roleName"
            value={role}
            onChange={(e) => setRole(e.currentTarget.value)}
            options={roles.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Field>

        {/* A form without one of these shipped in this repo once, and the live
            suite has a check for it. */}
        <SubmitButton>Add to this {organisationNoun}</SubmitButton>
      </FormShell>
    </div>
  );
}

/**
 * Remove someone's access.
 *
 * A form rather than a bare button so it posts through the same server-action
 * path as everything else, and so it works with JavaScript disabled.
 */
export function WithdrawOrgMemberButton({
  action,
  membershipId,
  name,
  organisationNoun,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  membershipId: string;
  name: string;
  organisationNoun: string;
}) {
  return (
    <FormShell action={action} successPrefix="">
      <input type="hidden" name="membershipId" value={membershipId} />
      <button
        type="submit"
        // `confirm` because this is destructive from the user's point of view
        // and instant. The row survives in the database, but their access does
        // not, and there is no undo screen.
        onClick={(e) => {
          if (!window.confirm(`Remove ${name}'s access to this ${organisationNoun}?`)) {
            e.preventDefault();
          }
        }}
        style={{
          padding: `${primitive.space[2]} ${primitive.space[4]}`,
          fontSize: primitive.fontSize.sm,
          fontFamily: 'inherit',
          color: themeVar.statusDanger,
          background: 'transparent',
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          cursor: 'pointer',
        }}
      >
        Remove
      </button>
    </FormShell>
  );
}


 succeeded in 1014ms:
# CLAUDE.md â€” AutoWorkshop AI

Guidance for Claude Code working in this repository.

**Product:** AutoWorkshop AI Â· `autoworkshop.aiappinvent.com` (Namecheap DNS)
**Repo:** https://github.com/marc667us/autoworkshop-ai â€” public, `master` + `develop`
**Approved plan:** `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
**Source specs:** `C:\Users\USER\Documents\autoworkshop app\*.txt` (10 unique files)

This plan passed the full quality chain before any code was written:
Codex Reviewer `PASS WITH CORRECTIONS` (14 applied) -> Supervisor `PASS WITH CONDITIONS` (8 applied).

---

## Non-negotiables â€” read before every task

### 1. Zero cost, including production (ADR-012)
`05.txt` Â§1, Â§2, Â§6 and Â§8 require zero-cost open-source tooling â€” Â§8 covers the **first production release**,
not merely a pilot. **Never introduce a paid tool, subscription or mandatory paid service. Never propose that
the owner spends money**, not even a small amount; the spend decision is the owner's alone. If something looks
like it needs money, find the FOSS path â€” it usually exists. A task is **not complete** if it added a paid
dependency. CI enforces this.

### 2. Solar non-entanglement (ADR-011)
Solar PV Designer Lite is the **reference implementation** â€” always refer to it for patterns, CI shape and
operational lessons. But the two applications must never entangle:
separate repository, database, Keycloak **realm**, deployment, secrets and CI. **Never edit Solar's
`web_app.py`, `wsgi.py` or templates.** Never import from it. Never share a database.
**Acceptance test: if Solar were deleted tomorrow, would this still build, deploy and run?**

### 3. Agents never touch the database (ADR-010, ADR-013)
`ADK agent -> MCP client -> MCP Gateway -> MCP server -> NestJS domain service -> repository -> RLS -> Postgres`
The agent host holds **no** database, storage, payment or admin credential. Business rules live only in
domain services. Enforced in infrastructure and asserted by negative tests in CI â€” not by policy text.

### 4. Build everything structurally
The owner rejected all scope cuts. Every feature in the specs gets built. Only **licensed content** (OEM
wiring diagrams, vehicle-specific 3D geometry) and **labelled ML corpora** are staged â€” and those accumulate
from real jobs. Do not quietly re-defer features.

### 5. Tenant isolation is Severity-1
`tenant_id` on every tenant-owned table, `ENABLE` + `FORCE ROW LEVEL SECURITY`, tenant context derived
**only** from validated Keycloak claims and membership â€” never from a client-supplied id. Isolation tests are
a blocking CI gate.

### 6. Bring-your-own-connection (ADR-015)
Never bundle or mandate an external provider. Every external capability is an interface with a zero-cost
default and a **tenant-configurable** adapter. A tenant that configures nothing still gets a working app.

---

## Prohibited (`05.txt` Â§2)

Building all pages at once Â· disconnected mock pages Â· business rules in the frontend Â· AI agents reaching
the database Â· bypassing role/permission controls Â· introducing paid dependencies Â· changing approved
navigation without review.

## Required per module (`05.txt` Â§2)

Frontend pages Â· backend services Â· database tables and migrations Â· permissions Â· validation Â· audit
logging Â· tests Â· loading states Â· empty states Â· error states Â· responsive layouts.

## Definition of complete (`05.txt` Â§6)

Page renders Â· API works Â· permissions enforced Â· migration runs Â· tests pass Â· lint + typecheck pass Â·
Playwright journey passes Â· responsive checked Â· docs updated Â· **no paid dependency** Â· committed.

## Schema rules (learned from Solar â€” do not relearn these the hard way)

- **No `VARCHAR(n)` on free-text or generated columns** â€” use `TEXT`. Solar's truncation incident came from
  narrow VARCHARs meeting AI-generated content.
- **No `CREATE TABLE IF NOT EXISTS` in boot code.** Migrations only, forward- and rollback-tested in CI.
  IF-NOT-EXISTS is how live schema silently drifts from migration history.
- Approvals, payments, warranty decisions and audit events are **append-only**.
- `RETURNING id`, never `lastrowid`.
- RLS seeding needs `set_config('app.current_role','admin',true)` or inserts fail silently.
- Keycloak heap must be capped â€” Solar's Keycloak OOM'd on a constrained host.

## Commands

```bash
pnpm install          # workspace install (pnpm 9, Node 20 â€” versions must match CI)
pnpm dev              # all apps
pnpm build            # all apps
pnpm lint             # eslint
pnpm typecheck        # tsc
pnpm test             # vitest
pnpm infra:up         # postgres, redis, nats, minio, keycloak, coturn
pnpm infra:down
```

## Control files

`.claude/CURRENT_PHASE.md` Â· `.claude/CURRENT_TASK.md` Â· `.claude/TASK_QUEUE.md` Â·
`.claude/SESSION_HANDOVER.md` â€” update `SESSION_HANDOVER.md` before ending any session.

---

<!-- BEGIN: AGENTIC ADK EXTENSION (canonical â€” do not edit in place; re-sync from C:\Users\USER\_agentic_adk_append.md) -->

# AGENTIC DEVELOPMENT EXTENSION â€” Google ADK + Claude Code + Governance Agents

> **READ ALONGSIDE THE PROJECT EXECUTION DIRECTIVE.** This extension adds the agentic-architecture layer that every app under this account must follow. It does not replace the directive â€” it 
extends it.
> Canonical sources:
> - `C:\Users\USER\Documents\agentic proper2\agenticadk1.txt` â€” master Enterprise AI Agent Factory prompt (architecture spec + 24-section blueprint + Section 26 governance agents)
> - `C:\Users\USER\_agentic_adk_append.md` â€” this template (CLAUDE.md content)
> - `C:\Users\USER\_agentic_adk_context_append.md` â€” companion context.MD append
> - `C:\Users\USER\_agentic_adk_mcp.md` â€” companion MCP.md per-app file

## 0. Why this exists

Every app in this account â€” past, present, and future â€” is part of a single agentic platform. The split is:

- **Claude Code** is the **Software Engineering Agent**. It writes code, fixes bugs, creates APIs, databases, Dockerfiles, CI/CD pipelines, tests, and deployment scripts. It does NOT orchestrate 
business workflows.
- **Google ADK (Agent Development Kit)** is the **Agent Operating System AND the agent framework**. It coordinates business agents (executive, engineering, construction, procurement, finance, 
healthcare, legal, research, sales, support, technology) across workflows, tools, memory, and execution. **It is also the only framework used to design and implement any agent in any app under 
this account** â€” see Â§0.1 below.
- **Codex CLI + Supervisor** is the **Pair-Coding Review Lane**. It reviews Claude Code's diffs; the Supervisor adjudicates. See the existing pair-coding skeleton at `ai-coworkers/`, `reviews/`, 
`scripts/`.
- **Governance Agents (Work Reviewer, Development Supervisor, Work Scheduler)** are the **Quality + Planning Lane** running inside ADK. They run for every project deliverable, not just code.

> A feature is NOT done until: code is written â†’ Codex reviews â†’ Supervisor signs off â†’ Work Reviewer Agent approves â†’ Work Scheduler Agent marks the task `approved`. All four gates are 
mandatory.

## 0.1 HARD RULE â€” Google ADK Is the Only Agent Framework

**Every agent â€” in every app, in every department, current and future â€” must be designed and implemented in Google ADK.** No exceptions without explicit owner approval logged in 
`docs/IMPLEMENTATION_LOG.md` and an ADR in `docs/ARCHITECTURE_DECISIONS.md`.

This applies to:

- Agent class definitions (always subclass / compose ADK primitives â€” `Agent`, `LlmAgent`, `SequentialAgent`, `ParallelAgent`, `LoopAgent`, etc.)
- Tool definitions (always ADK `Tool` / `FunctionTool` / `AgentTool` â€” never bare function dispatchers or competing tool-call schemas).
- Memory and session state (always ADK session services + the memory layer in Â§6).
- Agent-to-agent handoffs (always ADK transfer / sub-agent invocation â€” never direct LLM-to-LLM hand-rolled loops).
- Orchestration (always ADK workflows â€” never custom while-loops, custom orchestrators, or shell-driven agent chains).

**Forbidden without an approved ADR:**

- LangChain agents, LangGraph, AutoGen, CrewAI, Smolagents, Letta/MemGPT, OpenAI Assistants API agents, Microsoft Semantic Kernel â€” or any other competing agent framework.
- Hand-rolled "while-LLM-says-not-done" loops.
- Direct provider SDK calls (`anthropic.messages.create`, `openai.chat.completions.create`, `vertexai.GenerativeModel.generate_content`) **inside an agent's reasoning loop**. Direct SDK calls are 
fine for one-shot utility prompts (e.g., a deterministic summariser inside a tool); they are NOT fine as a substitute for an agent.
- Storing agent prompts, tools, or graph topology outside of ADK definitions (e.g. as YAML interpreted by a custom runner).

**Why this matters:**

- A single framework means observability, evals, memory, and governance schemas all converge â€” the Work Reviewer / Development Supervisor / Work Scheduler agents can introspect any agent's run 
because every agent shares the same lifecycle.
- ADK is the bridge to Vertex AI for production hosting; non-ADK agents cannot ride that deployment path.
- The four-gate quality bar depends on uniform run records; bespoke agents break those records.

**How Claude Code applies this rule when implementing:**

1. Before writing any agent code, confirm the ADK class to subclass / compose. If unsure, read `agenticadk1.txt` Â§2â€“Â§13 for the canonical agent role list.
2. Tools go in `app/tools/<department>/` as ADK tools â€” even if the underlying logic is a pure function, wrap it in `FunctionTool` (or equivalent ADK primitive).
3. Multi-agent flows go in `app/workflows/` using ADK `SequentialAgent` / `ParallelAgent` / `LoopAgent` â€” never a custom Python orchestrator.
4. If the user asks for "just a quick agent", default to a minimal `LlmAgent` with one tool, NOT a script with a `while` loop around `client.messages.create()`.
5. If a request seems to require a non-ADK framework, **stop** and surface the conflict â€” propose an ADR rather than silently introducing the competing library.

## 0.2 HARD RULE â€” Always Start From Orchestration; Branch Into Conductors When Needed

**Every agent system in every app MUST start from an orchestration agent at the top.** No request enters the platform by going directly to a specialist agent or a tool. The shape is:

```
                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   User /  â”€â”€â”€â–¶ â”‚  ROOT ORCHESTRATOR (ADK)          â”‚  â† always present
   API          â”‚  e.g. ChiefExecutiveOrchestrator  â”‚     (LlmAgent / SequentialAgent)
                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                             â”‚ classifies request, routes
                  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                  â”‚                     â”‚
                  â–¼                     â–¼
            CONDUCTOR A             CONDUCTOR B          â† branch here only WHEN
        (sub-orchestrator       (sub-orchestrator           the sub-workflow needs
         e.g. ConstructionDept   e.g. FinanceDept           its own coordination
         Conductor)               Conductor)                of multiple specialists
                  â”‚                     â”‚
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”
        â–¼         â–¼         â–¼     â–¼          â–¼
    Specialist Specialist Tool  Specialist  Tool         â† leaves
       Agent     Agent    call    Agent     call
```

**Definitions:**

- **Root Orchestrator** â€” the single ADK entry agent for the app. It owns request classification, top-level routing, and the Â§3 control sequence (Work Scheduler â†’ assignments â†’ Work 
Reviewer â†’ executive report). It is always an ADK agent â€” typically `LlmAgent` with sub-agents, or `SequentialAgent` wrapping the Â§3 pipeline.
- **Conductor** â€” a sub-orchestrator agent. Use one when a branch needs to coordinate **more than one specialist agent** OR **a non-trivial workflow** (sequencing, retries, parallel fan-out, 
conditional routing). A conductor IS an ADK orchestrator agent (`SequentialAgent`, `ParallelAgent`, `LoopAgent`, or an `LlmAgent` with its own `sub_agents`) â€” it is NOT a specialist with tool 
calls.
- **Specialist** â€” a leaf agent (one department role: Electrical Design Agent, BOQ Agent, Lead Generation Agent, etc.) that does the actual work via its tools.

**Branching rules â€” when to introduce a conductor vs. keep it flat:**

| Situation | Pattern |
|---|---|
| Single specialist needed for the request | Root Orchestrator â†’ Specialist (no conductor) |
| Two or three specialists in strict sequence | Root Orchestrator â†’ `SequentialAgent` Conductor â†’ Specialists |
| Several specialists running in parallel | Root Orchestrator â†’ `ParallelAgent` Conductor â†’ Specialists |
| Iterative refinement (e.g. design â†’ review â†’ revise) | Root Orchestrator â†’ `LoopAgent` Conductor â†’ Specialists |
| Whole department's work for this request | Root Orchestrator â†’ Department Conductor (`LlmAgent` w/ sub-agents) â†’ Specialists |
| Cross-department workflow (engineering + finance + procurement) | Root Orchestrator â†’ one Conductor per department â†’ Specialists; Root composes their outputs |

**Forbidden shapes:**

- Calling a specialist agent directly from an API handler without going through the Root Orchestrator.
- A Root Orchestrator that contains all 50+ specialists as direct sub-agents â€” flatten this into department conductors.
- A "conductor" that is actually a tool function dispatching to other tools â€” that is not a conductor, that is a misnamed helper. Conductors are ADK agents with sub-agents.
- Mixing orchestration logic into a specialist (a specialist may NOT spawn or hand off to other agents â€” only conductors do that).

**Mandatory files when this rule is implemented in an app:**

```
app/agents/
â”œâ”€â”€ orchestrators/
â”‚   â””â”€â”€ root_orchestrator.py          â† REQUIRED â€” the single entry agent
â”œâ”€â”€ conductors/
â”‚   â”œâ”€â”€ executive_conductor.py        â† coordinates Chief* agents + governance
â”‚   â”œâ”€â”€ technology_conductor.py       â† coordinates Dev Supervisor + Claude Code + ...
â”‚   â”œâ”€â”€ engineering_conductor.py      â† coordinates engineering specialists
â”‚   â”œâ”€â”€ construction_conductor.py
â”‚   â”œâ”€â”€ procurement_conductor.py
â”‚   â”œâ”€â”€ finance_conductor.py
â”‚   â”œâ”€â”€ healthcare_conductor.py
â”‚   â”œâ”€â”€ legal_conductor.py
â”‚   â”œâ”€â”€ research_conductor.py
â”‚   â”œâ”€â”€ sales_conductor.py
â”‚   â””â”€â”€ support_conductor.py
â””â”€â”€ {executive,technology,engineering,...}/   â† specialists live here, NOT in conductors/
```

Department conductors are stubbed (just a `SequentialAgent` with no sub-agents yet) until that department's first specialist exists. Stubs are required so the orchestration topology is always 
visible.

**The Â§3 control sequence runs INSIDE the Root Orchestrator.** Concretely:

1. Root Orchestrator receives the request and asks the Chief Executive Agent (a sub-agent) to classify.
2. Root Orchestrator hands the schedule task to the Work Scheduler Agent (sub-agent).
3. Root Orchestrator routes scheduled tasks to the relevant Conductor(s).
4. Each Conductor coordinates its specialists and returns the department's output.
5. Root Orchestrator hands collected outputs to the Work Reviewer Agent.
6. Root Orchestrator returns the final report.

**How Claude Code applies this rule when implementing:**

1. If the app has no `app/agents/orchestrators/root_orchestrator.py`, create it as the first agent file, even before any specialist. Wire `/api/agents/execute` and `/api/demo/run` through it.
2. Never add an API route that calls a specialist or tool directly. The route calls the Root Orchestrator; the Root Orchestrator decides.
3. When asked for a multi-step workflow, the first design question is "which conductor owns this?" â€” not "which specialist runs it?"
4. If a conductor would have a single specialist underneath it, do NOT create the conductor â€” call the specialist from the Root Orchestrator directly. Conductors exist to coordinate â‰¥2 agents 
or non-trivial control flow.
5. Document the orchestrator/conductor tree in `docs/ARCHITECTURE_DECISIONS.md` whenever a new conductor is added.

## 0.3 HARD RULE â€” Agents and Code Must Be Reusable Across Apps

**Every agent, conductor, tool, schema, and utility in every app MUST be importable from another app's codebase, unchanged.** The factory only works if a Solar Design Agent built for 
`solar-pv-designer-lite` can be imported and used by `pvsolar1` or `ai-app-invent-sales-platform` without copying source. No exceptions.

**Concrete requirements:**

1. **Each app is a pip-installable Python package.** Every app root has:
   - `pyproject.toml` declaring `name`, `version`, and a `packages = ["app"]` (or `setuptools.find_packages`) so `pip install -e /path/to/app` makes everything under `app/` importable.
   - A top-level `app/__init__.py` and an `__init__.py` in every subpackage (`agents/`, `agents/executive/`, `agents/conductors/`, `tools/`, `schemas/`, `workflows/`, `memory/`, ...).
   - A `py.typed` marker for type-checker support.

2. **Public API is explicit.** Each package's `__init__.py` re-exports the agents/tools/schemas other apps may consume:
   ```python
   # app/agents/engineering/__init__.py
   from .solar_design_agent import SolarDesignAgent
   from .electrical_design_agent import ElectricalDesignAgent
   __all__ = ["SolarDesignAgent", "ElectricalDesignAgent"]
   ```
   If it isn't in `__all__`, it is not part of the public contract. Other apps should not import it.

3. **No app-local hardcoded paths inside agent/tool/schema code.** All paths come from config (`pydantic-settings`, `os.getenv`, or a `Settings` object injected at construction). Anything that 
reads `C:\Users\USER\...` or this-app-only relative paths inside business logic is a defect. Hardcoded paths belong in `app/main.py` or the deployment layer only.

4. **Dependency injection over globals.** Agents and tools accept their dependencies â€” DB session factory, LLM client, MCP client, settings â€” via constructor or factory function. No 
module-level singletons that another app would have to monkey-patch. ADK already encourages this pattern; follow it.

5. **No business logic in route handlers.** (Restates Directive Â§4 â€” Router â†’ Service â†’ Repository â†’ DB.) The Service and Repository layers must be the importable units; the Router is 
the only piece that is allowed to be app-specific.

6. **Cross-app installation patterns:**
   - **Direct pip install** (development):
     `pip install -e "C:/Users/USER/Desktop/solar-pv-designer-lite"`
     then `from app.agents.engineering import SolarDesignAgent`.
   - **MCP mesh** (production / cross-runtime): the producing app exposes the agent's tool surface as an MCP server (see MCP.md Â§5.2); the consuming app declares it in MCP.md Â§5.1 and calls it 
via the MCP client. Use this when the consumer is in another language or another runtime.
   - **Wheel / private index** (releases): when an app reaches a stable version, publish a wheel to a private index (GitHub Packages, internal PyPI) so other apps can pin a version rather than 
`-e` to a working tree.

7. **Stable import paths.** Once an agent or tool is published under `app.agents.<dept>.<name>`, that import path is a contract. Rename only with a deprecation alias for at least one minor 
version:
   ```python
   # app/agents/engineering/__init__.py
   from .pv_design_agent import PvDesignAgent
   SolarDesignAgent = PvDesignAgent  # deprecated alias, remove in v2
   ```

8. **No circular dependencies between departments.** A Sales agent may NOT import an Engineering specialist directly to do calculations â€” it asks the Root Orchestrator to route to Engineering, 
OR it calls the Engineering app's MCP surface. Department-to-department coupling at the import layer breaks reusability.

9. **Tests travel with the code.** When another app installs this package and runs its own test suite, the imported package's invariants should still hold. That means tests live in `tests/` at 
app root AND every public agent/tool ships with at least one example test that can be re-run by consumers.

10. **Schemas are the contract surface.** `app/schemas/` defines Pydantic models used at every public boundary. Other apps import schemas â€” they do NOT inspect agent internals. If the schemas 
change shape, that is a breaking change requiring a version bump.

**Forbidden:**

- Copy-pasting an agent from one app into another. If you find yourself doing this, stop, install the source app as a package instead, and add the missing export to its `__all__`.
- `sys.path.append("../other-app")` hacks. Use `pip install -e` or the MCP mesh.
- App-local `from .config import THIS_APP_ONLY_FLAG` reads inside an agent. Configuration is injected.
- Database models reaching across apps. If two apps need the same table, the table belongs in a shared package, not duplicated.

**Mandatory files for the reusability contract:**

```
<app-root>/
â”œâ”€â”€ pyproject.toml             â† REQUIRED â€” name, version, packages
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ __init__.py            â† REQUIRED â€” re-exports the public API
â”‚   â”œâ”€â”€ py.typed               â† REQUIRED â€” empty marker file
â”‚   â”œâ”€â”€ agents/__init__.py     â† lists the top-level orchestrator + conductors
â”‚   â”œâ”€â”€ agents/<dept>/__init__.py   â† lists that department's agents
â”‚   â”œâ”€â”€ tools/__init__.py
â”‚   â”œâ”€â”€ tools/<area>/__init__.py
â”‚   â”œâ”€â”€ schemas/__init__.py    â† lists the public schemas
â”‚   â””â”€â”€ workflows/__init__.py
â””â”€â”€ docs/REUSABILITY.md        â† REQUIRED â€” lists what is publicly exported
                                  and which other apps currently consume it
```

**How Claude Code applies this rule when implementing:**

1. Before creating a new agent or tool, check whether an equivalent already exists in this app OR in any sibling app (`C:\Users\USER\Documents\*` and `C:\Users\USER\Desktop\*`). If it does, 
**install the sibling app as a package and import from it**. Do not duplicate. (Restates and tightens Directive Â§3.)
2. When adding a new agent/tool, place it under the correct package path AND add it to the parent package's `__init__.py` `__all__`. An agent that isn't exported is not finished.
3. When `pyproject.toml` is missing, scaffold a minimal one before any other code: `[project] name="<app-slug>"`, `version="0.1.0"`, `[tool.setuptools.packages.find] where=["."]`.
4. If a new feature needs a value that today is hardcoded in this app, move it to `app/core/config.py` (or equivalent `Settings` class) and inject it. Do not propagate the hardcoding into a new 
module.
5. Update `docs/REUSABILITY.md` whenever the public `__all__` of any package changes, listing the new export, its schema, and any consumer app that will need updating.

## 0.4 Verified Toolchain (as of 2026-06-12)

The framework above assumes a working install of the three core components. As of 2026-06-12 these are the validated versions on this account's primary Windows workstation:

| Component | Version | Verified by |
|---|---|---|
| Google ADK (Python) | `google-adk 2.2.0` | `python -c "import google.adk; print(google.adk.__version__)"` |
| Python | 3.14.4 (Windows x64) | `python --version` |
| Claude Code | Opus 4.7 (`claude-opus-4-7`) | this session |
| Codex CLI | v0.137.0 (ChatGPT Plus auth, `stored auth mode: chatgpt`) | `codex --version` |

When this row drifts (new ADK release, new Claude Code model), update it here, NOT in the per-app `CLAUDE.md` â€” then re-sync.

## 0.5 Local Dev Runtime â€” Windows Install Playbook

The first-time install of ADK on a fresh Windows machine hits four real friction points. These are documented here so the next setup is one-shot, not a debugging session.

**1. Network â€” PyPI may be unreachable, use a mirror.** Direct `pip install google-adk` against `pypi.org` was reset (`ConnectionResetError 10054`) on this machine while `google.com` worked 
fine. The workaround that succeeded:

```
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ google-adk
```

Tsinghua is a third-party mirror; once the canonical PyPI route clears, reinstall to restore standard package provenance.

**2. Console encoding â€” set UTF-8 before any `adk` call.** PowerShell's default cp1252 console can't render the Unicode in `adk create`'s success banner and the call crashes â€” but only 
*after* the files are already written. Files are correct; only the success message dies. Set before every `adk` call:

```
$env:PYTHONIOENCODING = 'utf-8'
```

**3. PATH â€” pip installs `adk.exe` off-PATH on Windows.** pip drops scripts under `C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\Scripts\` which is not on the default PATH. Add it once:

```powershell
$scripts = 'C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\Scripts'
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($current -split ';') -notcontains $scripts) {
  [Environment]::SetEnvironmentVariable('Path', $current.TrimEnd(';') + ';' + $scripts, 'User')
}
```

New shells inherit; current shell needs `$env:Path += ';' + $scripts`.

**4. Non-interactive `adk create` â€” pass `--api_key` to skip the prompt.** Plain `adk create <name>` prompts for backend (1=Google AI, 2=Vertex, 3=Login with Google). The non-interactive form 
for Google AI:

```
adk create <name> --model gemini-2.0-flash --api_key <KEY>
```

`--api_key` implies the Google AI backend and writes a `.env` with `GOOGLE_GENAI_USE_VERTEXAI=0` + `GOOGLE_API_KEY=â€¦` into the agent folder. Keep that `.env` out of git.

**Run the dev UI.** From the parent dir of the agent folder:

```
adk web --port 8765
```

Uvicorn's `--reload` is force-disabled on Windows (no subprocess support in SelectorEventLoop). The dev UI loads at `http://127.0.0.1:8765/dev-ui/`; `GET /` returns 307 to `/dev-ui/`.

**Codex CLI on Windows â€” sandbox is too tight for framework-install tasks.** Workspace-write is fine for normal code review (git-tracked file ops are pre-allowed), but `codex exec -s 
workspace-write` rejects even `python --version` on Windows, which means it can't drive `pip install`. For one-shot framework-install or environment-fix runs, use:

```
codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "<prompt>"
```

Do NOT make `--dangerously-bypass-approvals-and-sandbox` the default for the pair-coding loop â€” only reach for it on install/setup tasks.

## 1. The Platform Hierarchy Every App Inherits

Even when an app only builds part of this hierarchy, the structure is the canonical mental model. Departments live under `app/agents/`. Tools live under `app/tools/`. Workflows live under 
`app/workflows/`.

```
Enterprise Agent Hierarchy
â”‚
â”œâ”€â”€ Executive Department          (app/agents/executive/)
â”‚   â”œâ”€â”€ Chief Executive Agent
â”‚   â”œâ”€â”€ Chief Operating Agent
â”‚   â”œâ”€â”€ Chief Financial Agent
â”‚   â”œâ”€â”€ Chief Technology Agent
â”‚   â”œâ”€â”€ Chief Engineering Agent
â”‚   â”œâ”€â”€ Chief Construction Agent
â”‚   â”œâ”€â”€ Chief Procurement Agent
â”‚   â”œâ”€â”€ Chief Legal Agent
â”‚   â”œâ”€â”€ Chief Research Agent
â”‚   â”œâ”€â”€ Chief Sales Agent
â”‚   â”œâ”€â”€ Chief Support Agent
â”‚   â”œâ”€â”€ Work Reviewer Agent       â† GOVERNANCE
â”‚   â””â”€â”€ Work Scheduler Agent      â† GOVERNANCE
â”‚
â”œâ”€â”€ Technology Department         (app/agents/technology/)
â”‚   â”œâ”€â”€ Chief Technology Agent
â”‚   â”œâ”€â”€ Development Supervisor Agent  â† GOVERNANCE
â”‚   â”œâ”€â”€ Claude Code Agent             â† THIS IS ME
â”‚   â”œâ”€â”€ Codex Agent
â”‚   â”œâ”€â”€ Software Architect Agent
â”‚   â”œâ”€â”€ DevOps Agent
â”‚   â”œâ”€â”€ Security Agent
â”‚   â”œâ”€â”€ Testing Agent
â”‚   â”œâ”€â”€ Deployment Agent
â”‚   â”œâ”€â”€ API Agent
â”‚   â”œâ”€â”€ Database Agent
â”‚   â””â”€â”€ Monitoring Agent
â”‚
â”œâ”€â”€ Engineering Department        (app/agents/engineering/)
â”œâ”€â”€ Construction Department       (app/agents/construction/)
â”œâ”€â”€ Procurement Department        (app/agents/procurement/)
â”œâ”€â”€ Finance Department            (app/agents/finance/)
â”œâ”€â”€ Healthcare Department         (app/agents/healthcare/)
â”œâ”€â”€ Legal Department              (app/agents/legal/)
â”œâ”€â”€ Research Department           (app/agents/research/)
â”œâ”€â”€ Sales Department              (app/agents/sales/)
â””â”€â”€ Support Department            (app/agents/support/)
```

Specialist agents and tools per department are enumerated in `agenticadk1.txt` sections 5â€“13. Implement only the agents the current app actually needs â€” but **always create the directory** 
with an `__init__.py` so the hierarchy is recognisable.

## 2. Governance Agents â€” Mandatory in Every App

These three agents are non-skippable, no matter how small the app. They are the project's quality gates inside the ADK layer.

### 2.1 Work Reviewer Agent (`app/agents/executive/work_reviewer_agent.py`)

**Role:** Review every agent's output before it leaves the platform.

**Reviews:** engineering calculations Â· BOQs Â· project plans Â· proposals Â· reports Â· code outputs Â· risk registers Â· schedules Â· client-facing documents.

**Checks:** technical correctness Â· completeness Â· formatting Â· compliance with project requirements Â· calculation logic Â· document quality Â· client-readiness.

**Returns (schema: `app/schemas/review_schema.py`):**

```python
class WorkReview(BaseModel):
    review_status: Literal["approved", "corrections_required", "rejected"]
    quality_score: int  # 0â€“100
    missing_items: list[str]
    technical_errors: list[str]
    compliance_issues: list[str]
    correction_instructions: list[str]
    approval_comment: str | None
```

**Output statuses (every reviewable artifact carries one):**
`draft` â†’ `under_review` â†’ `corrections_required` â†’ `approved` â†’ `rejected`.

### 2.2 Development Supervisor Agent (`app/agents/technology/development_supervisor_agent.py`)

**Role:** Supervise all software-engineering tasks executed by Claude Code Agent, Codex Agent, DevOps Agent, Testing Agent, Security Agent, and Deployment Agent.

**Responsibilities:** break dev work into tasks Â· assign coding tasks to Claude Code Â· assign testing tasks to Testing Agent Â· assign security review to Security Agent Â· assign deployment 
tasks to DevOps Agent Â· review PR-style summaries Â· track development progress Â· enforce coding standards Â· keep architecture consistent Â· keep documentation up to date Â· escalate blockers 
to Chief Technology Agent.

**Returns (schema: `app/schemas/development_supervision_schema.py`):**

```python
class DevelopmentSupervisionReport(BaseModel):
    development_tasks: list[DevTask]
    assigned_coding_agent: str
    architecture_notes: list[str]
    testing_requirements: list[str]
    security_requirements: list[str]
    deployment_requirements: list[str]
    blocked_items: list[str]
    next_actions: list[str]
```

### 2.3 Work Scheduler Agent (`app/agents/executive/work_scheduler_agent.py`)

**Role:** Convert project goals into work breakdowns, schedules, milestones, and deadlines.

**Responsibilities:** create WBS Â· build task dependencies Â· produce Gantt-style schedules Â· set milestones Â· assign responsible agents Â· track task status Â· detect delays Â· re-plan 
delayed activities Â· emit weekly + daily work plans Â· emit progress summaries.

**Returns (schema: `app/schemas/schedule_schema.py`):**

```python
class WorkSchedule(BaseModel):
    work_breakdown_structure: list[WBSNode]
    milestones: list[Milestone]
    task_dependencies: list[Dependency]
    responsible_agents: dict[str, str]   # task_id â†’ agent_name
    planned_start_dates: dict[str, date]
    planned_finish_dates: dict[str, date]
    critical_tasks: list[str]
    progress_status: dict[str, TaskStatus]
```

**Task statuses (every scheduled task carries one):**
`not_started` â†’ `assigned` â†’ `in_progress` â†’ `blocked` â†’ `under_review` â†’ `completed` â†’ `approved`.

## 3. The Mandatory Control Sequence

Every project request â€” no matter how small â€” flows through this sequence. Short-circuit it only with explicit owner approval logged in `docs/IMPLEMENTATION_LOG.md`.

1. **User submits project request** â†’ API or chat or admin dashboard.
2. **Chief Executive Agent classifies the project** â†’ maps to one or more departments.
3. **Work Scheduler Agent** creates WBS + schedule + milestones + dependencies.
4. **Chief Operating Agent** assigns departments to schedule entries.
5. **Specialist agents** execute their work (engineering, construction, finance, etc.).
6. **Development Supervisor Agent** supervises any software-related work in parallel.
7. **Work Reviewer Agent** reviews every agent output against the schemas in Â§2.
8. **Rejected work** routes back to the responsible agent with `correction_instructions`.
9. **Work Reviewer Agent** approves the final corrected output.
10. **Chief Executive Agent** issues the final executive report to the user.

## 4. Required Files Per App (when the agentic layer is built)

Implement these as the app grows. Stub the file with a docstring + `pass` until the agent is actually wired â€” but the path must exist so the hierarchy is discoverable.

```
app/
â”œâ”€â”€ agents/
â”‚   â”œâ”€â”€ executive/
â”‚   â”‚   â”œâ”€â”€ chief_executive_agent.py
â”‚   â”‚   â”œâ”€â”€ chief_operating_agent.py
â”‚   â”‚   â”œâ”€â”€ work_reviewer_agent.py          â† MANDATORY
â”‚   â”‚   â””â”€â”€ work_scheduler_agent.py         â† MANDATORY
â”‚   â”œâ”€â”€ technology/
â”‚   â”‚   â”œâ”€â”€ chief_technology_agent.py
â”‚   â”‚   â”œâ”€â”€ development_supervisor_agent.py â† MANDATORY
â”‚   â”‚   â”œâ”€â”€ claude_code_agent.py
â”‚   â”‚   â”œâ”€â”€ codex_agent.py
â”‚   â”‚   â”œâ”€â”€ software_architect_agent.py
â”‚   â”‚   â”œâ”€â”€ devops_agent.py
â”‚   â”‚   â”œâ”€â”€ security_agent.py
â”‚   â”‚   â”œâ”€â”€ testing_agent.py
â”‚   â”‚   â”œâ”€â”€ deployment_agent.py
â”‚   â”‚   â”œâ”€â”€ api_agent.py
â”‚   â”‚   â”œâ”€â”€ database_agent.py
â”‚   â”‚   â””â”€â”€ monitoring_agent.py
â”‚   â””â”€â”€ {engineering,construction,procurement,finance,healthcare,legal,research,sales,support}/
â”œâ”€â”€ tools/
â”‚   â”œâ”€â”€ governance/
â”‚   â”‚   â”œâ”€â”€ review_tool.py
â”‚   â”‚   â””â”€â”€ quality_check_tool.py
â”‚   â”œâ”€â”€ scheduling/
â”‚   â”‚   â”œâ”€â”€ work_breakdown_tool.py
â”‚   â”‚   â”œâ”€â”€ gantt_tool.py
â”‚   â”‚   â””â”€â”€ dependency_tool.py
â”‚   â””â”€â”€ technology/
â”‚       â””â”€â”€ development_task_tool.py
â”œâ”€â”€ schemas/
â”‚   â”œâ”€â”€ review_schema.py
â”‚   â”œâ”€â”€ schedule_schema.py
â”‚   â””â”€â”€ development_supervision_schema.py
â”œâ”€â”€ workflows/
â”‚   â””â”€â”€ governance_pipeline.py     â† runs the Â§3 control sequence
â””â”€â”€ memory/
    â”œâ”€â”€ session_memory.py          â† short-term
    â”œâ”€â”€ project_memory.py          â† long-term
    â”œâ”€â”€ organization_memory.py
    â”œâ”€â”€ user_memory.py
    â””â”€â”€ vector_memory.py           â† Qdrant or ChromaDB
```

## 5. Required APIs (FastAPI)

Even apps that don't expose every endpoint to end users should register these for ADK orchestration:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agents/execute` | Run an agent by name with a task payload |
| POST | `/api/projects` | Create a project record |
| POST | `/api/tasks` | Create a task (assigned by Work Scheduler) |
| POST | `/api/documents/upload` | Upload to the Document Intelligence layer |
| POST | `/api/workflows/execute` | Execute a named workflow |
| POST | `/api/reports` | Generate a report |
| POST | `/api/review/work` | Submit work to the Work Reviewer Agent |
| POST | `/api/schedule/project` | Submit a project to the Work Scheduler Agent |
| POST | `/api/technology/supervise-development` | Submit dev work to the Development Supervisor Agent |
| GET | `/api/dashboard/metrics` | Admin dashboard counters |

All endpoints enforce `tenant_id`, RBAC, and audit logging per the Project Execution Directive Â§6â€“Â§9.

## 6. Memory & Knowledge Layer

| Layer | Store | Used for |
|---|---|---|
| Short-term session memory | Redis | Conversation context within a single agent run |
| Long-term project memory | PostgreSQL | Project history, decisions, deliverables |
| Organization memory | PostgreSQL | Tenant-wide policies, standards, suppliers |
| User memory | PostgreSQL | Per-user preferences and history |
| Vector memory | Qdrant or ChromaDB | Semantic search over documents + past outputs |

PostgreSQL is the structured-data baseline (see Directive Â§6, Â§7, Â§11 for tenant + RLS + indexing rules). All four governance schemas above persist to PostgreSQL.

## 7. Multi-Tenant Discipline (extends Directive Â§6)

Every governance-related table inherits the same tenant discipline as business tables:

- `work_reviews`, `work_schedules`, `development_supervisions`, `agent_runs`, `tool_invocations`, `workflow_executions`, `audit_logs` â€” all carry `tenant_id`, `organization_id`, `created_by`, 
`created_at`, `updated_at`.
- All queries filter by `tenant_id`.
- RLS policies on every governance table.

## 8. Security Requirements (extends Directive Â§17)

For the agentic layer specifically:

- **Agent execution authorization:** verify the calling user has the role required to invoke that agent.
- **Tool sandboxing:** tools that touch the filesystem or shell must validate inputs and run inside the project's allowlist.
- **Prompt-injection defence:** strip / quarantine user-supplied content that re-instructs an agent ("ignore prior instructions", role-spoofing, etc.).
- **Secrets:** never hard-code API keys for ADK / Vertex AI / Claude API / Codex / Qdrant â€” read from env, document in `.env.example`.
- **Audit:** every agent run logs `(tenant_id, user_id, agent_name, input_hash, output_hash, started_at, finished_at, status)`.

## 9. Deployment

The ADK runtime ships as part of the app's container. Reference deploy targets (in order of preference for low cost): Render free tier â†’ Railway â†’ VPS â†’ Google Cloud Run (Vertex AI region) 
â†’ Kubernetes. Vertex AI is the canonical home for ADK in production, but starter scaffolds may run ADK locally with the Python SDK only.

`Dockerfile`, `docker-compose.yml`, `.env.example`, `requirements.txt` (or `pyproject.toml`), GitHub Actions workflow, and `README.md` are mandatory per Directive Â§19.

## 10. Testing

Add these test groups in `tests/`:

- `test_agent_initialization.py` â€” every agent constructs cleanly.
- `test_tool_execution.py` â€” every tool runs with sample inputs.
- `test_governance_flow.py` â€” Work Scheduler â†’ Specialist â†’ Development Supervisor â†’ Work Reviewer â†’ approved.
- `test_review_statuses.py` â€” all five review statuses transition correctly.
- `test_task_statuses.py` â€” all seven task statuses transition correctly.
- `test_tenant_isolation.py` â€” cross-tenant access denied at app + DB layer.
- `test_api_endpoints.py` â€” every endpoint from Â§5.

## 11. How Claude Code Should Behave Inside This Hierarchy

When working in any app under this account, Claude Code is acting **as the Claude Code Agent inside the Technology Department**. Concretely:

1. **Before writing code,** read CLAUDE.md, context.MD, MCP.md, and the Directive's Â§1 session-start files. Produce the orientation summary.
2. **For ANY agent-shaped work, design and implement it in Google ADK** â€” see Â§0.1. If the requested feature involves an agent, a tool an agent will use, a multi-agent workflow, memory shared 
between agents, or an orchestration step, the implementation goes through ADK primitives. No exceptions without an approved ADR.
3. **Take instructions from the Development Supervisor Agent.** If no Development Supervisor exists in this repo yet, behave as if its instructions are the user's instructions, but record what a 
Supervisor would have asked for in `docs/IMPLEMENTATION_LOG.md`.
4. **Hand off completed code to Codex CLI** via `scripts/quality-gate.sh` (existing pair-coding skeleton).
5. **After Codex signs off, hand off to the Supervisor** (`/code-review`, `/security-review`, `/verify`).
6. **After Supervisor signs off, hand off to the Work Reviewer Agent** â€” even for code, because the Work Reviewer checks completeness and client-readiness (READMEs, ADRs, deployment guides, 
tests).
7. **Update the Work Scheduler Agent's task status** when an assigned task moves through `in_progress` â†’ `under_review` â†’ `completed` â†’ `approved`.

If any of these governance agents are not yet implemented in the current app, Claude Code's job is to scaffold their stubs **in ADK** first, before doing the requested feature work. Stubs are 
cheap; missing governance is not.

## 12. Demo Workflow (every app gets one)

Wire a `POST /api/demo/run` endpoint or a CLI command that takes a single prompt â€” e.g. `"Create a project plan for a 10-storey commercial building."` â€” and produces:

1. Classification (Chief Executive Agent).
2. Work breakdown + schedule (Work Scheduler Agent).
3. Department assignments (Chief Operating Agent).
4. Specialist outputs (construction, engineering, finance, procurement, legal agents â€” whichever are implemented).
5. Development supervision report (if any software work was triggered).
6. Review report (Work Reviewer Agent).
7. Executive summary (Chief Executive Agent).

This demo doubles as the smoke test for the governance pipeline.

## 13. Free / Open-Source Stack Preference

This extension does NOT override the FOSS Stack Rule in the Project Execution Directive. Default reviewer is **Codex CLI signed in with ChatGPT Plus** (no per-call cost). Default LLM for ADK 
agents is whatever the FOSS rule allows for this app â€” Ollama / OpenRouter free / GitHub Models â€” before any paid Claude/Vertex usage. Paid AI usage requires explicit owner approval, logged 
in `docs/IMPLEMENTATION_LOG.md`.

## 14. The Four Gates â€” Restated

Nothing ships until all four pass. In order:

| Gate | Owned by | Mechanism |
|---|---|---|
| 1. Code review | Codex CLI | `./scripts/quality-gate.sh` |
| 2. Supervisor sign-off | Claude Code skills | `/code-review`, `/security-review`, `/verify` |
| 3. Work Reviewer Agent | ADK governance | `POST /api/review/work` â†’ status `approved` |
| 4. Work Scheduler Agent | ADK governance | task status flipped to `approved` |

If any gate is blocked, escalate per Â§3 step 8 â€” back to the responsible agent with `correction_instructions`. Do not bypass.

<!-- END: AGENTIC ADK EXTENSION -->


---


---

<!-- BEGIN: PROJECT EXECUTION DIRECTIVE (canonical â€” do not edit in place; re-sync from C:\Users\USER\_project_directive_append.md) -->

# PROJECT EXECUTION DIRECTIVE

> **READ THIS AT THE START OF EVERY SESSION, TASK, FEATURE, BUG FIX, REFACTOR, DEPLOYMENT, OR CODE REVIEW.**
> Canonical source: `C:\Users\USER\Documents\pvsolar1\improvements\dontforget1.txt` (Project Execution Directive + Free/Open-Source Stack Rule) and `improvements\thereviewer1.txt` (Codex 
pair-coding workflow). Re-read those if any rule below is ambiguous.

You are the **Principal Solution Architect, Principal Software Engineer, Principal Database Architect, Principal DevOps Engineer, Principal Security Engineer, Principal AI Systems Engineer, 
Principal QA Engineer, and Technical Director** for this project.

This is a long-term commercial system. Behave like a disciplined senior development team, not a casual code generator. Protect the project from: forgetting previous work Â· repeating completed 
work Â· creating duplicate modules Â· drifting from approved architecture Â· careless technology choices Â· breaking existing features Â· ignoring security Â· ignoring tenant isolation Â· 
ignoring scalability Â· leaving incomplete work Â· producing shallow or rushed code.

## 1. Session Start Rule â€” Reorient Before Any Work

Read `CLAUDE.md`, `README.md`, `context.MD`, `docs/PROJECT_ROADMAP.md`, `docs/IMPLEMENTATION_LOG.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/DATABASE_DESIGN.md`, `docs/API_SPECIFICATION.md`, 
`docs/SECURITY_ARCHITECTURE.md`, `docs/DEPLOYMENT_GUIDE.md`, existing source, tests, package files, docker/k8s files, open TODOs.

Produce a short orientation summary (completed modules Â· partial modules Â· missing modules Â· technical risks Â· next logical task Â· files likely affected) **before coding**. Do not assume. 
Verify.

## 2. Scope Control Rule

Identify exact task boundary: what is requested Â· which module Â· feature/fix/refactor/security/deploy/doc Â· which files change Â· which must NOT be touched Â· which tables Â· which endpoints 
Â· which pages Â· which tests Â· which docs. No scope drift. No unrequested redesign.

## 3. Do Not Forget Previous Work Rule

Before creating any new file, table, endpoint, service, page, component, or agent â€” **search for an existing equivalent.** If it exists, **extend, don't duplicate.** If partial, **complete, 
don't restart.** If unclear, log uncertainty in `docs/IMPLEMENTATION_LOG.md` and proceed cautiously.

## 4. Architecture Consistency Rule

Backend layout: `backend/app/{core,database,models,schemas,routers,services,repositories,middleware,workers,security,tests}/`. Frontend layout: 
`frontend/src/{app,components,features,hooks,lib,services,styles}/`. Docs layout: 
`docs/{PROJECT_ROADMAP,IMPLEMENTATION_LOG,ARCHITECTURE_DECISIONS,DATABASE_DESIGN,API_SPECIFICATION,SECURITY_ARCHITECTURE,DEPLOYMENT_GUIDE,TEST_PLAN,OPERATIONS_MANUAL}.md`.

No business logic in route handlers. Use pipeline: **Router â†’ Service â†’ Repository â†’ Database**.

## 5. Senior Engineering Quality Rule

Every feature ships with: frontend page/component Â· backend endpoint Â· request/response schemas Â· service logic Â· repository/DB logic Â· model or migration Â· auth check Â· authorization 
check Â· `tenant_id` check Â· RLS policy Â· audit log Â· error handling Â· tests Â· documentation. A feature is **not complete** until all relevant items are done.

## 6. Multi-Tenant Discipline Rule

Every organization-owned record carries: `tenant_id`, `created_by_user_id`, `created_at`, `updated_at`. Every protected query: `WHERE tenant_id = :current_tenant_id` (and `AND created_by_user_id 
= :current_user_id` for user-owned). Forbidden: `SELECT * FROM projects WHERE id = :id`. Required: `SELECT * FROM projects WHERE id = :id AND tenant_id = :current_tenant_id`. Applies to: users, 
projects, BOQs, designs, product registers, suppliers, invoices, procurement packages, bids, reports, files, tickets, AI agent runs, audit logs, settings.

## 7. PostgreSQL RLS Rule

App code is the first line of defence; DB RLS is the final. **Both required.** For every tenant-owned table:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_name_tenant_policy ON table_name FOR ALL
USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Before tenant queries: `SET app.current_tenant`, `app.current_user`, `app.current_role`. Tenant isolation is not complete until both layers exist.

## 8. Permission and Hidden Page Rule

Hidden â‰ secure. Every hidden/restricted page: login check Â· active session Â· `tenant_id` validation Â· role permission Â· backend authorization Â· DB RLS. If a user guesses the URL, the 
backend must still deny. Protect at minimum: `/admin`, `/admin/security`, `/admin/logs`, `/admin/rls-monitoring`, `/admin/npm-audit`, `/admin/database`, `/admin/backup`, `/procurement`, 
`/bidders`, `/reports`, `/files`, `/ai-agency`, `/settings/security`, `/billing`, `/users`.

## 9. Logout Must Really Work Rule

Frontend token deletion is not enough. Implement: logout endpoint Â· refresh token revocation Â· session invalidation Â· `session_version` bump Â· browser cleanup Â· backend rejection of revoked 
tokens Â· audit log. Test: login â†’ access â†’ logout â†’ old token â†’ 401 â†’ browser-back reveals nothing â†’ revoked refresh cannot mint new access.

## 10. Scalability Rule

Assume: 1000 concurrent logins, 1000 dashboards, 500 project creators, 200 report generators, 100 AI tasks, multiple orgs at once. Per-feature: indexes? cache? queueable? connection pressure? 
stateless? safe under horizontal scaling? Use **Redis** (cache), **Celery/RQ/Dramatiq** (queues), **PgBouncer** (pool), **Nginx/Traefik/K8s** (LB).

## 11. Indexing Rule

Baseline for tenant-owned tables:
```sql
CREATE INDEX idx_table_tenant_id      ON table_name(tenant_id);
CREATE INDEX idx_table_tenant_status  ON table_name(tenant_id, status);
CREATE INDEX idx_table_tenant_created ON table_name(tenant_id, created_at DESC);
CREATE INDEX idx_table_tenant_project ON table_name(tenant_id, project_id);
CREATE INDEX idx_table_tenant_user    ON table_name(tenant_id, created_by_user_id);
```
Never ship a large table without index planning.

## 12. Caching Rule

Cache permissions, subscription status, product categories, supplier list, location data, load library, equipment library, dashboard summaries, job status. Keys for tenant data **must** include 
`tenant_id`: `tenant:{tenant_id}:permissions:{user_id}`. Never share cache keys across tenants.

## 13. Queue / Background Job Rule

Background-queue: PDF/DOCX/Excel export, BOQ generation, design reports, economic analysis, AI agent tasks, bid evaluation, email, invoice export, file processing, large imports. Every job 
records: `job_id`, `tenant_id`, `user_id`, `job_type`, `status`, `started_at`, `completed_at`, `error_message`, `result_file_id`.

## 14. AI Agent Discipline Rule

Each agent declares: `agent_id`, `agent_name`, `agent_role`, `allowed_tools`, `allowed_data_scope`, `tenant_id`, `approval_required_actions`, `logging_enabled`. **Human approval required for:** 
sending emails, deleting data, awarding bids, changing subscriptions, exporting confidential reports, updating supplier prices, modifying financial data, admin operations. Every run logged with 
input/output summary, tools used, status, timestamps.

## 15. Error Handling Rule

No raw errors leak. Structured: `{ "error": "VALIDATION_ERROR", "message": "...", "request_id": "..." }`. Log full details internally, show safe messages externally.

## 16. Logging & Audit Rule

Audit log fields: `tenant_id`, `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `created_at`, `status`. Audit events: login, logout, failed login, project created, 
BOQ generated, design generated, invoice generated, proposal exported, supplier price changed, bid submitted, bid evaluated, file downloaded, admin page accessed, permission denied, tenant 
violation attempt.

## 17. Admin Operations Rule

Admin dashboard buttons: Ping Frontend/Backend/DB/Redis/Queue Â· Check RLS Â· Check Tenant Isolation Â· npm Audit Â· pip Audit Â· Security Audit Â· View Logs Â· View Audit Logs Â· Run Backup Â· 
Verify Backup Â· Run Load Test Â· Clear Cache Â· Restart Queue Worker. Every admin action is itself permission-controlled and audit-logged.

## 18. Dependency Rule

Before release: `npm audit --audit-level=high`, `pip-audit`, `trivy image app-backend`, `semgrep scan`. Before adding any package: necessary? maintained? secure? licence acceptable? bloat?

## 19. Testing Rule

Categories: unit, integration, security, tenant isolation, RLS, logout, hidden route, file access, API validation, load. Minimum per protected resource: authorized user can access Â· unauthorized 
cannot Â· wrong tenant cannot Â· logged-out cannot Â· expired token cannot.

## 20. Documentation Rule

After every meaningful change update: `README.md`, `docs/API_SPECIFICATION.md`, `docs/DATABASE_DESIGN.md`, `docs/SECURITY_ARCHITECTURE.md`, `docs/IMPLEMENTATION_LOG.md`, 
`docs/PROJECT_ROADMAP.md`. Capture: what Â· why Â· files Â· DB impact Â· API impact Â· security impact Â· tests Â· limitations Â· next steps.

## 21. Implementation Log Template (append to `docs/IMPLEMENTATION_LOG.md` after every task)

```
# Implementation Log Entry
Date: | Task: | Status:
Objective: | Files Changed: | Database Changes: | API Changes:
Frontend Changes: | Security Changes: | Tests Added: | Documentation Updated:
What Was Completed: | What Remains: | Known Risks: | Next Recommended Step:
```

## 22. Architecture Decision Record Template

```
# ADR
ADR Number: | Title: | Date: | Status:
Context: | Decision: | Alternatives Considered: | Reason:
Consequences: | Impact on Security/Performance/Cost/Maintenance:
```

## 23. Task Execution Checklist

**Before coding:** reviewed CLAUDE.md Â· reviewed roadmap Â· reviewed impl log Â· checked existing code Â· confirmed scope Â· identified affected files Â· DB impact Â· security impact Â· tenant 
impact Â· planned tests.
**After coding:** code done Â· no duplicate module Â· auth enforced Â· authorization enforced Â· `tenant_id` enforced Â· RLS updated Â· indexes added Â· audit logs added Â· errors handled Â· 
tests added Â· tests pass Â· docs updated Â· impl log updated.

## 24. Final Self-Instruction

Stay focused. Do not drift. Do not guess. Do not forget where the project left off. Do not restart completed work. Do not create duplicate architecture. Do not bypass security, tenant isolation, 
or RLS. Do not create shallow placeholder work. **Verify before changing. Plan before coding. Test before completion. Document before closing.** The goal is a secure, scalable, maintainable, 
commercial-grade platform.

---

# FREE / OPEN-SOURCE TECHNOLOGY STACK RULE

Build with a **free / open-source first** stack. Paid SaaS only when explicitly approved by the project owner. Design so the system runs locally, on a low-cost VPS, or on Kubernetes â€” no vendor 
lock-in.

| Domain | Preferred Free / Open-Source |
|---|---|
| Frontend | Next.js, React, Tailwind |
| Forms & Validation | React Hook Form, Zod |
| Backend API | FastAPI or NestJS |
| Database | PostgreSQL |
| ORM / Migration | SQLAlchemy + Alembic, or Prisma |
| Row-Level Security | PostgreSQL RLS |
| Cache | Redis or Valkey |
| Queue | Celery, RQ, Dramatiq |
| File Storage | MinIO |
| Authentication | Keycloak, Auth.js, JWT |
| API Gateway / Proxy | Nginx, Traefik |
| Load Balancing | Nginx, Traefik, HAProxy |
| Monitoring | Prometheus, Grafana |
| Logs | Loki, Promtail, OpenTelemetry |
| Error Tracking | GlitchTip (self-hosted Sentry) |
| Security Scanning | Semgrep, Trivy, npm audit, pip-audit |
| CI/CD | GitHub Actions, GitLab CI |
| Deployment | Docker, Docker Compose, Kubernetes |
| DB Pooling | PgBouncer |
| AI Local Runtime | Ollama |
| AI Agent Framework | LangGraph, CrewAI |
| Vector DB | Qdrant, Chroma |
| Email Testing | Mailpit |
| Load Testing | k6, Locust |
| Documentation | Markdown, Docusaurus, MkDocs |

**Cost-control checklist (before adding anything):** free/OSS option? runs locally? runs on low-cost VPS? vendor lock-in? monthly cost? quality gain justifies cost? scales without redesign?

**Low-cost deployment ladder:** Local â†’ Docker Compose Â· Free Testing â†’ Cloudflare Tunnel/LocalTunnel Â· Early Pilot â†’ low-cost VPS + Docker Compose Â· Growing SaaS â†’ VPS cluster + 
Traefik/Nginx Â· Enterprise Scale â†’ Kubernetes + OSS observability Â· DB â†’ self-hosted PostgreSQL (or Neon free/low tier where approved).

The app must run with `docker compose up` and deploy to Kubernetes later. **Enterprise discipline, startup cost control.**

---

# CLAUDE CODE + CODEX CLI PAIR-CODING WORKFLOW

Claude Code = **Lead Architect and Primary Implementer.** Codex CLI = **Independent Pair Programmer and Quality Reviewer.**

**Hard rule: a feature is NOT complete until Codex has reviewed the implementation and all critical / high-priority findings have been fixed.**

## Install Codex CLI

- **macOS/Linux:** `curl -fsSL https://chatgpt.com/codex/install.sh | sh`
- **Windows:** PowerShell or WSL2 path per Codex CLI docs; npm path acceptable.
- **npm (any OS):** `npm install -g @openai/codex`
- Verify: `codex --version` and `codex doctor`.

## Folder layout to create at project root

```
ai-coworkers/
â”œâ”€â”€ claude-role.md          â† Claude implements, fixes findings, never marks complete until Codex review + tests pass
â”œâ”€â”€ codex-role.md           â† Codex reviews requirements, security, tenant_id filters, RLS, tests, performance; never approves without evidence
â”œâ”€â”€ pair-review-checklist.mdâ† 18-item checklist (see below)
â”œâ”€â”€ task-handoff-template.md
â”œâ”€â”€ codex-review-prompts.md â† 6 prompts: requirement, security, database, test, performance, final-approval
â””â”€â”€ quality-gates.md        â† 10 gates that must ALL pass
reviews/
â”œâ”€â”€ codex-review.md
â”œâ”€â”€ codex-security-review.md
â”œâ”€â”€ codex-database-review.md
â””â”€â”€ codex-final-approval.md
scripts/
â”œâ”€â”€ codex-review.sh
â”œâ”€â”€ codex-security-review.sh
â”œâ”€â”€ codex-db-review.sh
â””â”€â”€ quality-gate.sh
```

## Pair-Review Checklist (Codex verifies per feature)

requirement implemented Â· frontend present Â· backend endpoint present Â· model/migration present Â· every tenant query filters `tenant_id` Â· RLS applied Â· roles/permissions enforced Â· hidden 
pages backend-protected Â· inputs validated Â· errors handled Â· logs/audit present Â· tests included Â· indexes added Â· caching used Â· heavy jobs queued Â· secrets out of Git Â· logout truly 
revokes Â· feature scales safely.

## Codex Review Prompts

1. **Requirement Review** â€” defects + fixes vs stated requirement.
2. **Security Review** â€” auth, authorization, tenant isolation, RLS, hidden-route protection, file access, tokens, unsafe data exposure.
3. **Database Review** â€” schema, migrations, indexes, `tenant_id`, FKs, constraints, RLS policies.
4. **Test Review** â€” unit/integration/security/RLS/logout/load/UI coverage.
5. **Performance Review** â€” caching, queueing, DB pooling, indexes, API design, long tasks.
6. **Final Approval** â€” only if requirements met, tests pass, security controls present, no critical issues.

## Quality Gates (ALL must pass)

1. Claude implementation done Â· 2. Codex review completed Â· 3. All critical findings fixed Â· 4. Tests pass Â· 5. Security checks pass Â· 6. Migrations reviewed Â· 7. Tenant isolation verified 
Â· 8. RLS verified Â· 9. Logs/audit present Â· 10. Documentation updated.

## Make targets

```
make codex-review
make codex-security-review
make codex-db-review
make codex-test-review
make quality-gate
```

## Pair-Coding Workflow (every feature)

1. Claude implements. 2. Claude runs tests. 3. Claude asks Codex to review. 4. Codex produces findings. 5. Claude fixes. 6. Claude re-runs tests. 7. Codex performs final approval. 8. **Commit 
only after quality gate passes.**

## Continuous Self-Management

Remain focused Â· disciplined Â· architecture-driven Â· security-conscious Â· tenant-aware Â· performance-aware Â· detail-oriented. Avoid assumptions Â· shortcuts Â· architectural drift Â· scope 
creep Â· duplicate implementations Â· inconsistent naming Â· technical debt. If uncertain: **stop Â· analyze Â· review artifacts Â· then proceed.** Never prioritize speed over correctness, 
convenience over architecture, or new code over understanding existing code.

<!-- END: PROJECT EXECUTION DIRECTIVE -->


 succeeded in 984ms:
'use server';

import type { ActionResult } from '@autoworkshop/ui';
import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';

/**
 * The insurance pack's entry points into the shared org-staff actions.
 *
 * âš ï¸ THIN ON PURPOSE. The rules live once in `org-staff-core.ts`; what belongs
 * here is the pair of values that must NOT come from the client: the workspace
 * id (which decides the API credential and cookie scope) and the paths to
 * revalidate. Binding them in a `'use server'` module makes them server-side
 * constants rather than form fields.
 */

/** Every route that renders this organisation's people. */
const REVALIDATE = ['/insurance/settings/users'] as const;

export async function addInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
  return addOrgMember('insurance', REVALIDATE, formData);
}

export async function withdrawInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
  return withdrawOrgMember('insurance', REVALIDATE, formData);
}

import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
import { addInsuranceMemberAction, withdrawInsuranceMemberAction } from './staff-actions';

/**
 * `/insurance/settings/users` â€” who works for this insurance company.
 *
 * ðŸ”´ THE NAVIGATION HAS ADVERTISED THIS ENTRY AND THERE WAS NO PAGE. The
 * `settings` group is gated on `organization.admin`, a permission NO insurance
 * role held until migration 085 â€” so the entry was invisible to everyone, and
 * the moment 085 made it visible it fell through `[...slug]/page.tsx` to the
 * "not built yet" placeholder. That is why this screen ships in the same
 * session as the role.
 *
 * âš ï¸ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.insurance_company` in
 * `membership.service.ts`. Offering a role the API will refuse is a form that
 * fails on submit, and `membership-role-fit.spec.ts` is what keeps the API side
 * honest. Two literals in two files cannot be type-checked into agreement â€” the
 * most-recorded root cause in this repository â€” so if a role is added there,
 * add it here.
 */

const INSURANCE_ROLE_OPTIONS: readonly OrgRoleOption[] = [
  {
    value: 'insurance_assessor',
    label: 'Assessor',
    hint: 'Assesses claims, registers products and records policies sold',
  },
  {
    value: 'insurance_owner',
    label: 'Administrator',
    hint: 'Full control of this company, including appointing and removing people',
  },
];

export function InsuranceStaffScreen() {
  return (
    <OrgStaffScreen
      workspaceId="insurance"
      title="Users"
      description="Everyone with access to this insurance company, and what they may do. Adding someone gives them access immediately; a suspended account is marked and cannot sign in."
      organisationNoun="insurance company"
      roles={INSURANCE_ROLE_OPTIONS}
      addAction={addInsuranceMemberAction}
      withdrawAction={withdrawInsuranceMemberAction}
    />
  );
}

import { requireNavRoute } from '@autoworkshop/next-shell';
import { InsuranceStaffScreen } from '../../_screens/staff-screen';

/**
 * `/insurance/settings/users` â€” the insurance company's own people.
 *
 * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
 * this component executing and its output would still ship in the RSC payload â€”
 * a recorded defect in this repository, found when a staff member could read
 * customers' vehicles on a page that "was gated".
 *
 * The `settings` group is declared with `organization.admin`, which since
 * migration 085 only `insurance_owner` holds inside an insurance company. So an
 * assessor is refused here by the navigation contract, the API's
 * `CAN_GRANT_MEMBERSHIP` refuses them again, and RLS scopes whatever survives to
 * their own tenant â€” the three independent layers CLAUDE.md Â§8 requires.
 */
export default async function Page() {
  await requireNavRoute('insurance', '/settings/users');
  return <InsuranceStaffScreen />;
}

'use server';

import type { ActionResult } from '@autoworkshop/ui';
import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';

/**
 * The towing pack's entry points into the shared org-staff actions.
 *
 * âš ï¸ THIN ON PURPOSE â€” see the insurance equivalent. What belongs here is the
 * pair of values that must NOT come from the client: the workspace id and the
 * paths to revalidate.
 */

/**
 * The towing tree has no separate "Users" entry â€” Â§52 gives it one `settings`
 * entry â€” so the people list lives on the settings page and that is the path
 * to revalidate. Adding a nav entry Â§52 does not define would be changing
 * approved navigation, which CLAUDE.md prohibits without review.
 */
const REVALIDATE = ['/towing/operations/settings'] as const;

export async function addTowingMemberAction(formData: FormData): Promise<ActionResult> {
  return addOrgMember('towing', REVALIDATE, formData);
}

export async function withdrawTowingMemberAction(formData: FormData): Promise<ActionResult> {
  return withdrawOrgMember('towing', REVALIDATE, formData);
}

import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
import { addTowingMemberAction, withdrawTowingMemberAction } from './staff-actions';

/**
 * Who works for this towing company â€” rendered inside `/operations/settings`.
 *
 * ðŸ”´ WHY IT IS A SECTION AND NOT ITS OWN ROUTE. `02.txt` Â§52 defines ONE
 * settings entry for the towing tree, and CLAUDE.md lists "changing approved
 * navigation without review" among the prohibited actions. Inventing a `users`
 * entry to match the insurance tree would be exactly that. The settings entry is
 * already gated on `organization.admin` â€” the permission `towing_owner` gained
 * in migration 085 â€” so this is the correct home for it under the approved
 * navigation, and no nav change is needed.
 *
 * âš ï¸ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.towing_company` in
 * `membership.service.ts`. Offering a role the API will refuse is a form that
 * fails on submit.
 */

const TOWING_ROLE_OPTIONS: readonly OrgRoleOption[] = [
  {
    value: 'towing_operator',
    label: 'Operator',
    hint: 'Takes requests, runs the dispatch board and manages drivers and vehicles',
  },
  {
    value: 'towing_owner',
    label: 'Administrator',
    hint: 'Full control of this company, including appointing people, rates and invoices',
  },
];

export function TowingStaffSection() {
  return (
    <OrgStaffScreen
      workspaceId="towing"
      title="People"
      description="Everyone with access to this towing company, and what they may do. Adding someone gives them access immediately; a suspended account is marked and cannot sign in."
      organisationNoun="towing company"
      roles={TOWING_ROLE_OPTIONS}
      addAction={addTowingMemberAction}
      withdrawAction={withdrawTowingMemberAction}
    />
  );
}


warning: in-process app-server event stream lagged; dropped 214 events
 succeeded in 1665ms:
apps\web\app\_shared\org-staff\org-staff-screen.tsx:16: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps\web\app\_shared\org-staff\org-staff-screen.tsx:22: * screen could not have existed: `POST /memberships` answered 201 and
apps\web\app\_shared\org-staff\org-staff-screen.tsx:23: * `GET /memberships` answered 403.
apps\web\app\_shared\org-staff\org-staff-screen.tsx:62:  /** The roles this organisation type may confer — must match `ROLES_BY_ORG_TYPE`. */
apps\web\app\_shared\org-staff\org-staff-screen.tsx:90:    workshop version records. `/memberships` unfiltered returns every membership
apps\web\app\_shared\org-staff\org-staff-screen.tsx:98:  const [users, memberships] = await Promise.all([
apps\web\app\_shared\org-staff\org-staff-screen.tsx:100:    apiGet<MembershipRow[]>(workspaceId, `/memberships${orgFilter}`),
apps\web\app\_shared\org-staff\org-staff-screen.tsx:104:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId={workspaceId} />;
apps\web\app\_shared\org-staff\org-staff-screen.tsx:107:  // Active memberships only. A revoked one is kept in the database so that "was
apps\web\app\_shared\org-staff\org-staff-screen.tsx:110:  const active = memberships.data.filter((m) => m.status === 'active');
apps\web\app\_shared\org-staff\org-staff-core.ts:16: * authority had no caller.** The only `POST /memberships` in the product was
apps\web\app\_shared\org-staff\org-staff-core.ts:17: * `workshop/_screens/staff-actions.ts`, so an insurer's founder could hold the
apps\web\app\_shared\org-staff\org-staff-core.ts:60:  const result = await apiPost(workspaceId, '/memberships', {
apps\web\app\_shared\org-staff\org-staff-core.ts:93: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps\web\app\_shared\org-staff\org-staff-core.ts:98: * and the only source of one is `GET /memberships` — which was gated on
apps\web\app\_shared\org-staff\org-staff-core.ts:110:  const result = await apiPatch(workspaceId, `/memberships/${membershipId}/status`, {
packages\auth\src\workspace-preferences.ts:21: * memberships already proved from the validated token subject and refuses a
apps\web\app\workshop\_screens\staff-screen.tsx:21: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps\web\app\workshop\_screens\staff-screen.tsx:67:    `/memberships` unfiltered returns every membership in the tenant, and a
apps\web\app\workshop\_screens\staff-screen.tsx:80:  const [users, memberships] = await Promise.all([
apps\web\app\workshop\_screens\staff-screen.tsx:82:    apiGet<MembershipRow[]>('workshop', `/memberships${orgFilter}`),
apps\web\app\workshop\_screens\staff-screen.tsx:86:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId="workshop" />;
apps\web\app\workshop\_screens\staff-screen.tsx:89:  // Active memberships only. A revoked one is kept in the database so that "was
apps\web\app\workshop\_screens\staff-screen.tsx:92:  const active = memberships.data.filter((m) => m.status === 'active');
apps\web\app\workshop\_screens\staff-screen.tsx:163:                    `u.status`, while `memberships_for_subject()` filters
apps\web\app\workshop\_screens\staff-form.tsx:6:import { addStaffAction, withdrawStaffAction } from './staff-actions';
apps\web\app\workshop\_screens\staff-actions.ts:15: * which is driven FROM `identity.memberships` and therefore lists people who
apps\web\app\workshop\_screens\staff-actions.ts:42:  const result = await apiPost('workshop', '/memberships', {
apps\web\app\workshop\_screens\staff-actions.ts:75: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps\web\app\workshop\_screens\staff-actions.ts:83:  const result = await apiPatch('workshop', `/memberships/${membershipId}/status`, {
apps\web\app\workshop\_screens\service-requests-screen.tsx:24:/** Mirrors `create-job-card-screen.tsx` — the same `/memberships` payload. */
apps\web\app\workshop\_screens\service-requests-screen.tsx:89:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps\web\app\workshop\_screens\request-specialist-screen.tsx:59:    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
apps\web\app\workshop\_screens\request-specialist-screen.tsx:61:    apiGet<Membership[]>('workshop', '/memberships'),
packages\ui\src\QuickCreateButton.tsx:27: * route's own `requireNavRoute` gate are two expressions of one fact rather
apps\web\app\workshop\_screens\quick-create.spec.ts:11: * navigation, so by construction it cannot disagree with `requireNavRoute`.
apps\web\app\workshop\_screens\quick-create.spec.ts:28:  /** The same three functions `requireNavRoute` uses, in the same order. */
apps\web\app\workshop\_screens\quick-create.spec.ts:74:   * default tree `register-customer` carries `permission: 'organization.admin'`.
apps\web\app\workshop\_screens\quick-create.spec.ts:78:  it('the default tree hides the target from a viewer without organization.admin', () => {
apps\web\app\workshop\_screens\quick-create.spec.ts:80:    expect(resolve(undefined, 'register-customer', ['organization.admin'])).toBe(
apps\web\app\workshop\_screens\quick-create.spec.ts:109:        resolve(role, 'create-job-card', ['organization.admin', 'platform.admin']),
apps\web\app\workshop\_screens\quick-create.spec.ts:113:    expect(resolve(undefined, 'create-job-card', ['organization.admin'])).toBeNull();
apps\web\app\workshop\_screens\planned-workshop.spec.ts:85: * `organization.admin` group in the §34 tree and a workshop supervisor holds no
apps\web\app\workshop\_screens\planned-workshop.spec.ts:125:      //     'organization.admin',
apps\web\app\workshop\_screens\nav-label.ts:26: * which should be impossible after `requireNavRoute`, and is still not worth
apps\web\app\workshop\_screens\job-queue-screen.tsx:117:          `requireNavRoute` itself and the API re-derives every rule
apps\web\app\workshop\_screens\job-queue-screen.tsx:138:   * `viewerRole` is the same function `requireNavRoute` uses to pick the tree,
apps\web\app\workshop\_screens\job-card-detail-href.ts:14: * `requireNavRoute`, which asks whether THIS VIEWER'S TREE carries the route —
apps\web\app\workshop\_screens\job-card-detail-href.ts:19: * ⚠️ AND THE REFUSAL WOULD LOOK LIKE A BUG, NOT A RULE. `requireNavRoute` is a
apps\web\app\workshop\_screens\job-card-detail-href.spec.ts:18: * `requireNavRoute` calls `notFound()`, so the user clicks the job number on a
apps\web\app\workshop\_screens\job-card-detail-href.spec.ts:25: * SAME three functions `requireNavRoute` resolves, in the same order, against
apps\web\app\workshop\_screens\discovery-screen.tsx:77:        // to a page their own navigation does not carry, and `requireNavRoute`
apps\web\app\workshop\_screens\create-job-card-screen.tsx:77:  // and `/memberships` is admin-gated for some roles — a receptionist who may
apps\web\app\workshop\_screens\create-job-card-screen.tsx:83:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps\web\app\workshop\_screens\condition-inspection-screen.tsx:30: * `requireNavRoute` in the page decides who reaches this screen at all, and
apps\web\app\workshop\_screens\certifications-screen.tsx:44: * 🔴 THE ENDPOINT IS `/memberships`, NOT `/members`, AND IT RETURNS NO NAME.
apps\web\app\workshop\_screens\certifications-screen.tsx:95:    apiGet<Membership[]>('workshop', '/memberships'),
apps\web\app\workshop\_screens\calls-screen.tsx:136:    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
apps\web\app\workshop\_screens\calls-screen.tsx:138:    apiGet<Membership[]>('workshop', '/memberships'),
apps\web\app\workshop\_screens\branches-screen.tsx:20: * `identity.memberships.branch_id`; it simply had no screen. Adding a second
apps\web\app\workshop\_screens\appointments-screen.tsx:108:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps\web\app\workshop\workshop-operations\vehicle-intake\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\vehicle-intake\page.tsx:16: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-operations\vehicle-intake\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-operations\repair-staging\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\repair-staging\page.tsx:15:  await requireNavRoute('workshop', '/workshop-operations/repair-staging');
apps\web\app\workshop\workshop-operations\repair-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\repair-requests\page.tsx:14:  await requireNavRoute('workshop', '/workshop-operations/repair-requests');
packages\next-shell\src\WorkspaceShell.tsx:142:   * menu. `requireNavRoute` refuses the routes, and the API and RLS deny
packages\next-shell\src\WorkspaceShell.tsx:215:  // navigation; the gated ROUTES are refused separately by `requireNavRoute`.
apps\web\app\workshop\workshop-operations\leads\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\leads\page.tsx:13: * ⚠️ `requireNavRoute` FIRST. A concrete page resolves ahead of `app/[...slug]`,
apps\web\app\workshop\workshop-operations\leads\page.tsx:18:  await requireNavRoute('workshop', '/workshop-operations/leads');
apps\web\app\workshop\workshop-operations\job-cards\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\job-cards\[id]\page.tsx:18:  await requireNavRoute('workshop', '/workshop-operations/job-cards');
apps\web\app\workshop\workshop-operations\job-cards\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\job-cards\page.tsx:15:  await requireNavRoute('workshop', '/workshop-operations/job-cards');
apps\web\app\workshop\workshop-operations\customer-complaints\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\customer-complaints\page.tsx:14:  await requireNavRoute('workshop', '/workshop-operations/customer-complaints');
apps\web\app\workshop\workshop-operations\appointments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-operations\appointments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-operations\appointments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-management\workshop-profile\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\workshop-profile\page.tsx:17: * NOT the control. `requireNavRoute` decides whether this ROUTE is offered;
apps\web\app\workshop\workshop-management\workshop-profile\page.tsx:25:  await requireNavRoute('workshop', '/workshop-management/workshop-profile');
apps\web\app\workshop\workshop-management\tools-and-equipment\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\tools-and-equipment\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\tools-and-equipment\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-management\staff\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\staff\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx is
apps\web\app\workshop\workshop-management\staff\page.tsx:19:  await requireNavRoute('workshop', '/workshop-management/staff');
apps\web\app\workshop\workshop-management\service-categories\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\service-categories\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\service-categories\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-management\service-bays\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\service-bays\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\service-bays\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-management\roles-and-permissions\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\roles-and-permissions\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\roles-and-permissions\page.tsx:21:  await requireNavRoute('workshop', '/workshop-management/roles-and-permissions');
apps\web\app\workshop\workshop-management\pricing-rules\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\pricing-rules\page.tsx:52:  await requireNavRoute('workshop', '/workshop-management/pricing-rules');
apps\web\app\workshop\workshop-management\opening-hours\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\opening-hours\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\opening-hours\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-management\branches\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-management\branches\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-management\branches\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-floor\tools-and-equipment\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\tools-and-equipment\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-floor\tools-and-equipment\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-floor\technicians\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\technicians\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-floor\technicians\page.tsx:21:  await requireNavRoute('workshop', '/workshop-floor/technicians');
apps\web\app\workshop\workshop-floor\service-bays\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\service-bays\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\workshop-floor\service-bays\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\workshop-floor\repair-staging\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\repair-staging\page.tsx:18:  await requireNavRoute('workshop', '/workshop-floor/repair-staging');
apps\web\app\workshop\workshop-floor\job-cards\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\job-cards\[id]\page.tsx:22:  await requireNavRoute('workshop', '/workshop-floor/job-cards');
apps\web\app\workshop\workshop-floor\job-cards\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\workshop-floor\job-cards\page.tsx:15:  await requireNavRoute('workshop', '/workshop-floor/job-cards');
apps\web\app\workshop\vehicles\vehicle-search\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicles\vehicle-search\[id]\page.tsx:22:  await requireNavRoute('workshop', '/vehicles/vehicle-search');
apps\web\app\workshop\vehicles\vehicle-search\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicles\vehicle-search\page.tsx:18:  await requireNavRoute('workshop', '/vehicles/vehicle-search');
apps\web\app\workshop\vehicles\vehicle-history\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicles\vehicle-history\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\vehicles\vehicle-history\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\vehicles\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicles\register-vehicle\page.tsx:15:  await requireNavRoute('workshop', '/vehicles/register-vehicle');
apps\web\app\workshop\vehicle-lookup\page.tsx:25: * ⚠️ NO `requireNavRoute` GATE. This route is deliberately outside the §33
apps\web\app\workshop\vehicle-intake\receive-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicle-intake\receive-vehicle\page.tsx:16: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\vehicle-intake\receive-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\vehicle-intake\issue-intake-receipt\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicle-intake\issue-intake-receipt\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\vehicle-intake\issue-intake-receipt\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\vehicle-intake\create-job-card\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicle-intake\create-job-card\page.tsx:16: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\vehicle-intake\create-job-card\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\ModulePage.tsx:72:  // THE SAME CHECK, AND FOR THE SAME REASON, AS `requireNavRoute`.
packages\next-shell\src\ModulePage.tsx:75:  // first fix missed. Concrete pages call `requireNavRoute`; every route with no
packages\next-shell\src\ModulePage.tsx:97:  // hrefs. Same symmetry as `requireNavRoute`, same silent failure if dropped —
packages\next-shell\src\index.ts:30:export { requireNavRoute } from './require-route';
apps\web\app\workshop\vehicle-intake\condition-inspection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\vehicle-intake\condition-inspection\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\vehicle-intake\condition-inspection\page.tsx:26:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\testing\submit-to-quality-control\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\submit-to-quality-control\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/submit-to-quality-control');
apps\web\app\workshop\testing\submit-to-quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\submit-to-quality-control\page.tsx:18:  await requireNavRoute('workshop', '/testing/submit-to-quality-control');
apps\web\app\workshop\testing\road-test\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\road-test\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/road-test');
apps\web\app\workshop\testing\road-test\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\road-test\page.tsx:18:  await requireNavRoute('workshop', '/testing/road-test');
packages\next-shell\src\WorkspaceGate.test.ts:21:    memberships: [],
packages\next-shell\src\WorkspaceGate.test.ts:36:    expect(hasWorkspaceAccess(viewer(['organization.admin', 'finance.read']), 'platform.admin')).toBe(
packages\next-shell\src\ViewerSwitchers.tsx:33: * viewer's own memberships, and the API re-validates the choice against
packages\next-shell\src\ViewerSwitchers.tsx:34: * memberships proved from the validated token — a request naming an
packages\next-shell\src\ViewerSwitchers.tsx:47:  const organizations = organizationsFromMemberships(viewer.memberships);
apps\web\app\workshop\testing\repair-test-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\repair-test-results\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/repair-test-results');
packages\next-shell\src\viewer.ts:55:  // memberships — correctly, since that is an authorization probe. But a
packages\next-shell\src\viewer.ts:69:  // and `requireNavRoute` called `notFound()` — so the OWNER saw
packages\next-shell\src\viewer.ts:230: * `x-organization-id` against the user's own memberships and refuses one that
packages\next-shell\src\viewer.ts:246:  const holds = viewer.memberships.some((m) => m.organizationId === id);
packages\next-shell\src\viewer.ts:254: * re-checks `x-role-name` against the user's own memberships and REFUSES one
apps\web\app\workshop\testing\repair-test-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\repair-test-results\page.tsx:18:  await requireNavRoute('workshop', '/testing/repair-test-results');
apps\web\app\workshop\testing\post-repair-scan\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\post-repair-scan\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/post-repair-scan');
apps\web\app\workshop\testing\post-repair-scan\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\testing\post-repair-scan\page.tsx:18:  await requireNavRoute('workshop', '/testing/post-repair-scan');
apps\web\app\workshop\technical-tools\wiring-diagrams\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\wiring-diagrams\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\wiring-diagrams\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\technical-tools\technical-service-information\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\technical-service-information\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\technical-service-information\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\technical-tools\repair-solution-simulation\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\repair-solution-simulation\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\repair-solution-simulation\page.tsx:18:  await requireNavRoute('workshop', '/technical-tools/repair-solution-simulation');
apps\web\app\workshop\technical-tools\repair-procedures-library\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\repair-procedures-library\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\repair-procedures-library\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\technical-tools\fault-simulation\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\fault-simulation\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\fault-simulation\page.tsx:18:  await requireNavRoute('workshop', '/technical-tools/fault-simulation');
apps\web\app\workshop\technical-tools\fault-code-search\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\fault-code-search\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\fault-code-search\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\foreign-workspace.test.ts:112:  it('requireNavRoute refuses a foreign role', () => {
packages\next-shell\src\api.ts:9: * memberships, me — and the entire front end called exactly ONE of them, `/me`,
packages\next-shell\src\api.ts:107: * who resolved, holds memberships, and none of them is `customer`.
packages\next-shell\src\api.ts:118:  if (!viewer || viewer.memberships.length === 0) return null;
packages\next-shell\src\api.ts:119:  const isCustomer = viewer.memberships.some((m) => m.roleName === 'customer');
packages\next-shell\src\active-role.ts:13: * memberships it has already proved from the validated token subject, and
packages\next-shell\src\active-role.ts:61: * memberships proved from the token subject and REFUSES one the user does not
apps\web\app\workshop\technical-tools\fault-and-repair-knowledge-base\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\fault-and-repair-knowledge-base\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\fault-and-repair-knowledge-base\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\active-organization.ts:9: * uses it only to SELECT among memberships it has already proved the user holds,
packages\next-shell\src\ActingAsControl.tsx:26: * options come only from memberships `/me` reported, and `resolveTenantContext`
packages\next-shell\src\ActingAsControl.tsx:27: * re-validates the choice against memberships proved from the validated token,
packages\next-shell\src\ActingAsControl.tsx:66:  const roles = rolesFromMemberships(viewer.memberships, viewer.organizationId);
apps\web\app\workshop\technical-tools\diagnostic-trees\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\diagnostic-trees\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\diagnostic-trees\page.tsx:18:  await requireNavRoute('workshop', '/technical-tools/diagnostic-trees');
packages\navigation\src\workspaces.ts:88:    // nav entry the screen is unreachable — `requireNavRoute` resolves a path
packages\navigation\src\workspaces.ts:151:    // `organization.admin` is the right key because among those five roles ONLY
packages\navigation\src\workspaces.ts:156:    ['register-customer', 'Register Customer', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:160:    ['register-vehicle', 'Register Vehicle', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:267:    'organization.admin',
packages\navigation\src\workspaces.ts:341:    'organization.admin',
packages\navigation\src\workspaces.ts:399:    'organization.admin',
packages\navigation\src\workspaces.ts:480:    'organization.admin',
packages\navigation\src\workspaces.ts:505:    ['settings', 'Settings', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:747:    'organization.admin',
packages\next-shell\src\viewer.test.ts:49:    memberships: [],
packages\next-shell\src\viewer.test.ts:62:  { label: 'workshop owner', viewer: viewer('workshop_owner', ['finance.read', 'organization.admin']) },
packages\next-shell\src\viewer.test.ts:65:    viewer: viewer('platform_administrator', ['platform.admin', 'organization.admin', 'finance.read']),
packages\next-shell\src\viewer.test.ts:108:    // The demo implementation returned `['organization.admin']` to everyone,
packages\next-shell\src\viewer.test.ts:118:    const owner = viewer('workshop_owner', ['finance.read', 'organization.admin']);
packages\next-shell\src\viewer.test.ts:119:    expect(grantsFor(owner)).toEqual(['finance.read', 'organization.admin']);
packages\next-shell\src\viewer.test.ts:352:      memberships: [],
packages\next-shell\src\viewer.test.ts:372:      memberships: [],
packages\next-shell\src\viewer.test.ts:375:    // does. Derived, not looked up, so a role added to `identity.memberships`
packages\next-shell\src\viewer.test.ts:399:      memberships: [
packages\next-shell\src\viewer.test.ts:431:  const memberships = [
packages\next-shell\src\viewer.test.ts:442:    expect(organizationsFromMemberships(memberships)).toEqual([
packages\next-shell\src\viewer.test.ts:452:    expect(rolesFromMemberships(memberships, 'o1')).toEqual([
packages\next-shell\src\viewer.test.ts:461:   * implementation, which deduplicated across ALL memberships.
packages\next-shell\src\viewer.test.ts:472:    expect(rolesFromMemberships(memberships, 'o2')).toEqual([
packages\next-shell\src\viewer.test.ts:479:    expect(rolesFromMemberships(memberships, 'o-not-mine')).toEqual([]);
packages\next-shell\src\viewer.test.ts:483:    // A role added to `identity.memberships` must never appear as a blank
packages\next-shell\src\viewer.test.ts:501:    const viewer = { organizationId: 'o1', memberships };
packages\next-shell\src\viewer.test.ts:511:      expect(holdsRoleInActiveOrganization({ organizationId: 'o2', memberships }, 'workshop_supervisor')).toBe(
packages\next-shell\src\viewer.test.ts:520:    it('refuses everything for a viewer with no memberships', () => {
packages\next-shell\src\viewer.test.ts:523:      expect(holdsRoleInActiveOrganization({ organizationId: 'o1', memberships: [] }, 'technician')).toBe(false);
packages\next-shell\src\viewer.test.ts:527:  it('returns nothing for a viewer with no memberships', () => {
packages\navigation\src\resolve.ts:86:  // artifact. `requireNavRoute` and `renderModulePage` apply the same base to
apps\web\app\workshop\technical-tools\component-locations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\technical-tools\component-locations\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\technical-tools\component-locations\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\viewer-contract.ts:41:  /** The ONE role active for this request — `identity.memberships.role_name`. */
packages\next-shell\src\viewer-contract.ts:45:  memberships: Array<{
packages\next-shell\src\viewer-contract.ts:55: * `identity.memberships.role_name` → the navigation's `RoleId`.
packages\next-shell\src\viewer-contract.ts:121: * navigation; `requireNavRoute` REFUSES the routes; the API's tenant guard and
packages\next-shell\src\viewer-contract.ts:146: * workshop-web and the wrong one everywhere else — yet `requireNavRoute` and
packages\next-shell\src\viewer-contract.ts:270: * computes (`finance.read`, `organization.admin`, `platform.admin`) are already
packages\next-shell\src\viewer-contract.ts:340:  const memberships = viewer.memberships;
packages\next-shell\src\viewer-contract.ts:341:  const exact = memberships.find(
packages\next-shell\src\viewer-contract.ts:344:  const byOrganization = exact ?? memberships.find((m) => m.organizationId === viewer.organizationId);
packages\next-shell\src\viewer-contract.ts:365: * The previous demo implementation returned `['organization.admin']` to anyone
packages\next-shell\src\viewer-contract.ts:387:  memberships: readonly { organizationId: string; organizationName: string }[],
packages\next-shell\src\viewer-contract.ts:391:  for (const m of memberships) {
packages\next-shell\src\viewer-contract.ts:407: * from across all memberships can offer a pair that cannot exist: pick
packages\next-shell\src\viewer-contract.ts:420: * ⚠️ A USABILITY FILTER, NEVER AN AUTHORIZATION ONE. It reads memberships `/me`
packages\next-shell\src\viewer-contract.ts:422: * re-checks against memberships proved from the validated token subject and
packages\next-shell\src\viewer-contract.ts:455:  viewer: Pick<ViewerDescription, 'organizationId' | 'memberships'>,
packages\next-shell\src\viewer-contract.ts:458:  return viewer.memberships.some(
packages\next-shell\src\viewer-contract.ts:464:  memberships: readonly { organizationId: string; roleName: string }[],
packages\next-shell\src\viewer-contract.ts:469:  for (const m of memberships) {
apps\web\app\workshop\solution-and-approval\variations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\variations\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\solution-and-approval\solution-studio\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\solution-studio\[id]\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\solution-and-approval\solution-studio\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\solution-studio\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\solution-and-approval\solution-studio\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\solution-and-approval\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/quotations');
apps\web\app\workshop\solution-and-approval\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\quotations\page.tsx:20:  await requireNavRoute('workshop', '/solution-and-approval/quotations');
apps\web\app\workshop\solution-and-approval\customer-proposals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps\web\app\workshop\solution-and-approval\customer-proposals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps\web\app\workshop\solution-and-approval\approvals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\solution-and-approval\approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\solution-and-approval\approvals\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\solution-and-approval\approvals\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\workshop-profile\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\workshop-profile\page.tsx:26:  await requireNavRoute('workshop', '/settings/workshop-profile');
apps\web\app\workshop\settings\workflow-rules\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\workflow-rules\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\workflow-rules\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\templates\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\templates\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\templates\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\staff-and-roles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\staff-and-roles\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx is
apps\web\app\workshop\settings\staff-and-roles\page.tsx:19:  await requireNavRoute('workshop', '/settings/staff-and-roles');
apps\web\app\workshop\settings\security\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\security\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\security\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\pricing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\pricing\page.tsx:12: * `owner@autoworkshop.local` holds three memberships and `resolveTenantContext`
apps\web\app\workshop\settings\pricing\page.tsx:18: * ⚠️ IT SITS IN THE `organization.admin` GROUP, which is the point rather than a
apps\web\app\workshop\settings\pricing\page.tsx:28:  await requireNavRoute('workshop', '/settings/pricing');
apps\web\app\workshop\settings\notifications\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\notifications\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\notifications\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\integrations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\integrations\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\integrations\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\branches\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\branches\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\branches\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\settings\approval-limits\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\settings\approval-limits\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\settings\approval-limits\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\vehicle-intake\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\vehicle-intake\page.tsx:16: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests-and-reception\vehicle-intake\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\service-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\service-requests\page.tsx:15:  await requireNavRoute('workshop', '/requests-and-reception/service-requests');
apps\web\app\workshop\requests-and-reception\repair-request-inbox\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\repair-request-inbox\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests-and-reception\repair-request-inbox\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\leads\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\leads\page.tsx:12:  await requireNavRoute('workshop', '/requests-and-reception/leads');
apps\web\app\workshop\requests-and-reception\customer-complaint-inbox\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\customer-complaint-inbox\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests-and-reception\customer-complaint-inbox\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests-and-reception\appointments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests-and-reception\appointments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests-and-reception\appointments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\set-role-action.ts:15: * which checks `x-role-name` against memberships proved from the validated
packages\next-shell\src\set-organization-action.ts:14: * and `resolveTenantContext` uses it ONLY to select among memberships the
packages\next-shell\src\RoleSwitcher.tsx:17: * contains only roles the API already reported as the viewer's own memberships,
packages\next-shell\src\RoleSwitcher.tsx:18: * and `resolveTenantContext` re-validates the choice against those memberships
packages\next-shell\src\RoleSwitcher.tsx:32:  /** The `role_name` as stored in `identity.memberships`. */
packages\next-shell\src\role-label.ts:20: * option, and a role added to `identity.memberships` must never appear in the
packages\next-shell\src\require-route.ts:57:export async function requireNavRoute(
apps\web\app\workshop\requests\walk-in-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests\walk-in-requests\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests\walk-in-requests\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
packages\next-shell\src\quick-create.ts:25: * the same three functions in the same order as `requireNavRoute`. The button
packages\next-shell\src\quick-create.ts:33: * `permission: 'organization.admin'`. A viewer on that tree WITHOUT the grant
packages\next-shell\src\quick-create.ts:38: * the target page calls `requireNavRoute` itself, and the API re-derives every
packages\next-shell\src\quick-create.ts:53:  // Memoised per request by React's `cache()`, exactly as `requireNavRoute`
packages\next-shell\src\OrganizationSwitcher.tsx:22: * API already reported as the viewer's own memberships, and the API re-validates
packages\next-shell\src\OrganizationSwitcher.tsx:23: * the choice against those memberships anyway — a request naming an organization
apps\web\app\workshop\requests\service-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests\service-requests\page.tsx:15:  await requireNavRoute('workshop', '/requests/service-requests');
apps\web\app\workshop\requests\repair-request-inbox\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests\repair-request-inbox\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests\repair-request-inbox\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests\customer-complaint-inbox\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests\customer-complaint-inbox\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests\customer-complaint-inbox\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\requests\appointments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\requests\appointments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\requests\appointments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\workshop-utilization\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\workshop-utilization\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\workshop-utilization\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\workshop-performance\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\workshop-performance\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\workshop-performance\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\warranty\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\warranty\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\warranty\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\technicians\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\technicians\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\technicians\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\technician-workload\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\technician-workload\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\technician-workload\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\technician-productivity\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\technician-productivity\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\technician-productivity\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\service-bay-utilization\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\service-bay-utilization\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\service-bay-utilization\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\operations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\operations\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\operations\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\job-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\job-progress\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\job-progress\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\inventory\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\inventory\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\inventory\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\financial\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\financial\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\financial\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\finance\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\finance\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\finance\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\delayed-jobs\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\delayed-jobs\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\delayed-jobs\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\reports\customer-service\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\reports\customer-service\page.tsx:13: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\reports\customer-service\page.tsx:22:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\repair-services\testing\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\testing\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/testing');
apps\web\app\workshop\repair-services\testing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\testing\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/testing');
apps\web\app\workshop\repair-services\repairs-in-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\repairs-in-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/repairs-in-progress');
apps\web\app\workshop\repair-services\repairs-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\repairs-in-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-services/repairs-in-progress');
apps\web\app\workshop\repair-services\repair-plans\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\repair-plans\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-services/repair-plans');
apps\web\app\workshop\repair-services\repair-plans\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\repair-plans\page.tsx:20:  await requireNavRoute('workshop', '/repair-services/repair-plans');
apps\web\app\workshop\repair-services\quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\quality-control\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\repair-services\inspection\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\inspection\[id]\page.tsx:22:  await requireNavRoute('workshop', '/repair-services/inspection');
apps\web\app\workshop\repair-services\inspection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\inspection\page.tsx:25:  await requireNavRoute('workshop', '/repair-services/inspection');
apps\web\app\workshop\repair-services\diagnosis\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\diagnosis\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-services/diagnosis');
apps\web\app\workshop\repair-services\diagnosis\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-services\diagnosis\page.tsx:20:  await requireNavRoute('workshop', '/repair-services/diagnosis');
apps\web\app\workshop\repair-control\variations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\variations\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\repair-control\testing-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\testing-queue\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing-queue');
apps\web\app\workshop\repair-control\testing-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\testing-queue\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing-queue');
apps\web\app\workshop\repair-control\testing\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\testing\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing');
apps\web\app\workshop\repair-control\testing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\testing\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing');
apps\web\app\workshop\repair-control\repairs-in-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repairs-in-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/repairs-in-progress');
apps\web\app\workshop\repair-control\repairs-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repairs-in-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/repairs-in-progress');
apps\web\app\workshop\repair-control\repair-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repair-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/repair-progress');
apps\web\app\workshop\repair-control\repair-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repair-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/repair-progress');
apps\web\app\workshop\repair-control\repair-plans\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repair-plans\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/repair-plans');
apps\web\app\workshop\repair-control\repair-plans\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\repair-plans\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/repair-plans');
apps\web\app\workshop\repair-control\ready-for-collection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\ready-for-collection\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/ready-for-collection');
apps\web\app\workshop\repair-control\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/quotations');
apps\web\app\workshop\repair-control\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\quotations\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/quotations');
apps\web\app\workshop\repair-control\quality-control-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\quality-control-queue\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
packages\navigation\src\resolve.test.ts:47:    const groups = visibleGroups(workshop, ['organization.admin']);
packages\navigation\src\resolve.test.ts:345:    const withFinance = hrefs(['finance.read', 'organization.admin']);
packages\navigation\src\resolve.test.ts:346:    const withoutFinance = hrefs(['organization.admin']);
packages\navigation\src\pack-base.ts:21: * side gains the prefix and the other does not, `requireNavRoute` finds no
packages\navigation\src\pack-base.ts:69:  // serves and no href advertises, so `requireNavRoute` 404s with nothing in any
apps\web\app\workshop\repair-control\quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\quality-control\page.tsx:16:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\repair-control\internal-review\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\internal-review\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/internal-review');
apps\web\app\workshop\repair-control\inspection-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\inspection-queue\[id]\page.tsx:13:  await requireNavRoute('workshop', '/repair-control/inspection-queue');
apps\web\app\workshop\repair-control\inspection-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\inspection-queue\page.tsx:15:  await requireNavRoute('workshop', '/repair-control/inspection-queue');
apps\web\app\workshop\repair-control\inspection\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\inspection\[id]\page.tsx:15:  await requireNavRoute('workshop', '/repair-control/inspection');
apps\web\app\workshop\repair-control\inspection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\inspection\page.tsx:17:  await requireNavRoute('workshop', '/repair-control/inspection');
apps\web\app\workshop\repair-control\diagnosis-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\diagnosis-queue\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
apps\web\app\workshop\repair-control\diagnosis-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\diagnosis-queue\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
apps\web\app\workshop\repair-control\diagnosis\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\diagnosis\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/diagnosis');
apps\web\app\workshop\repair-control\diagnosis\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\diagnosis\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/diagnosis');
apps\web\app\workshop\repair-control\customer-approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\customer-approvals\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/customer-approvals');
apps\web\app\workshop\repair-control\customer-approval\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\customer-approval\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps\web\app\workshop\repair-control\customer-approval\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\repair-control\customer-approval\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps\web\app\workshop\record-work\variation-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\variation-requests\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\record-work\time-records\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\time-records\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/time-records');
apps\web\app\workshop\record-work\time-records\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\time-records\page.tsx:19:  await requireNavRoute('workshop', '/record-work/time-records');
apps\web\app\workshop\record-work\repair-tasks\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\repair-tasks\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/repair-tasks');
apps\web\app\workshop\record-work\repair-tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\repair-tasks\page.tsx:19:  await requireNavRoute('workshop', '/record-work/repair-tasks');
apps\web\app\workshop\record-work\repair-evidence\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\repair-evidence\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/repair-evidence');
apps\web\app\workshop\record-work\repair-evidence\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\repair-evidence\page.tsx:19:  await requireNavRoute('workshop', '/record-work/repair-evidence');
apps\web\app\workshop\record-work\parts-used\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\parts-used\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/parts-used');
apps\web\app\workshop\record-work\parts-used\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\parts-used\page.tsx:19:  await requireNavRoute('workshop', '/record-work/parts-used');
apps\web\app\workshop\record-work\inspection-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\inspection-results\[id]\page.tsx:15:  await requireNavRoute('workshop', '/record-work/inspection-results');
apps\web\app\workshop\record-work\inspection-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\inspection-results\page.tsx:22:  await requireNavRoute('workshop', '/record-work/inspection-results');
apps\web\app\workshop\record-work\diagnostic-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\diagnostic-results\[id]\page.tsx:21:  await requireNavRoute('workshop', '/record-work/diagnostic-results');
apps\web\app\workshop\record-work\diagnostic-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\record-work\diagnostic-results\page.tsx:20:  await requireNavRoute('workshop', '/record-work/diagnostic-results');
apps\web\app\workshop\plan-work\tool-reservation\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\tool-reservation\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\plan-work\tool-reservation\page.tsx:19:  await requireNavRoute('workshop', '/plan-work/tool-reservation');
apps\web\app\workshop\plan-work\request-specialist\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\request-specialist\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\plan-work\request-specialist\page.tsx:19:  await requireNavRoute('workshop', '/plan-work/request-specialist');
apps\web\app\workshop\plan-work\repair-planning\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\repair-planning\[id]\page.tsx:21:  await requireNavRoute('workshop', '/plan-work/repair-planning');
apps\web\app\workshop\plan-work\repair-planning\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\repair-planning\page.tsx:20:  await requireNavRoute('workshop', '/plan-work/repair-planning');
apps\web\app\workshop\plan-work\parts-compatibility\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\parts-compatibility\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\plan-work\parts-compatibility\page.tsx:19:  await requireNavRoute('workshop', '/plan-work/parts-compatibility');
apps\web\app\workshop\plan-work\find-parts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\find-parts\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\plan-work\find-parts\page.tsx:19:  await requireNavRoute('workshop', '/plan-work/find-parts');
apps\web\app\workshop\plan-work\equipment-reservation\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\plan-work\equipment-reservation\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\plan-work\equipment-reservation\page.tsx:19:  await requireNavRoute('workshop', '/plan-work/equipment-reservation');
apps\web\app\workshop\parts-and-supply\suppliers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\suppliers\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\suppliers\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\reservations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\reservations\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\reservations\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\procurement\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\procurement\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\procurement\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\parts-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\parts-requests\page.tsx:9:  await requireNavRoute('workshop', '/parts-and-supply/parts-requests');
apps\web\app\workshop\parts-and-supply\parts-depot\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\parts-depot\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\parts-depot\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\marketplace\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\marketplace\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\marketplace\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\goods-receipt\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\goods-receipt\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-supply\goods-receipt\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-supply\discovery\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-supply\discovery\page.tsx:11: * `requireNavRoute` would have called `notFound()` for every viewer while the
apps\web\app\workshop\parts-and-supply\discovery\page.tsx:15: * ⚠️ `requireNavRoute` FIRST. This page runs an agent against a URL a person
apps\web\app\workshop\parts-and-supply\discovery\page.tsx:21:  await requireNavRoute('workshop', '/parts-and-supply/discovery');
apps\web\app\workshop\parts-and-suppliers\suppliers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\suppliers\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-suppliers\suppliers\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-suppliers\procurement\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\procurement\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-suppliers\procurement\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-suppliers\parts-reservations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\parts-reservations\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-suppliers\parts-reservations\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-suppliers\marketplace\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\marketplace\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-suppliers\marketplace\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-suppliers\inventory\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\inventory\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts-and-suppliers\inventory\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts-and-suppliers\discovery\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts-and-suppliers\discovery\page.tsx:12:  await requireNavRoute('workshop', '/parts-and-suppliers/discovery');
apps\web\app\workshop\parts\supplier-inquiries\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts\supplier-inquiries\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts\supplier-inquiries\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts\reservations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts\reservations\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts\reservations\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts\purchase-requisitions\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts\purchase-requisitions\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts\purchase-requisitions\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts\parts-status\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts\parts-status\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\parts\parts-status\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\parts\discovery\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\parts\discovery\page.tsx:11:  await requireNavRoute('workshop', '/parts/discovery');
apps\web\app\workshop\not-found.tsx:11: * `requireNavRoute` answers `notFound()` for a route that is not in THIS VIEWER'S
apps\web\app\workshop\my-jobs\testing-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\testing-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/testing-required');
apps\web\app\workshop\my-jobs\repair-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\repair-in-progress\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/repair-in-progress');
apps\web\app\workshop\my-jobs\repair-approved\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\repair-approved\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/repair-approved');
apps\web\app\workshop\my-jobs\quality-control-returns\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\quality-control-returns\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/quality-control-returns');
apps\web\app\workshop\my-jobs\inspection-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\inspection-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/inspection-required');
apps\web\app\workshop\my-jobs\diagnosis-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\diagnosis-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/diagnosis-required');
apps\web\app\workshop\my-jobs\awaiting-parts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\my-jobs\awaiting-parts\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/awaiting-parts');
apps\web\app\workshop\learning\training-courses\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\learning\training-courses\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\learning\training-courses\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\learning\technical-videos\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\learning\technical-videos\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\learning\technical-videos\page.tsx:18:  await requireNavRoute('workshop', '/learning/technical-videos');
apps\web\app\workshop\learning\certifications\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\learning\certifications\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\learning\certifications\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\learning\audio-guides\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\learning\audio-guides\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\learning\audio-guides\page.tsx:18:  await requireNavRoute('workshop', '/learning/audio-guides');
apps\web\app\workshop\learning\assessments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\learning\assessments\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\learning\assessments\page.tsx:18:  await requireNavRoute('workshop', '/learning/assessments');
apps\web\app\workshop\layout.tsx:118:      // grant filtering removed nothing. `requireNavRoute` refuses the
apps\web\app\workshop\layout.tsx:188:      // control. It lists only the viewer's own memberships and the API
apps\web\app\workshop\knowledge-and-staff\wiring-diagrams\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\wiring-diagrams\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\wiring-diagrams\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\knowledge-and-staff\training\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\training\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\training\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\knowledge-and-staff\technician-competencies\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\technician-competencies\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\technician-competencies\page.tsx:21:  await requireNavRoute('workshop', '/knowledge-and-staff/technician-competencies');
apps\web\app\workshop\knowledge-and-staff\repair-procedures-library\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\repair-procedures-library\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\repair-procedures-library\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\knowledge-and-staff\repair-knowledge\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\repair-knowledge\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\repair-knowledge\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\knowledge-and-staff\fault-and-repair-knowledge-base\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\fault-and-repair-knowledge-base\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\fault-and-repair-knowledge-base\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\knowledge-and-staff\competencies\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\competencies\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\competencies\page.tsx:21:  await requireNavRoute('workshop', '/knowledge-and-staff/competencies');
apps\web\app\workshop\knowledge-and-staff\certifications\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\knowledge-and-staff\certifications\page.tsx:9: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\knowledge-and-staff\certifications\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\workshop-calendar\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\workshop-calendar\page.tsx:12: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\home\workshop-calendar\page.tsx:21:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\tasks-and-approvals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\tasks-and-approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\tasks-and-approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\tasks-and-approvals\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\home\tasks-and-approvals\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\tasks\page.tsx:14:  await requireNavRoute('workshop', '/home/tasks');
apps\web\app\workshop\home\notifications\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\notifications\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\home\notifications\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\notification-inbox\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\notification-inbox\page.tsx:11: * `requireNavRoute` FIRST (T-0005 finding 4).
apps\web\app\workshop\home\notification-inbox\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\my-tasks\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\my-tasks\[id]\page.tsx:24:  await requireNavRoute('workshop', '/home/my-tasks');
apps\web\app\workshop\home\my-tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\my-tasks\page.tsx:14:  await requireNavRoute('workshop', '/home/my-tasks');
apps\web\app\workshop\home\my-assigned-work\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\my-assigned-work\[id]\page.tsx:26:  await requireNavRoute('workshop', '/home/my-assigned-work');
apps\web\app\workshop\home\my-assigned-work\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\my-assigned-work\page.tsx:15:  await requireNavRoute('workshop', '/home/my-assigned-work');
apps\web\app\workshop\home\dashboard\page.tsx:5:import { currentViewer, grantsFor, navRoleFor, requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\dashboard\page.tsx:235:  await requireNavRoute('workshop', '/home/dashboard');
apps\web\app\workshop\home\dashboard\page.tsx:237:  // ⚠️ AFTER `requireNavRoute`, DELIBERATELY. The nav gate is documented as the
apps\web\app\workshop\home\calendar\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\calendar\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\home\calendar\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\approvals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\home\approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\home\approvals\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\home\approvals\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance-and-warranty\warranty-records\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance-and-warranty\warranty-records\page.tsx:12: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance-and-warranty\warranty-records\page.tsx:21:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance-and-warranty\warranty-claims\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance-and-warranty\warranty-claims\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance-and-warranty\warranty-claims\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance-and-warranty\payments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance-and-warranty\payments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance-and-warranty\payments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance-and-warranty\invoices\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance-and-warranty\invoices\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance-and-warranty\invoices\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
packages\navigation\src\landing-path.test.ts:40:      const landing = landingPathFor(id, ALL, ['platform.admin', 'finance.read', 'organization.admin']);
apps\web\app\workshop\finance\workshop-revenue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance\workshop-revenue\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance\workshop-revenue\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance\refunds\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance\refunds\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance\refunds\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance\payments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance\payments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance\payments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance\outstanding-balances\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance\outstanding-balances\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance\outstanding-balances\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\finance\invoices\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\finance\invoices\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\finance\invoices\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customers-and-vehicles\vehicles\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps\web\app\workshop\customers-and-vehicles\vehicles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps\web\app\workshop\customers-and-vehicles\repair-history\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\repair-history\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customers-and-vehicles\repair-history\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customers-and-vehicles\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customers-and-vehicles\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customers-and-vehicles\customers\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps\web\app\workshop\customers-and-vehicles\customers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\customers\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps\web\app\workshop\customers-and-vehicles\customer-feedback\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers-and-vehicles\customer-feedback\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customers-and-vehicles\customer-feedback\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customers\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers\register-customer\page.tsx:20:  await requireNavRoute('workshop', '/customers/register-customer');
apps\web\app\workshop\customers\customer-search\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers\customer-search\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers/customer-search');
apps\web\app\workshop\customers\customer-search\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers\customer-search\page.tsx:18:  await requireNavRoute('workshop', '/customers/customer-search');
apps\web\app\workshop\customers\customer-messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customers\customer-messages\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customers\customer-messages\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-reception\vehicles\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps\web\app\workshop\customer-reception\vehicles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps\web\app\workshop\customer-reception\vehicle-intake\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\vehicle-intake\page.tsx:16: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customer-reception\vehicle-intake\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-reception\service-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\service-requests\page.tsx:8: * `requireNavRoute` FIRST, before any data access: a layout gate does not stop
apps\web\app\workshop\customer-reception\service-requests\page.tsx:12:  await requireNavRoute('workshop', '/customer-reception/service-requests');
apps\web\app\workshop\customer-reception\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-reception\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-reception\new-complaints\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\new-complaints\page.tsx:15: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customer-reception\new-complaints\page.tsx:24:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-reception\leads\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\leads\page.tsx:11: * strings below came with it: `requireNavRoute('workshop', '/sales/leads')`
apps\web\app\workshop\customer-reception\leads\page.tsx:23: * ⚠️ `requireNavRoute` FIRST, BEFORE ANY DATA ACCESS. A concrete page resolves
apps\web\app\workshop\customer-reception\leads\page.tsx:29:  await requireNavRoute('workshop', '/customer-reception/leads');
apps\web\app\workshop\customer-reception\customers\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/customers');
apps\web\app\workshop\customer-reception\customers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\customers\page.tsx:26:  await requireNavRoute('workshop', '/customer-reception/customers');
apps\web\app\workshop\customer-reception\appointments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-reception\appointments\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customer-reception\appointments\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\customer-approval\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-approval\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps\web\app\workshop\customer-approval\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-approval\quotations\page.tsx:20:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps\web\app\workshop\customer-approval\pending-approvals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-approval\pending-approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
apps\web\app\workshop\customer-approval\pending-approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-approval\pending-approvals\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
apps\web\app\workshop\customer-approval\modification-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\customer-approval\modification-requests\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\customer-approval\modification-requests\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\voice-calls\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\voice-calls\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\voice-calls\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\video-consultations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\video-consultations\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\video-consultations\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\technician-messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\technician-messages\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\technician-messages\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\supplier-messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\supplier-messages\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\supplier-messages\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\specialist-support\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\specialist-support\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\specialist-support\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\specialist-consultations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\specialist-consultations\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\specialist-consultations\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\messages\[threadId]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\messages\[threadId]\page.tsx:19:  await requireNavRoute('workshop', '/communication/messages');
apps\web\app\workshop\communication\messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\messages\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\messages\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\customer-messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\customer-messages\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\customer-messages\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\communication\calls\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\communication\calls\page.tsx:14: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\communication\calls\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\collection-and-payment\vehicle-release\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\collection-and-payment\vehicle-release\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\collection-and-payment\vehicle-release\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\collection-and-payment\receive-payment\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\collection-and-payment\receive-payment\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\collection-and-payment\receive-payment\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\collection-and-payment\receipts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\collection-and-payment\receipts\page.tsx:10: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\collection-and-payment\receipts\page.tsx:19:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\collection-and-payment\ready-for-collection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\collection-and-payment\ready-for-collection\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\collection-and-payment\ready-for-collection\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\collection-and-payment\invoices\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\workshop\collection-and-payment\invoices\page.tsx:11: * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
apps\web\app\workshop\collection-and-payment\invoices\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps\web\app\workshop\basket\page.tsx:22: * marketplace — so `requireNavRoute` here would 404 exactly the person the
apps\web\app\towing\_screens\staff-section.tsx:3:import { addTowingMemberAction, withdrawTowingMemberAction } from './staff-actions';
apps\web\app\towing\_screens\staff-section.tsx:12: * already gated on `organization.admin` — the permission `towing_owner` gained
apps\web\app\towing\_screens\staff-section.tsx:16: * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.towing_company` in
apps\web\app\towing\_screens\settings-screen.tsx:31: * ⚠️ GATED ON `organization.admin` IN THE NAVIGATION (§52). The nav hides it,
apps\web\app\towing\_screens\settings-screen.tsx:32: * `requireNavRoute` refuses the route, and the API's own `assertTowingStaff`
apps\web\app\towing\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps\web\app\supplier\_screens\create-supplier-actions.ts:17: * navigation tree — and the only two writers of `identity.memberships` were
apps\web\app\towing\operations\settings\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\settings\page.tsx:8: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\settings\page.tsx:14:  await requireNavRoute('towing', '/operations/settings');
apps\web\app\towing\operations\settings\page.tsx:26:        `organization.admin` gate that `towing_owner` newly satisfies.
apps\web\app\towing\operations\recovery-vehicles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\recovery-vehicles\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\recovery-vehicles\page.tsx:13:  await requireNavRoute('towing', '/operations/recovery-vehicles');
apps\web\app\supplier\products\product-catalogue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\supplier\products\product-catalogue\page.tsx:22: * NOT the control. `requireNavRoute` decides whether this ROUTE is offered to
apps\web\app\supplier\products\product-catalogue\page.tsx:30:  await requireNavRoute('supplier', '/products/product-catalogue');
apps\web\app\towing\operations\new-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\new-requests\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\new-requests\page.tsx:13:  await requireNavRoute('towing', '/operations/new-requests');
apps\web\app\towing\operations\invoices\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\invoices\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\invoices\page.tsx:13:  await requireNavRoute('towing', '/operations/invoices');
apps\web\app\supplier\orders-and-delivery\parts-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\supplier\orders-and-delivery\parts-requests\page.tsx:8: * `requireNavRoute` FIRST, before any data access: a layout gate does not stop
apps\web\app\supplier\orders-and-delivery\parts-requests\page.tsx:12:  await requireNavRoute('supplier', '/orders-and-delivery/parts-requests');
apps\web\app\towing\operations\incidents\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\incidents\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\incidents\page.tsx:13:  await requireNavRoute('towing', '/operations/incidents');
apps\web\app\supplier\orders-and-delivery\new-orders\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\supplier\orders-and-delivery\new-orders\page.tsx:31:  await requireNavRoute('supplier', '/orders-and-delivery/new-orders');
apps\web\app\supplier\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps\web\app\towing\operations\drivers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\drivers\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\drivers\page.tsx:13:  await requireNavRoute('towing', '/operations/drivers');
apps\web\app\towing\operations\dispatch-board\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\dispatch-board\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\dispatch-board\page.tsx:13:  await requireNavRoute('towing', '/operations/dispatch-board');
apps\web\app\onboarding\account-types.ts:30: * Measured, not assumed — every `INSERT INTO identity.memberships` across all
apps\web\app\onboarding\account-types.spec.ts:146:    // `INSERT INTO identity.memberships` in ANY migration, into one flat set.
apps\web\app\onboarding\account-types.spec.ts:177:        const ins = body.indexOf('INSERT INTO identity.memberships');
apps\web\app\onboarding\account-types.spec.ts:197:    // TIDY-UP. The old reader scanned every `INSERT INTO identity.memberships`
apps\web\app\towing\operations\dashboard\page.tsx:1:import { needsWorkshop, registrationStatus, requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\dashboard\page.tsx:17: * ⚠️ THE REGISTRATION CHECK IS BEFORE `requireNavRoute`, DELIBERATELY, AND IT IS
apps\web\app\towing\operations\dashboard\page.tsx:20: * `requireNavRoute` resolves the viewer's role tree and 404s a route that tree
apps\web\app\towing\operations\dashboard\page.tsx:42:   * `requireNavRoute` FIRST for everybody else, before any data access. A layout
apps\web\app\towing\operations\dashboard\page.tsx:47:  await requireNavRoute('towing', '/operations/dashboard');
apps\web\app\towing\operations\completed-recoveries\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\completed-recoveries\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\completed-recoveries\page.tsx:13:  await requireNavRoute('towing', '/operations/completed-recoveries');
apps\web\app\towing\operations\active-recoveries\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\towing\operations\active-recoveries\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\towing\operations\active-recoveries\page.tsx:13:  await requireNavRoute('towing', '/operations/active-recoveries');
apps\web\app\insurance\_screens\staff-screen.tsx:3:import { addInsuranceMemberAction, withdrawInsuranceMemberAction } from './staff-actions';
apps\web\app\insurance\_screens\staff-screen.tsx:9: * `settings` group is gated on `organization.admin`, a permission NO insurance
apps\web\app\insurance\_screens\staff-screen.tsx:15: * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.insurance_company` in
apps\web\app\insurance\settings\users\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\insurance\settings\users\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\insurance\settings\users\page.tsx:12: * The `settings` group is declared with `organization.admin`, which since
apps\web\app\insurance\settings\users\page.tsx:19:  await requireNavRoute('insurance', '/settings/users');
apps\web\app\insurance\sales\register-product\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\insurance\sales\register-product\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\insurance\sales\register-product\page.tsx:13:  await requireNavRoute('insurance', '/sales/register-product');
apps\web\app\insurance\sales\policies-sold\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\insurance\sales\policies-sold\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\insurance\sales\policies-sold\page.tsx:13:  await requireNavRoute('insurance', '/sales/policies-sold');
apps\web\app\insurance\sales\platform-levies\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\insurance\sales\platform-levies\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\insurance\sales\platform-levies\page.tsx:13:  await requireNavRoute('insurance', '/sales/platform-levies');
apps\web\app\insurance\sales\my-products\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\insurance\sales\my-products\page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps\web\app\insurance\sales\my-products\page.tsx:13:  await requireNavRoute('insurance', '/sales/my-products');
apps\web\app\insurance\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps\web\app\insurance\home\dashboard\page.tsx:16: * viewer's memberships, regardless of workspace or organisation type. So it asks
apps\e2e\tests\shell-journey.spec.ts:239:      // `"grants":["organization.admin"]`: the viewer's own grants, which the
apps\web\app\fleet\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps\web\app\fleet\home\dashboard\page.tsx:17: * the viewer's memberships, regardless of workspace or organisation type. So it
apps\e2e\tests\live-signed-in.spec.ts:52: * group). `requireNavRoute` calls `notFound()` for a route the viewer's tree
apps\e2e\tests\live-signed-in.spec.ts:101: * (Codex, this diff). `requireNavRoute` derives the role from the LIVE viewer,
apps\web\app\customer\_screens\request-service-actions.ts:42:  // Measured 2026-08-08: `identity.memberships` has only two writers in the
apps\web\app\customer\_screens\request-service-actions.spec.ts:10: * Measured 2026-08-08. `identity.memberships` has only two writers in the whole
apps\web\app\customer\_screens\garage-screen.tsx:62:  // the button and the target page's `requireNavRoute` gate cannot disagree: no
apps\web\app\customer\_screens\repair-journey-screen.tsx:175:    // visitor: `requireNavRoute` does not refuse them (see the page comment),
apps\web\app\customer\_screens\profile-screen.tsx:29:  memberships: Array<{
apps\web\app\customer\(app)\vehicle-lookup\page.tsx:25: * ⚠️ NO `requireNavRoute` GATE. This route is deliberately outside the §33
apps\web\app\customer\_screens\my-security-screen.tsx:40:  memberships: Membership[];
apps\web\app\customer\_screens\my-security-screen.tsx:77:              v.memberships.length === 0
apps\web\app\customer\_screens\my-security-screen.tsx:79:                : v.memberships.map((m) => m.organizationName).join(', '),
apps\web\app\customer\(app)\support\towing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\support\towing\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\support\towing\page.tsx:19:  await requireNavRoute('customer', '/support/towing');
apps\web\app\customer\(app)\support\support-cases\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\support\support-cases\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\support\support-cases\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\support\knowledge\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\support\knowledge\page.tsx:18:  await requireNavRoute('customer', '/support/knowledge');
apps\web\app\customer\(app)\support\help-center\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\support\help-center\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\support\help-center\page.tsx:19:  await requireNavRoute('customer', '/support/help-center');
apps\web\app\customer\(app)\settings\security\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\settings\security\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\settings\security\page.tsx:19:  await requireNavRoute('customer', '/settings/security');
apps\web\app\customer\(app)\settings\profile\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\settings\profile\page.tsx:15:  await requireNavRoute('customer', '/settings/profile');
apps\web\app\customer\(app)\settings\communication-preferences\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\settings\communication-preferences\page.tsx:7: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\settings\communication-preferences\page.tsx:15:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\settings\authorized-drivers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\settings\authorized-drivers\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\settings\authorized-drivers\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\service-and-repairs\service-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\service-requests\page.tsx:8: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\service-and-repairs\service-requests\page.tsx:21:  await requireNavRoute('customer', '/service-and-repairs/service-requests');
apps\web\app\customer\(app)\service-and-repairs\request-service\page.tsx:10: * ⚠️ NO `requireNavRoute`. This route is reached from a MECHANIC CARD in the
apps\web\app\customer\(app)\service-and-repairs\report-a-problem\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\report-a-problem\page.tsx:18:  await requireNavRoute('customer', '/service-and-repairs/report-a-problem');
apps\web\app\customer\(app)\service-and-repairs\repair-tracking\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\repair-tracking\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\service-and-repairs\repair-tracking\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
apps\web\app\customer\(app)\service-and-repairs\repair-proposals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\repair-proposals\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps\web\app\customer\(app)\service-and-repairs\inspection-report\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\inspection-report\page.tsx:12:  await requireNavRoute('customer', '/service-and-repairs/inspection-report');
apps\web\app\customer\(app)\service-and-repairs\completed-repairs\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\completed-repairs\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\service-and-repairs\completed-repairs\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
apps\web\app\customer\(app)\service-and-repairs\appointments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\service-and-repairs\appointments\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\service-and-repairs\appointments\page.tsx:19:  await requireNavRoute('customer', '/service-and-repairs/appointments');
apps\web\app\customer\(app)\payments\receipts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\payments\receipts\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\payments\receipts\page.tsx:21:  await requireNavRoute('customer', '/payments/receipts');
apps\web\app\customer\(app)\payments\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\payments\quotations\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\payments\quotations\page.tsx:21:  await requireNavRoute('customer', '/payments/quotations');
apps\web\app\customer\(app)\payments\payments\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\payments\payments\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\payments\payments\page.tsx:21:  await requireNavRoute('customer', '/payments/payments');
apps\web\app\customer\(app)\payments\invoices\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\payments\invoices\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\payments\invoices\page.tsx:21:  await requireNavRoute('customer', '/payments/invoices');
apps\web\app\customer\(app)\parts-and-warranty\warranty-claims\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\parts-and-warranty\warranty-claims\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\parts-and-warranty\warranty-claims\page.tsx:21:  await requireNavRoute('customer', '/parts-and-warranty/warranty-claims');
apps\web\app\customer\(app)\parts-and-warranty\warranty\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\parts-and-warranty\warranty\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps\web\app\customer\(app)\parts-and-warranty\warranty\page.tsx:21:  await requireNavRoute('customer', '/parts-and-warranty/warranty');
apps\web\app\customer\(app)\parts-and-warranty\product-recommendations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\parts-and-warranty\product-recommendations\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\parts-and-warranty\product-recommendations\page.tsx:19:  await requireNavRoute('customer', '/parts-and-warranty/product-recommendations');
apps\web\app\customer\(app)\parts-and-warranty\parts-orders\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\parts-and-warranty\parts-orders\page.tsx:11: * own orders, and `requireNavRoute` refuses a path the viewer's tree does not
apps\web\app\customer\(app)\parts-and-warranty\parts-orders\page.tsx:17: * page. `requireNavRoute` resolves the path against the viewer's VISIBLE
apps\web\app\customer\(app)\parts-and-warranty\parts-orders\page.tsx:33:  await requireNavRoute('customer', '/parts-and-warranty/parts-orders');
apps\web\app\customer\(app)\parts-and-warranty\installed-parts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\parts-and-warranty\installed-parts\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\parts-and-warranty\installed-parts\page.tsx:19:  await requireNavRoute('customer', '/parts-and-warranty/installed-parts');
apps\web\app\customer\(app)\my-vehicles\service-history\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\my-vehicles\service-history\page.tsx:7: * ⚠️ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
apps\web\app\customer\(app)\my-vehicles\service-history\page.tsx:15:  await requireNavRoute('customer', '/my-vehicles/service-history');
apps\web\app\customer\(app)\my-vehicles\maintenance-schedule\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\my-vehicles\maintenance-schedule\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\my-vehicles\maintenance-schedule\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\my-vehicles\garage\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\my-vehicles\garage\page.tsx:9: * `requireNavRoute` resolves the path against the viewer's VISIBLE NAVIGATION.
apps\web\app\customer\(app)\my-vehicles\garage\page.tsx:32:  await requireNavRoute('customer', '/my-vehicles/garage');
apps\web\app\customer\(app)\my-vehicles\documents\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\my-vehicles\documents\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\my-vehicles\documents\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\my-vehicles\add-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\my-vehicles\add-vehicle\page.tsx:9: * this item, so `requireNavRoute` does not refuse them. See the garage page for
apps\web\app\customer\(app)\my-vehicles\add-vehicle\page.tsx:18:  await requireNavRoute('customer', '/my-vehicles/add-vehicle');
apps\web\app\customer\(app)\layout.tsx:65:   * refusal is narrow: a viewer who resolved, holds memberships, and none of
apps\web\app\customer\(app)\layout.tsx:74:  const holdsCustomerRole = viewer?.memberships.some((m) => m.roleName === 'customer') ?? false;
apps\web\app\customer\(app)\layout.tsx:75:  const wrongWorkspace = Boolean(viewer) && viewer!.memberships.length > 0 && !holdsCustomerRole;
apps\web\app\customer\(app)\layout.tsx:113:          // control. It lists only the viewer's own memberships and the API
apps\web\app\customer\(app)\home\notifications\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\home\notifications\page.tsx:7: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\home\notifications\page.tsx:15:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\home\my-tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\home\my-tasks\page.tsx:10: * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION
apps\web\app\customer\(app)\home\my-tasks\page.tsx:19:  await requireNavRoute('customer', '/home/my-tasks');
apps\web\app\customer\(app)\home\dashboard\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\home\dashboard\page.tsx:20:  await requireNavRoute('customer', '/home/dashboard');
apps\web\app\customer\(app)\communication\voice-calls\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\communication\voice-calls\page.tsx:11: * `requireNavRoute` FIRST (T-0005 finding 4).
apps\web\app\customer\(app)\communication\voice-calls\page.tsx:18:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\communication\video-consultations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\communication\video-consultations\page.tsx:11: * `requireNavRoute` FIRST (T-0005 finding 4).
apps\web\app\customer\(app)\communication\video-consultations\page.tsx:18:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\communication\shared-files\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\communication\shared-files\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\communication\shared-files\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\customer\(app)\communication\messages\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\customer\(app)\communication\messages\page.tsx:9: * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
apps\web\app\customer\(app)\communication\messages\page.tsx:17:  await requireNavRoute('customer', ROUTE);
apps\web\app\admin\layout.tsx:72:      // control. It lists only the viewer's own memberships and the API
apps\web\app\admin\directory\registrations\page.tsx:2:import { ApiFailure, apiGet, requireNavRoute } from '@autoworkshop/next-shell';
apps\web\app\admin\directory\registrations\page.tsx:17: * ⚠️ `requireNavRoute` FIRST, BEFORE ANY DATA ACCESS. A concrete page resolves
apps\web\app\admin\directory\registrations\page.tsx:58:  await requireNavRoute('admin', '/directory/registrations');
apps\api\src\knowledge\knowledge.service.ts:421:        `SELECT 1 FROM identity.memberships
apps\api\src\identity\user.service.ts:24: * explicitly: one human may hold memberships in several tenants, so the user
apps\api\src\identity\user.service.ts:34: * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
apps\api\src\identity\user.service.ts:68:           FROM identity.memberships m
apps\api\src\identity\user.service.ts:83:   * Driving from `memberships` rather than from `users` is what makes this
apps\api\src\identity\user.service.ts:102:           FROM identity.memberships m
apps\api\src\identity\registration.controller.ts:118:    private readonly memberships: MembershipRepository,
apps\api\src\identity\registration.controller.ts:137:    const record = await this.memberships.findByKeycloakSubject(subject);
apps\api\src\identity\registration.controller.ts:138:    const active = (record?.memberships ?? []).filter((m) => m.status === 'active');
apps\api\src\identity\registration.controller.ts:190:      const created = await this.memberships.registerWorkshop(
apps\api\src\identity\registration.controller.ts:259:      const created = await this.memberships.registerSupplier(
apps\api\src\identity\registration.controller.ts:337:      const created = await this.memberships.registerFleet(
apps\api\src\identity\registration.controller.ts:401:      const created = await this.memberships.registerInsurer(
apps\api\src\identity\registration.controller.ts:451:      const created = await this.memberships.registerTowingOperator(
apps\api\src\identity\platform-grant.spec.ts:43:    // hard-depends on `memberships_for_subject`, so nothing new could break.
apps\api\src\identity\platform-grant.spec.ts:116:      // profile, then memberships
apps\api\src\identity\platform-grant.spec.ts:130:    expect(viewer.memberships.map((m) => m.roleName)).toEqual(['workshop_owner']);
apps\api\src\identity\platform-grant.spec.ts:136:    // returned both memberships too. Codex flagged the earlier version for
apps\api\src\identity\platform-grant.spec.ts:141:    expect(viewer.memberships.map((m) => m.roleName)).toEqual([
apps\api\src\identity\membership.service.ts:115:  // existing memberships carry the name inside the owner's workshop, and this
apps\api\src\identity\membership.service.ts:142:const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
apps\api\src\identity\membership.service.ts:171:  // chain, so `ROLES_BY_ORG_TYPE['constructor']` returns the Object function —
apps\api\src\identity\membership.service.ts:174:  if (!Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)) return false;
apps\api\src\identity\membership.service.ts:175:  return ROLES_BY_ORG_TYPE[orgType]!.includes(roleName);
apps\api\src\identity\membership.service.ts:181: * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
apps\api\src\identity\membership.service.ts:201:    // `POST /memberships` (201) and then `GET /memberships` (403), so they
apps\api\src\identity\membership.service.ts:233:           FROM identity.memberships
apps\api\src\identity\membership.service.ts:288:      // memberships in several tenants), so this lookup can see an account that
apps\api\src\identity\membership.service.ts:394:        `INSERT INTO identity.memberships
apps\api\src\identity\membership.service.ts:426:          `UPDATE identity.memberships
apps\api\src\identity\membership.service.ts:516:        `UPDATE identity.memberships
apps\api\src\identity\membership.repository.ts:16: * IT MUST GO THROUGH `identity.memberships_for_subject()` (migration 003), NOT
apps\api\src\identity\membership.repository.ts:17: * a plain SELECT. `identity.memberships` is under ENABLE + FORCE RLS, and with
apps\api\src\identity\membership.repository.ts:43:     * Reading it here costs nothing: `memberships_for_subject` already joins
apps\api\src\identity\membership.repository.ts:47:    memberships: ValidatedMembership[];
apps\api\src\identity\membership.repository.ts:62:       * This used to be `FROM identity.memberships_for_subject($1) m JOIN
apps\api\src\identity\membership.repository.ts:80:         FROM identity.memberships_for_subject($1) m`,
apps\api\src\identity\membership.repository.ts:87:    const memberships = rows
apps\api\src\identity\membership.repository.ts:97:    return { userId, displayName: rows[0]!.display_name, memberships };
apps\api\src\identity\membership.repository.ts:105:   * gives about `memberships_for_subject`, and it is worth restating because the
apps\api\src\identity\membership.repository.ts:124:   * `memberships_for_subject`, so a behind-on-migrations database was already a
apps\api\src\identity\membership.repository.ts:126:   * `memberships_for_subject`, so any database at 077 already has it — whereas
apps\api\src\identity\membership.repository.ts:296:   * for writers of `identity.memberships` returned exactly two —
apps\api\src\identity\membership.repository.ts:495:   * `identity.memberships` in the product, and neither produces a `customer`.
apps\api\src\identity\membership-role-fit.spec.ts:35:/** The org-type keys of `ROLES_BY_ORG_TYPE`, read from the source. */
apps\api\src\identity\membership-role-fit.spec.ts:37:  const block = /const ROLES_BY_ORG_TYPE[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(source);
apps\api\src\identity\membership-role-fit.spec.ts:38:  expect(block, 'could not find ROLES_BY_ORG_TYPE in membership.service.ts').toBeTruthy();
apps\api\src\identity\membership-role-fit.spec.ts:66:        `ROLES_BY_ORG_TYPE names "${key}", which organizations_org_type_check does not admit — the entry is dead`,
apps\api\src\identity\membership-role-fit.spec.ts:168:    // `ROLES_BY_ORG_TYPE['constructor']` on a bare index returns the Object
apps\api\src\identity\membership-role-fit.spec.ts:171:    expect(source).toContain('Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)');
apps\api\src\identity\membership-role-fit.spec.ts:172:    expect(source).toMatch(/if \(!Object\.hasOwn\(ROLES_BY_ORG_TYPE, orgType\)\) return false;/);
apps\api\src\identity\membership-role-fit.spec.ts:181:    const insertIndex = source.indexOf('INSERT INTO identity.memberships');
apps\api\src\identity\me.service.ts:26:  memberships: ViewerMembership[];
apps\api\src\identity\me.service.ts:53:      // The profile, reached THROUGH memberships rather than from
apps\api\src\identity\me.service.ts:58:           FROM identity.memberships m
apps\api\src\identity\me.service.ts:67:      // need. RLS scopes this to the current tenant; a user's memberships in
apps\api\src\identity\me.service.ts:70:      const memberships = await client.query(
apps\api\src\identity\me.service.ts:76:           FROM identity.memberships m
apps\api\src\identity\me.service.ts:101:        memberships: memberships.rows
apps\api\src\identity\identity.spec.ts:167:   * `identity.memberships`, which IS under FORCE RLS, and joining outward.
apps\api\src\identity\identity.spec.ts:171:  it('every user query starts FROM identity.memberships and joins to users', async () => {
apps\api\src\identity\identity.spec.ts:180:        /FROM\s+identity\.memberships\s+m/i.test(q.text),
apps\api\src\identity\identity.spec.ts:181:        `a user query did not start from memberships and is therefore unscoped:\n${q.text}`,
apps\api\src\identity\identity.spec.ts:258:     * driven FROM memberships and therefore lists people who are ALREADY
apps\api\src\identity\identity.spec.ts:276:      const insert = queries.find((q) => /INSERT INTO identity\.memberships/.test(q.text));
apps\api\src\identity\identity.spec.ts:346:        if (/INSERT INTO identity\.memberships/.test(text)) {
apps\api\src\identity\identity.spec.ts:350:        if (/UPDATE identity\.memberships/.test(text) && insertDone) {
apps\api\src\identity\identity.spec.ts:364:      const update = queries.find((q) => /UPDATE identity\.memberships/.test(q.text));
apps\api\src\identity\identity.spec.ts:410:    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
apps\api\src\identity\identity.spec.ts:431:    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
apps\api\src\identity\identity.spec.ts:446:      /INTO identity\.memberships|UPDATE identity\.memberships/.test(text)
apps\api\src\identity\identity.spec.ts:477:    const update = queries.find((q) => /UPDATE identity\.memberships/.test(q.text));
apps\api\src\identity\identity.spec.ts:501:    expect(queries.some((q) => /UPDATE identity\.memberships/.test(q.text))).toBe(false);
apps\api\src\identity\identity.schemas.ts:5: * Request schemas for branches and memberships.
apps\api\src\identity\identity.schemas.ts:10: * `identity.memberships` constrains `status` and not `role_name`, so an
apps\api\src\identity\identity.schemas.ts:38: * is driven FROM `identity.memberships`, so it lists people who are ALREADY
apps\api\src\identity\identity.schemas.ts:49: * only if they already hold a role permitted to grant memberships in this
apps\api\src\identity\identity.schemas.ts:83: * Enumerated because the migration enumerates it: `identity.memberships.status`
apps\api\src\identity\identity.controllers.ts:74:@Controller('memberships')
apps\api\src\identity\identity.controllers.ts:77:  constructor(private readonly memberships: MembershipService) {}
apps\api\src\identity\identity.controllers.ts:85:    return this.memberships.list(req.tenantContext, { userId, organizationId });
apps\api\src\identity\identity.controllers.ts:93:    return this.memberships.grant(req.tenantContext, body);
apps\api\src\identity\identity.controllers.ts:107:    return this.memberships.withdraw(req.tenantContext, id, body.status);
apps\api\src\identity\identity-bootstrap.integration.spec.ts:14: *   1. `identity.memberships` is under FORCE RLS. With no tenant context its
apps\api\src\identity\identity-bootstrap.integration.spec.ts:45:    // join. The property under test is that `memberships_for_subject` resolves
apps\api\src\identity\identity-bootstrap.integration.spec.ts:62:         JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
apps\api\src\identity\identity-bootstrap.integration.spec.ts:88:  it('REGRESSION: resolves memberships with NO tenant context set', async () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts:96:         FROM identity.memberships_for_subject($1)`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts:104:  it('does NOT weaken RLS: a direct read of memberships is still blocked', async () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts:110:      `SELECT count(*)::text AS n FROM identity.memberships`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts:118:      `SELECT * FROM identity.memberships_for_subject($1)`,
apps\api\src\identity\fleet-registration.spec.ts:26:  const memberships = { registerFleet } as never;
apps\api\src\identity\fleet-registration.spec.ts:29:  const controller = new RegistrationController(memberships, jwt, enrolment);
apps\api\src\identity\customer-enrolment.service.ts:14: * `identity.memberships` had exactly two writers in the whole product —
apps\api\src\identity\customer-enrolment.service.ts:60:    private readonly memberships: MembershipRepository,
apps\api\src\identity\customer-enrolment.service.ts:88:      enrolled = await this.memberships.enrolAsCustomer(subject, organizationId);
apps\api\src\identity\customer-enrolment.integration.spec.ts:207:      `SELECT role_name, status FROM identity.memberships
apps\api\src\identity\customer-enrolment.integration.spec.ts:238:    const memberships = await client!.query(
apps\api\src\identity\customer-enrolment.integration.spec.ts:239:      `SELECT 1 FROM identity.memberships WHERE user_id = $1 AND organization_id = $2`,
apps\api\src\identity\customer-enrolment.integration.spec.ts:250:    expect(memberships.rowCount).toBe(1);
apps\api\src\repair\repair.spec.ts:198:      if (/FROM identity\.memberships/.test(t)) return []; // not a technician
apps\api\src\repair\repair.spec.ts:205:    const check = queries.find((q) => /FROM identity\.memberships/.test(q.text));
apps\api\src\tenancy\tenant-context.ts:75: * is only ever used to SELECT among memberships the server already proved the
apps\api\src\tenancy\tenant-context.ts:81:  memberships: readonly ValidatedMembership[];
apps\api\src\tenancy\tenant-context.ts:85:   * one: it SELECTS among memberships the server has already proved, and can
apps\api\src\tenancy\tenant-context.ts:94:   * Why this exists: `identity.memberships` is unique on
apps\api\src\tenancy\tenant-context.ts:118:    memberships,
apps\api\src\tenancy\tenant-context.ts:129:  const activeRaw = memberships.filter((m) => m.status === 'active');
apps\api\src\tenancy\tenant-context.ts:162:  // request already hard-depends on `memberships_for_subject`, so a database
apps\api\src\tenancy\tenant-context.ts:174:  // memberships", which would be true-ish and useless: the row does exist, and
apps\api\src\tenancy\tenant-context.ts:201:      'requested role is not among the user active memberships',
apps\api\src\tenancy\tenant-context.ts:214:        'requested organization is not among the user active memberships',
apps\api\src\tenancy\tenant-context.ts:220:    // No selection, several memberships: take a DETERMINISTIC default.
apps\api\src\tenancy\tenant-context.ts:224:    // memberships and no stored selection could not load the shell that
apps\api\src\tenancy\tenant-context.ts:231:    // REQUESTED organization that is not among the user's memberships still
apps\api\src\crm\leads.integration.spec.ts:181:      `INSERT INTO identity.memberships
apps\api\src\calls\calls.service.ts:304:      // memberships in many tenants). So any uuid was accepted, inserted as a
apps\api\src\calls\calls.service.ts:316:            `SELECT 1 FROM identity.memberships
apps\api\src\calls\calls.service.ts:341:          `SELECT DISTINCT user_id FROM identity.memberships
apps\api\src\authz\workshop-roles.ts:76: *     POST /memberships  -> 201   (the appointment is made)
apps\api\src\authz\workshop-roles.ts:77: *     GET  /memberships  -> 403   ("belongs to the workshop, not to a
apps\api\src\authz\role-vocabulary.spec.ts:10: * the name in `identity.memberships.role_name`, in `ROLE_PERMISSIONS`, in
apps\api\src\authz\role-vocabulary.spec.ts:69:   * organisation in this schema, and these are not `identity.memberships`
apps\api\src\authz\permission-matrix.ts:7: * `finance.read`, `organization.admin` and `platform.admin`, and no code
apps\api\src\authz\permission-matrix.ts:36:  organizationAdmin: 'organization.admin',
apps\api\src\authz\permission-matrix.ts:50: * Role names are the `identity.memberships.role_name` values accepted by
apps\api\src\authz\permission-matrix.ts:132:   * and `:505` gates **Settings** on `organization.admin`. The Supervisor
apps\api\src\authz\permission-matrix.ts:286: * memberships by ORGANISATION ID ALONE. Two roles in the SAME organisation
apps\api\src\authz\permission-matrix.spec.ts:270:      // `organization.admin` and `finance.read` inside the organisation its
apps\api\src\auth\user.guard.ts:46:    private readonly memberships: MembershipRepository,
apps\api\src\auth\user.guard.ts:59:    // `memberships_for_subject` LEFT JOINs memberships, so an active user with
apps\api\src\auth\user.guard.ts:62:    let record = await this.memberships.findByKeycloakSubject(verified.subject);
apps\api\src\auth\user.guard.ts:83:      await this.memberships.provisionUser(
apps\api\src\auth\user.guard.ts:88:      record = await this.memberships.findByKeycloakSubject(verified.subject);
apps\api\src\auth\user.guard.ts:91:        // `active` — a SUSPENDED account signing in. `memberships_for_subject`
apps\api\src\auth\tenant.guard.ts:27: *   2. look up memberships by the token SUBJECT
apps\api\src\auth\tenant.guard.ts:28: *   3. resolve exactly one active tenant context from those memberships
apps\api\src\auth\tenant.guard.ts:32: * used only to select among memberships the server has already proved the user
apps\api\src\auth\tenant.guard.ts:41:    private readonly memberships: MembershipRepository,
apps\api\src\auth\tenant.guard.ts:54:    let record = await this.memberships.findByKeycloakSubject(verified.subject);
apps\api\src\auth\tenant.guard.ts:71:      await this.memberships.provisionUser(
apps\api\src\auth\tenant.guard.ts:76:      record = await this.memberships.findByKeycloakSubject(verified.subject);
apps\api\src\auth\tenant.guard.ts:80:        // `memberships_for_subject` filters on `status = 'active'`.
apps\api\src\auth\tenant.guard.ts:96:    // among memberships already proved from the token subject, and REFUSES a
apps\api\src\auth\tenant.guard.ts:108:    // same reason `memberships_for_subject` takes a subject: the function
apps\api\src\auth\tenant.guard.ts:114:    const hasPlatformGrant = await this.memberships.hasPlatformGrant(verified.subject);
apps\api\src\auth\tenant.guard.ts:119:        memberships: record.memberships,
apps\api\src\tenancy\tenant-context.spec.ts:22:      memberships: [membership()],
apps\api\src\tenancy\tenant-context.spec.ts:33:        memberships: [membership({ status: 'revoked' })],
apps\api\src\tenancy\tenant-context.spec.ts:42:   * included, so a user holding two memberships and no stored selection could
apps\api\src\tenancy\tenant-context.spec.ts:50:  it('takes a deterministic default when several memberships exist and none was selected', () => {
apps\api\src\tenancy\tenant-context.spec.ts:53:      memberships: [membership({ organizationId: 'org-9' }), membership({ organizationId: 'org-2' })],
apps\api\src\tenancy\tenant-context.spec.ts:59:  it('the default is STABLE regardless of the order memberships arrive in', () => {
apps\api\src\tenancy\tenant-context.spec.ts:65:      memberships: [membership({ organizationId: 'org-2' }), membership({ organizationId: 'org-9' })],
apps\api\src\tenancy\tenant-context.spec.ts:70:      memberships: [membership({ organizationId: 'org-9' }), membership({ organizationId: 'org-2' })],
apps\api\src\tenancy\tenant-context.spec.ts:79:      memberships: [membership({ organizationId: 'org-2' }), membership({ organizationId: 'org-9' })],
apps\api\src\tenancy\tenant-context.spec.ts:92:        memberships: [membership()],
apps\api\src\tenancy\tenant-context.spec.ts:96:    ).toThrow(/not among the user active memberships/);
apps\api\src\tenancy\tenant-context.spec.ts:99:  it('SECURITY: a client-supplied org can only select among proven memberships', () => {
apps\api\src\tenancy\tenant-context.spec.ts:102:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:117:        memberships: [membership()],
apps\api\src\tenancy\tenant-context.spec.ts:164:      memberships: owner,
apps\api\src\tenancy\tenant-context.spec.ts:175:        memberships: owner,
apps\api\src\tenancy\tenant-context.spec.ts:195:        memberships: [membership({ roleName: 'technician' })],
apps\api\src\tenancy\tenant-context.spec.ts:208:        memberships: [membership({ roleName: 'customer' })],
apps\api\src\tenancy\tenant-context.spec.ts:225:        memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:238:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:256:        memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:270:      memberships: owner,
apps\api\src\tenancy\tenant-context.spec.ts:289:      memberships: [...owner].reverse(),
apps\api\src\tenancy\tenant-context.spec.ts:301:    // Every other test in this block uses memberships in ONE organisation, so
apps\api\src\tenancy\tenant-context.spec.ts:317:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:337:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:354:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:363:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:373:    // A role added to `identity.memberships` before it is added to
apps\api\src\tenancy\tenant-context.spec.ts:378:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:421:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:439:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:454: * `identity.memberships.role_name`. For a day, revoking a grant on production
apps\api\src\tenancy\tenant-context.spec.ts:487:      resolveTenantContext({ userId: 'ex-admin', memberships: adminOnly, correlationId: 'c' }),
apps\api\src\tenancy\tenant-context.spec.ts:494:      memberships: adminOnly,
apps\api\src\tenancy\tenant-context.spec.ts:509:      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:522:    // memberships" would be true-ish and useless: the membership row exists.
apps\api\src\tenancy\tenant-context.spec.ts:526:        memberships: [
apps\api\src\tenancy\tenant-context.spec.ts:544:        memberships: [],
apps\api\src\tenancy\tenant-context.spec.ts:557:        memberships: [
apps\api\src\tenancy\organisation-isolation.integration.spec.ts:65:  'identity.memberships',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts:89:  //   · harmful, because a customer may hold memberships at SEVERAL workshops.
apps\api\src\settings\settings.service.ts:66: * The whole `settings` nav group is `organization.admin` in every tree, so the
apps\api\src\settings\settings.service.ts:805:           LEFT JOIN identity.memberships m ON m.branch_id = b.id
apps\api\src\settings\settings.service.ts:863:           FROM identity.memberships m
apps\api\src\selfservice\customer-records.integration.spec.ts:155:let memberships: MembershipService;
apps\api\src\selfservice\customer-records.integration.spec.ts:290:  memberships = new MembershipService(db, noAudit);
apps\api\src\selfservice\customer-records.integration.spec.ts:406:  //   · `/users` and `/memberships` — THE STAFF ROSTER, WITH EMAILS. The same
apps\api\src\selfservice\customer-records.integration.spec.ts:422:    await expect(memberships.list(ctxFor(userA, 'customer'))).rejects.toThrow(
apps\api\src\selfservice\customer-records.integration.spec.ts:457:    await expect(memberships.list(ctxFor(userA, 'workshop_owner'))).resolves.toBeDefined();
apps\api\src\security\security.controller.ts:18: * because it is what resolves an ACTIVE ROLE from proved memberships, and the
apps\api\src\security\security.controller.ts:51:    // which gates on `platform.admin` — and `identity.memberships.role_name`
apps\api\src\security\security-posture.spec.ts:95:    // control: every query reaches it by joining identity.memberships.
apps\api\src\security\security-posture.spec.ts:101:    expect(c.findings[0]).toContain('identity.memberships');
apps\api\src\security\security-posture.service.ts:106:    'One human may hold memberships in several tenants, so a user row cannot ' +
apps\api\src\security\security-posture.service.ts:108:    'query reaches it ONLY by joining identity.memberships, which is ENABLE+FORCE. ' +
apps\api\src\agents\service-request-triage.agent.ts:223:           FROM identity.memberships m
apps\api\src\comms\comms.service.ts:345:             FROM identity.memberships
apps\api\src\core\customer.service.ts:60: * screen calls `requireNavRoute()` and a technician gets a 404 — but a page gate
apps\api\src\reception\reception-rules.ts:10: * `organization.admin`, `platform.admin`). Booking an appointment is not any of
apps\api\src\repair\job-card.service.ts:173:const ACTIVE_TECHNICIAN_SQL = `SELECT 1 FROM identity.memberships
apps\api\src\notifications\notifications.service.ts:316:   * ⚠️ CORRECTED 2026-08-07: this comment used to claim `identity.memberships`
apps\api\src\reception\customer-value-chain.integration.spec.ts:34: *      product's only two writers of `identity.memberships` were
apps\api\src\reception\customer-value-chain.integration.spec.ts:147:   * `memberships_for_subject` are SECURITY DEFINER functions whose entire point
apps\api\src\reception\customer-value-chain.integration.spec.ts:182:// Staff. Their memberships ARE seeded with raw SQL, and that is honest: staff
apps\api\src\reception\customer-value-chain.integration.spec.ts:221:let memberships: MembershipRepository;
apps\api\src\reception\customer-value-chain.integration.spec.ts:320:      `INSERT INTO identity.memberships
apps\api\src\reception\customer-value-chain.integration.spec.ts:389:  memberships = new MembershipRepository(db);
apps\api\src\reception\customer-value-chain.integration.spec.ts:390:  enrolment = new CustomerEnrolmentService(memberships, db);
apps\api\src\reception\customer-value-chain.integration.spec.ts:440:    // app role. Zero memberships here is the whole 2026-08-08 defect: the person
apps\api\src\reception\customer-value-chain.integration.spec.ts:443:    const found = await memberships.findByKeycloakSubject(subjectA);
apps\api\src\reception\customer-value-chain.integration.spec.ts:447:      found!.memberships,
apps\api\src\reception\customer-value-chain.integration.spec.ts:469:      `SELECT role_name, status FROM identity.memberships

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/web/app/_shared/org-staff/org-staff-core.ts 
apps/web/app/_shared/org-staff/org-staff-screen.tsx apps/web/app/_shared/org-staff/org-staff-form.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/web/app/insurance/_screens/staff-actions.ts apps/web/app/insurance/_screens/staff-screen.tsx 
apps/web/app/insurance/settings/users/page.tsx apps/web/app/towing/_screens/staff-actions.ts apps/web/app/towing/_screens/staff-section.tsx apps/web/app/towing/operations/settings/page.tsx' in 
C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "const ROLES_BY_ORG_TYPE|insurance:|towing:|async grant|async 
withdraw|assertPermission|organizationId|roleFits" apps/api/src/identity/membership.service.ts apps/api/src/identity/identity.controllers.ts apps/api/src/identity/identity.schemas.ts' in 
C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "rg --files apps/web/app | rg \"staff-actions|staff-screen|settings/users/page|\\[\\.\\.\\.slug\\]\"" in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 903ms:
apps/web/app/_shared/org-staff/org-staff-core.ts:1:import { revalidatePath } from 'next/cache';
apps/web/app/_shared/org-staff/org-staff-core.ts:2:import { apiPatch, apiPost, currentViewer } from '@autoworkshop/next-shell';
apps/web/app/_shared/org-staff/org-staff-core.ts:3:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/_shared/org-staff/org-staff-core.ts:4:
apps/web/app/_shared/org-staff/org-staff-core.ts:5:/**
apps/web/app/_shared/org-staff/org-staff-core.ts:6: * Appointing and removing members of a NON-WORKSHOP organisation.
apps/web/app/_shared/org-staff/org-staff-core.ts:7: *
apps/web/app/_shared/org-staff/org-staff-core.ts:8: * ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────
apps/web/app/_shared/org-staff/org-staff-core.ts:9: *
apps/web/app/_shared/org-staff/org-staff-core.ts:10: * Migration 085 gave insurers and towing firms an org-admin role, because
apps/web/app/_shared/org-staff/org-staff-core.ts:11: * neither had one: `insurance_assessor` and `towing_operator` are absent from
apps/web/app/_shared/org-staff/org-staff-core.ts:12: * `CAN_GRANT_MEMBERSHIP`, so those two organisation types could hold exactly one
apps/web/app/_shared/org-staff/org-staff-core.ts:13: * member — the founder — for ever.
apps/web/app/_shared/org-staff/org-staff-core.ts:14: *
apps/web/app/_shared/org-staff/org-staff-core.ts:15: * The Supervisor then found that 085 was only half the fix. **The grant
apps/web/app/_shared/org-staff/org-staff-core.ts:16: * authority had no caller.** The only `POST /memberships` in the product was
apps/web/app/_shared/org-staff/org-staff-core.ts:17: * `workshop/_screens/staff-actions.ts`, so an insurer's founder could hold the
apps/web/app/_shared/org-staff/org-staff-core.ts:18: * permission and still have no screen to use it from — the navigation entry it
apps/web/app/_shared/org-staff/org-staff-core.ts:19: * revealed fell through to the "not built yet" placeholder. A capability with no
apps/web/app/_shared/org-staff/org-staff-core.ts:20: * way in is not a feature; this repository records that as "a route with no
apps/web/app/_shared/org-staff/org-staff-core.ts:21: * caller is not shipped".
apps/web/app/_shared/org-staff/org-staff-core.ts:22: *
apps/web/app/_shared/org-staff/org-staff-core.ts:23: * ── WHY THE IMPLEMENTATION IS SHARED AND THE ACTIONS ARE NOT ────────────────
apps/web/app/_shared/org-staff/org-staff-core.ts:24: *
apps/web/app/_shared/org-staff/org-staff-core.ts:25: * The rules — organisation from the session, email not uuid, revoke not delete,
apps/web/app/_shared/org-staff/org-staff-core.ts:26: * every refusal naming a way forward — are identical for every organisation
apps/web/app/_shared/org-staff/org-staff-core.ts:27: * type, and CLAUDE.md §3 says extend rather than duplicate. So the behaviour
apps/web/app/_shared/org-staff/org-staff-core.ts:28: * lives here once.
apps/web/app/_shared/org-staff/org-staff-core.ts:29: *
apps/web/app/_shared/org-staff/org-staff-core.ts:30: * The `'use server'` entry points stay per-pack because a server action is
apps/web/app/_shared/org-staff/org-staff-core.ts:31: * identified by its module, and the workspace id decides which API credential
apps/web/app/_shared/org-staff/org-staff-core.ts:32: * and which cookie scope the request uses. Passing it as a parameter from the
apps/web/app/_shared/org-staff/org-staff-core.ts:33: * CLIENT would make the workspace attacker-controlled; binding it in a
apps/web/app/_shared/org-staff/org-staff-core.ts:34: * per-pack server module keeps it a server-side constant.
apps/web/app/_shared/org-staff/org-staff-core.ts:35: */
apps/web/app/_shared/org-staff/org-staff-core.ts:36:
apps/web/app/_shared/org-staff/org-staff-core.ts:37:/** Read a trimmed field, or `undefined` when it is blank. */
apps/web/app/_shared/org-staff/org-staff-core.ts:38:function read(formData: FormData, key: string): string | undefined {
apps/web/app/_shared/org-staff/org-staff-core.ts:39:  const v = String(formData.get(key) ?? '').trim();
apps/web/app/_shared/org-staff/org-staff-core.ts:40:  return v === '' ? undefined : v;
apps/web/app/_shared/org-staff/org-staff-core.ts:41:}
apps/web/app/_shared/org-staff/org-staff-core.ts:42:
apps/web/app/_shared/org-staff/org-staff-core.ts:43:/**
apps/web/app/_shared/org-staff/org-staff-core.ts:44: * Appoint somebody to the caller's own organisation.
apps/web/app/_shared/org-staff/org-staff-core.ts:45: *
apps/web/app/_shared/org-staff/org-staff-core.ts:46: * ⚠️ THE ORGANISATION COMES FROM THE SESSION, NEVER FROM THE FORM — the same
apps/web/app/_shared/org-staff/org-staff-core.ts:47: * rule the workshop version documents. A hidden field would let a caller
apps/web/app/_shared/org-staff/org-staff-core.ts:48: * attempt a grant into another organisation whose id they happen to know. The
apps/web/app/_shared/org-staff/org-staff-core.ts:49: * API re-checks it against the active tenant, but a form that offers the value
apps/web/app/_shared/org-staff/org-staff-core.ts:50: * at all invites the attempt and fails confusingly.
apps/web/app/_shared/org-staff/org-staff-core.ts:51: */
apps/web/app/_shared/org-staff/org-staff-core.ts:52:export async function addOrgMember(
apps/web/app/_shared/org-staff/org-staff-core.ts:53:  workspaceId: string,
apps/web/app/_shared/org-staff/org-staff-core.ts:54:  revalidate: readonly string[],
apps/web/app/_shared/org-staff/org-staff-core.ts:55:  formData: FormData,
apps/web/app/_shared/org-staff/org-staff-core.ts:56:): Promise<ActionResult> {
apps/web/app/_shared/org-staff/org-staff-core.ts:57:  const viewer = await currentViewer(workspaceId);
apps/web/app/_shared/org-staff/org-staff-core.ts:58:  if (!viewer) return { error: 'Your session has ended. Sign in again, then retry.' };
apps/web/app/_shared/org-staff/org-staff-core.ts:59:
apps/web/app/_shared/org-staff/org-staff-core.ts:60:  const result = await apiPost(workspaceId, '/memberships', {
apps/web/app/_shared/org-staff/org-staff-core.ts:61:    userEmail: read(formData, 'userEmail'),
apps/web/app/_shared/org-staff/org-staff-core.ts:62:    organizationId: viewer.organizationId,
apps/web/app/_shared/org-staff/org-staff-core.ts:63:    roleName: read(formData, 'roleName'),
apps/web/app/_shared/org-staff/org-staff-core.ts:64:  });
apps/web/app/_shared/org-staff/org-staff-core.ts:65:
apps/web/app/_shared/org-staff/org-staff-core.ts:66:  if (!result.ok) {
apps/web/app/_shared/org-staff/org-staff-core.ts:67:    // ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape hatch
apps/web/app/_shared/org-staff/org-staff-core.ts:68:    // does not exist is a wall, and walls are the most expensive defect class
apps/web/app/_shared/org-staff/org-staff-core.ts:69:    // recorded in this repository. The API's own sentence is preferred wherever
apps/web/app/_shared/org-staff/org-staff-core.ts:70:    // it sends one, because it knows which rule refused.
apps/web/app/_shared/org-staff/org-staff-core.ts:71:    const error =
apps/web/app/_shared/org-staff/org-staff-core.ts:72:      result.reason === 'invalid'
apps/web/app/_shared/org-staff/org-staff-core.ts:73:        ? (result.message ?? 'Those details were not accepted. Check the email and the role.')
apps/web/app/_shared/org-staff/org-staff-core.ts:74:        : result.reason === 'forbidden'
apps/web/app/_shared/org-staff/org-staff-core.ts:75:          ? (result.message ??
apps/web/app/_shared/org-staff/org-staff-core.ts:76:            'Your role may not appoint people. Only the administrator who registered this organisation can.')
apps/web/app/_shared/org-staff/org-staff-core.ts:77:          : result.reason === 'unauthenticated'
apps/web/app/_shared/org-staff/org-staff-core.ts:78:            ? 'Your session has ended. Sign in again, then retry.'
apps/web/app/_shared/org-staff/org-staff-core.ts:79:            : result.reason === 'notFound'
apps/web/app/_shared/org-staff/org-staff-core.ts:80:              ? (result.message ??
apps/web/app/_shared/org-staff/org-staff-core.ts:81:                'No account with that email address. Ask them to sign up first, then add them here.')
apps/web/app/_shared/org-staff/org-staff-core.ts:82:              : 'The service did not respond. Nothing has been changed — try again shortly.';
apps/web/app/_shared/org-staff/org-staff-core.ts:83:    return { error };
apps/web/app/_shared/org-staff/org-staff-core.ts:84:  }
apps/web/app/_shared/org-staff/org-staff-core.ts:85:
apps/web/app/_shared/org-staff/org-staff-core.ts:86:  for (const path of revalidate) revalidatePath(path);
apps/web/app/_shared/org-staff/org-staff-core.ts:87:  return { created: 'Added. They can sign in and will see this organisation immediately.' };
apps/web/app/_shared/org-staff/org-staff-core.ts:88:}
apps/web/app/_shared/org-staff/org-staff-core.ts:89:
apps/web/app/_shared/org-staff/org-staff-core.ts:90:/**
apps/web/app/_shared/org-staff/org-staff-core.ts:91: * Remove somebody's access.
apps/web/app/_shared/org-staff/org-staff-core.ts:92: *
apps/web/app/_shared/org-staff/org-staff-core.ts:93: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps/web/app/_shared/org-staff/org-staff-core.ts:94: * that "was this person ever granted access, and by whom?" stays answerable —
apps/web/app/_shared/org-staff/org-staff-core.ts:95: * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
apps/web/app/_shared/org-staff/org-staff-core.ts:96: *
apps/web/app/_shared/org-staff/org-staff-core.ts:97: * 🔴 THIS IS THE HALF THAT WAS UNREACHABLE. `withdraw()` needs a membership id,
apps/web/app/_shared/org-staff/org-staff-core.ts:98: * and the only source of one is `GET /memberships` — which was gated on
apps/web/app/_shared/org-staff/org-staff-core.ts:99: * `assertWorkshopStaff` and refused every partner role. So before this screen
apps/web/app/_shared/org-staff/org-staff-core.ts:100: * existed, an appointment made through the API could never be reversed.
apps/web/app/_shared/org-staff/org-staff-core.ts:101: */
apps/web/app/_shared/org-staff/org-staff-core.ts:102:export async function withdrawOrgMember(
apps/web/app/_shared/org-staff/org-staff-core.ts:103:  workspaceId: string,
apps/web/app/_shared/org-staff/org-staff-core.ts:104:  revalidate: readonly string[],
apps/web/app/_shared/org-staff/org-staff-core.ts:105:  formData: FormData,
apps/web/app/_shared/org-staff/org-staff-core.ts:106:): Promise<ActionResult> {
apps/web/app/_shared/org-staff/org-staff-core.ts:107:  const membershipId = String(formData.get('membershipId') ?? '').trim();
apps/web/app/_shared/org-staff/org-staff-core.ts:108:  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };
apps/web/app/_shared/org-staff/org-staff-core.ts:109:
apps/web/app/_shared/org-staff/org-staff-core.ts:110:  const result = await apiPatch(workspaceId, `/memberships/${membershipId}/status`, {
apps/web/app/_shared/org-staff/org-staff-core.ts:111:    // `revoked`, not `suspended`: this control is "remove". Suspension is a
apps/web/app/_shared/org-staff/org-staff-core.ts:112:    // different decision and deserves its own control rather than being what
apps/web/app/_shared/org-staff/org-staff-core.ts:113:    // "remove" quietly does.
apps/web/app/_shared/org-staff/org-staff-core.ts:114:    status: 'revoked',
apps/web/app/_shared/org-staff/org-staff-core.ts:115:  });
apps/web/app/_shared/org-staff/org-staff-core.ts:116:
apps/web/app/_shared/org-staff/org-staff-core.ts:117:  if (!result.ok) {
apps/web/app/_shared/org-staff/org-staff-core.ts:118:    const error =
apps/web/app/_shared/org-staff/org-staff-core.ts:119:      result.reason === 'invalid'
apps/web/app/_shared/org-staff/org-staff-core.ts:120:        ? (result.message ?? 'That change was not accepted.')
apps/web/app/_shared/org-staff/org-staff-core.ts:121:        : result.reason === 'forbidden'
apps/web/app/_shared/org-staff/org-staff-core.ts:122:          ? (result.message ?? 'Your role may not change who has access.')
apps/web/app/_shared/org-staff/org-staff-core.ts:123:          : result.reason === 'unauthenticated'
apps/web/app/_shared/org-staff/org-staff-core.ts:124:            ? 'Your session has ended. Sign in again, then retry.'
apps/web/app/_shared/org-staff/org-staff-core.ts:125:            : result.reason === 'notFound'
apps/web/app/_shared/org-staff/org-staff-core.ts:126:              ? 'That membership no longer exists. Reload the page.'
apps/web/app/_shared/org-staff/org-staff-core.ts:127:              : 'The service did not respond. Nothing has been changed — try again shortly.';
apps/web/app/_shared/org-staff/org-staff-core.ts:128:    return { error };
apps/web/app/_shared/org-staff/org-staff-core.ts:129:  }
apps/web/app/_shared/org-staff/org-staff-core.ts:130:
apps/web/app/_shared/org-staff/org-staff-core.ts:131:  for (const path of revalidate) revalidatePath(path);
apps/web/app/_shared/org-staff/org-staff-core.ts:132:  return { created: 'Removed. They can no longer see this organisation.' };
apps/web/app/_shared/org-staff/org-staff-core.ts:133:}
apps/web/app/_shared/org-staff/org-staff-form.tsx:1:'use client';
apps/web/app/_shared/org-staff/org-staff-form.tsx:2:
apps/web/app/_shared/org-staff/org-staff-form.tsx:3:import * as React from 'react';
apps/web/app/_shared/org-staff/org-staff-form.tsx:4:import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
apps/web/app/_shared/org-staff/org-staff-form.tsx:5:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/_shared/org-staff/org-staff-form.tsx:6:import { primitive, themeVar } from '@autoworkshop/design-tokens';
apps/web/app/_shared/org-staff/org-staff-form.tsx:7:import type { OrgRoleOption } from './org-staff-screen';
apps/web/app/_shared/org-staff/org-staff-form.tsx:8:
apps/web/app/_shared/org-staff/org-staff-form.tsx:9:/**
apps/web/app/_shared/org-staff/org-staff-form.tsx:10: * The appointment form, shared by the insurance and towing packs.
apps/web/app/_shared/org-staff/org-staff-form.tsx:11: *
apps/web/app/_shared/org-staff/org-staff-form.tsx:12: * ⚠️ THE ACTION IS PASSED IN, NOT CHOSEN HERE. Each pack supplies its own
apps/web/app/_shared/org-staff/org-staff-form.tsx:13: * `'use server'` entry point with the workspace id already bound server-side.
apps/web/app/_shared/org-staff/org-staff-form.tsx:14: * A workspace chosen in client code would be attacker-controlled, and the
apps/web/app/_shared/org-staff/org-staff-form.tsx:15: * workspace decides which API credential and cookie scope the request uses.
apps/web/app/_shared/org-staff/org-staff-form.tsx:16: */
apps/web/app/_shared/org-staff/org-staff-form.tsx:17:export function AddOrgMemberForm({
apps/web/app/_shared/org-staff/org-staff-form.tsx:18:  action,
apps/web/app/_shared/org-staff/org-staff-form.tsx:19:  roles,
apps/web/app/_shared/org-staff/org-staff-form.tsx:20:  organisationNoun,
apps/web/app/_shared/org-staff/org-staff-form.tsx:21:}: {
apps/web/app/_shared/org-staff/org-staff-form.tsx:22:  action: (formData: FormData) => Promise<ActionResult>;
apps/web/app/_shared/org-staff/org-staff-form.tsx:23:  roles: readonly OrgRoleOption[];
apps/web/app/_shared/org-staff/org-staff-form.tsx:24:  organisationNoun: string;
apps/web/app/_shared/org-staff/org-staff-form.tsx:25:}) {
apps/web/app/_shared/org-staff/org-staff-form.tsx:26:  // The FIRST option is the default, and each pack lists its operational role
apps/web/app/_shared/org-staff/org-staff-form.tsx:27:  // first — appointing another administrator is the rarer, weightier act and
apps/web/app/_shared/org-staff/org-staff-form.tsx:28:  // should be a deliberate choice rather than the value already in the box.
apps/web/app/_shared/org-staff/org-staff-form.tsx:29:  const [role, setRole] = React.useState(roles[0]?.value ?? '');
apps/web/app/_shared/org-staff/org-staff-form.tsx:30:  const hint = roles.find((r) => r.value === role)?.hint;
apps/web/app/_shared/org-staff/org-staff-form.tsx:31:
apps/web/app/_shared/org-staff/org-staff-form.tsx:32:  return (
apps/web/app/_shared/org-staff/org-staff-form.tsx:33:    <div
apps/web/app/_shared/org-staff/org-staff-form.tsx:34:      style={{
apps/web/app/_shared/org-staff/org-staff-form.tsx:35:        border: `1px solid ${themeVar.borderDefault}`,
apps/web/app/_shared/org-staff/org-staff-form.tsx:36:        borderRadius: primitive.radius.xl,
apps/web/app/_shared/org-staff/org-staff-form.tsx:37:        padding: primitive.space[6],
apps/web/app/_shared/org-staff/org-staff-form.tsx:38:        background: themeVar.surfaceRaised,
apps/web/app/_shared/org-staff/org-staff-form.tsx:39:      }}
apps/web/app/_shared/org-staff/org-staff-form.tsx:40:    >
apps/web/app/_shared/org-staff/org-staff-form.tsx:41:      <h2 style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: primitive.fontSize.lg }}>
apps/web/app/_shared/org-staff/org-staff-form.tsx:42:        Add a colleague
apps/web/app/_shared/org-staff/org-staff-form.tsx:43:      </h2>
apps/web/app/_shared/org-staff/org-staff-form.tsx:44:      <p
apps/web/app/_shared/org-staff/org-staff-form.tsx:45:        style={{
apps/web/app/_shared/org-staff/org-staff-form.tsx:46:          margin: `0 0 ${primitive.space[4]}`,
apps/web/app/_shared/org-staff/org-staff-form.tsx:47:          color: themeVar.textSecondary,
apps/web/app/_shared/org-staff/org-staff-form.tsx:48:          fontSize: primitive.fontSize.sm,
apps/web/app/_shared/org-staff/org-staff-form.tsx:49:        }}
apps/web/app/_shared/org-staff/org-staff-form.tsx:50:      >
apps/web/app/_shared/org-staff/org-staff-form.tsx:51:        {/*
apps/web/app/_shared/org-staff/org-staff-form.tsx:52:          Stated up front rather than discovered through a failure. There is no
apps/web/app/_shared/org-staff/org-staff-form.tsx:53:          invitation flow yet (T-0028), and a form that looks like it will send
apps/web/app/_shared/org-staff/org-staff-form.tsx:54:          an invite and instead refuses an unknown address is worse than one
apps/web/app/_shared/org-staff/org-staff-form.tsx:55:          that says so first.
apps/web/app/_shared/org-staff/org-staff-form.tsx:56:        */}
apps/web/app/_shared/org-staff/org-staff-form.tsx:57:        They need an account already. Ask them to sign up, then add them here with
apps/web/app/_shared/org-staff/org-staff-form.tsx:58:        the same email address.
apps/web/app/_shared/org-staff/org-staff-form.tsx:59:      </p>
apps/web/app/_shared/org-staff/org-staff-form.tsx:60:
apps/web/app/_shared/org-staff/org-staff-form.tsx:61:      <FormShell action={action} successPrefix="">
apps/web/app/_shared/org-staff/org-staff-form.tsx:62:        <Field label="Their email address" htmlFor="userEmail">
apps/web/app/_shared/org-staff/org-staff-form.tsx:63:          <TextInput
apps/web/app/_shared/org-staff/org-staff-form.tsx:64:            id="userEmail"
apps/web/app/_shared/org-staff/org-staff-form.tsx:65:            name="userEmail"
apps/web/app/_shared/org-staff/org-staff-form.tsx:66:            type="email"
apps/web/app/_shared/org-staff/org-staff-form.tsx:67:            required
apps/web/app/_shared/org-staff/org-staff-form.tsx:68:            autoComplete="off"
apps/web/app/_shared/org-staff/org-staff-form.tsx:69:            placeholder="colleague@example.com"
apps/web/app/_shared/org-staff/org-staff-form.tsx:70:          />
apps/web/app/_shared/org-staff/org-staff-form.tsx:71:        </Field>
apps/web/app/_shared/org-staff/org-staff-form.tsx:72:
apps/web/app/_shared/org-staff/org-staff-form.tsx:73:        <Field label="What they may do" htmlFor="roleName" hint={hint}>
apps/web/app/_shared/org-staff/org-staff-form.tsx:74:          <Select
apps/web/app/_shared/org-staff/org-staff-form.tsx:75:            id="roleName"
apps/web/app/_shared/org-staff/org-staff-form.tsx:76:            name="roleName"
apps/web/app/_shared/org-staff/org-staff-form.tsx:77:            value={role}
apps/web/app/_shared/org-staff/org-staff-form.tsx:78:            onChange={(e) => setRole(e.currentTarget.value)}
apps/web/app/_shared/org-staff/org-staff-form.tsx:79:            options={roles.map((r) => ({ value: r.value, label: r.label }))}
apps/web/app/_shared/org-staff/org-staff-form.tsx:80:          />
apps/web/app/_shared/org-staff/org-staff-form.tsx:81:        </Field>
apps/web/app/_shared/org-staff/org-staff-form.tsx:82:
apps/web/app/_shared/org-staff/org-staff-form.tsx:83:        {/* A form without one of these shipped in this repo once, and the live
apps/web/app/_shared/org-staff/org-staff-form.tsx:84:            suite has a check for it. */}
apps/web/app/_shared/org-staff/org-staff-form.tsx:85:        <SubmitButton>Add to this {organisationNoun}</SubmitButton>
apps/web/app/_shared/org-staff/org-staff-form.tsx:86:      </FormShell>
apps/web/app/_shared/org-staff/org-staff-form.tsx:87:    </div>
apps/web/app/_shared/org-staff/org-staff-form.tsx:88:  );
apps/web/app/_shared/org-staff/org-staff-form.tsx:89:}
apps/web/app/_shared/org-staff/org-staff-form.tsx:90:
apps/web/app/_shared/org-staff/org-staff-form.tsx:91:/**
apps/web/app/_shared/org-staff/org-staff-form.tsx:92: * Remove someone's access.
apps/web/app/_shared/org-staff/org-staff-form.tsx:93: *
apps/web/app/_shared/org-staff/org-staff-form.tsx:94: * A form rather than a bare button so it posts through the same server-action
apps/web/app/_shared/org-staff/org-staff-form.tsx:95: * path as everything else, and so it works with JavaScript disabled.
apps/web/app/_shared/org-staff/org-staff-form.tsx:96: */
apps/web/app/_shared/org-staff/org-staff-form.tsx:97:export function WithdrawOrgMemberButton({
apps/web/app/_shared/org-staff/org-staff-form.tsx:98:  action,
apps/web/app/_shared/org-staff/org-staff-form.tsx:99:  membershipId,
apps/web/app/_shared/org-staff/org-staff-form.tsx:100:  name,
apps/web/app/_shared/org-staff/org-staff-form.tsx:101:  organisationNoun,
apps/web/app/_shared/org-staff/org-staff-form.tsx:102:}: {
apps/web/app/_shared/org-staff/org-staff-form.tsx:103:  action: (formData: FormData) => Promise<ActionResult>;
apps/web/app/_shared/org-staff/org-staff-form.tsx:104:  membershipId: string;
apps/web/app/_shared/org-staff/org-staff-form.tsx:105:  name: string;
apps/web/app/_shared/org-staff/org-staff-form.tsx:106:  organisationNoun: string;
apps/web/app/_shared/org-staff/org-staff-form.tsx:107:}) {
apps/web/app/_shared/org-staff/org-staff-form.tsx:108:  return (
apps/web/app/_shared/org-staff/org-staff-form.tsx:109:    <FormShell action={action} successPrefix="">
apps/web/app/_shared/org-staff/org-staff-form.tsx:110:      <input type="hidden" name="membershipId" value={membershipId} />
apps/web/app/_shared/org-staff/org-staff-form.tsx:111:      <button
apps/web/app/_shared/org-staff/org-staff-form.tsx:112:        type="submit"
apps/web/app/_shared/org-staff/org-staff-form.tsx:113:        // `confirm` because this is destructive from the user's point of view
apps/web/app/_shared/org-staff/org-staff-form.tsx:114:        // and instant. The row survives in the database, but their access does
apps/web/app/_shared/org-staff/org-staff-form.tsx:115:        // not, and there is no undo screen.
apps/web/app/_shared/org-staff/org-staff-form.tsx:116:        onClick={(e) => {
apps/web/app/_shared/org-staff/org-staff-form.tsx:117:          if (!window.confirm(`Remove ${name}'s access to this ${organisationNoun}?`)) {
apps/web/app/_shared/org-staff/org-staff-form.tsx:118:            e.preventDefault();
apps/web/app/_shared/org-staff/org-staff-form.tsx:119:          }
apps/web/app/_shared/org-staff/org-staff-form.tsx:120:        }}
apps/web/app/_shared/org-staff/org-staff-form.tsx:121:        style={{
apps/web/app/_shared/org-staff/org-staff-form.tsx:122:          padding: `${primitive.space[2]} ${primitive.space[4]}`,
apps/web/app/_shared/org-staff/org-staff-form.tsx:123:          fontSize: primitive.fontSize.sm,
apps/web/app/_shared/org-staff/org-staff-form.tsx:124:          fontFamily: 'inherit',
apps/web/app/_shared/org-staff/org-staff-form.tsx:125:          color: themeVar.statusDanger,
apps/web/app/_shared/org-staff/org-staff-form.tsx:126:          background: 'transparent',
apps/web/app/_shared/org-staff/org-staff-form.tsx:127:          border: `1px solid ${themeVar.borderDefault}`,
apps/web/app/_shared/org-staff/org-staff-form.tsx:128:          borderRadius: primitive.radius.md,
apps/web/app/_shared/org-staff/org-staff-form.tsx:129:          cursor: 'pointer',
apps/web/app/_shared/org-staff/org-staff-form.tsx:130:        }}
apps/web/app/_shared/org-staff/org-staff-form.tsx:131:      >
apps/web/app/_shared/org-staff/org-staff-form.tsx:132:        Remove
apps/web/app/_shared/org-staff/org-staff-form.tsx:133:      </button>
apps/web/app/_shared/org-staff/org-staff-form.tsx:134:    </FormShell>
apps/web/app/_shared/org-staff/org-staff-form.tsx:135:  );
apps/web/app/_shared/org-staff/org-staff-form.tsx:136:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:1:import { Suspense } from 'react';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:2:import { ApiFailure, apiGet, currentViewer, roleLabel } from '@autoworkshop/next-shell';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:3:import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:4:import { primitive, themeVar } from '@autoworkshop/design-tokens';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:5:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:6:import { AddOrgMemberForm, WithdrawOrgMemberButton } from './org-staff-form';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:7:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:8:/**
apps/web/app/_shared/org-staff/org-staff-screen.tsx:9: * Who has access to a non-workshop organisation, and what they may do.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:10: *
apps/web/app/_shared/org-staff/org-staff-screen.tsx:11: * Mounted by the insurance and towing packs. Modelled on
apps/web/app/_shared/org-staff/org-staff-screen.tsx:12: * `workshop/_screens/staff-screen.tsx`, whose comments explain most of the
apps/web/app/_shared/org-staff/org-staff-screen.tsx:13: * shape; the differences are noted where they occur.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:14: *
apps/web/app/_shared/org-staff/org-staff-screen.tsx:15: * ⚠️ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
apps/web/app/_shared/org-staff/org-staff-screen.tsx:16: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps/web/app/_shared/org-staff/org-staff-screen.tsx:17: * are tenant-scoped server-side with RLS underneath; joining them here is
apps/web/app/_shared/org-staff/org-staff-screen.tsx:18: * presentation (CLAUDE.md §8).
apps/web/app/_shared/org-staff/org-staff-screen.tsx:19: *
apps/web/app/_shared/org-staff/org-staff-screen.tsx:20: * 🔴 BOTH READS WERE REFUSED FOR THESE ROLES UNTIL 2026-08-17. `list()` was
apps/web/app/_shared/org-staff/org-staff-screen.tsx:21: * gated on `assertWorkshopStaff`, whose set contains no partner role, so this
apps/web/app/_shared/org-staff/org-staff-screen.tsx:22: * screen could not have existed: `POST /memberships` answered 201 and
apps/web/app/_shared/org-staff/org-staff-screen.tsx:23: * `GET /memberships` answered 403.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:24: */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:25:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:26:export const dynamic = 'force-dynamic';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:27:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:28:/** Field names taken from `TenantUser` in the API — never guessed. */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:29:interface UserRow {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:30:  id: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:31:  email: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:32:  displayName: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:33:  phone: string | null;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:34:  status: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:35:  roles: string[];
apps/web/app/_shared/org-staff/org-staff-screen.tsx:36:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:37:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:38:/** Field names taken from `Membership` in the API. */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:39:interface MembershipRow {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:40:  id: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:41:  organizationId: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:42:  branchId: string | null;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:43:  userId: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:44:  roleName: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:45:  status: 'active' | 'suspended' | 'revoked';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:46:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:47:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:48:export interface OrgRoleOption {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:49:  value: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:50:  label: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:51:  hint: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:52:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:53:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:54:export interface OrgStaffScreenProps {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:55:  /** Which pack this is mounted in — decides the API credential and cookie scope. */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:56:  workspaceId: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:57:  /** Page title, e.g. "Users". */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:58:  title: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:59:  description: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:60:  /** What this organisation is called in prose, e.g. "insurance company". */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:61:  organisationNoun: string;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:62:  /** The roles this organisation type may confer — must match `ROLES_BY_ORG_TYPE`. */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:63:  roles: readonly OrgRoleOption[];
apps/web/app/_shared/org-staff/org-staff-screen.tsx:64:  addAction: (formData: FormData) => Promise<ActionResult>;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:65:  withdrawAction: (formData: FormData) => Promise<ActionResult>;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:66:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:67:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:68:export function OrgStaffScreen(props: OrgStaffScreenProps) {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:69:  return (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:70:    <>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:71:      <PageHeader title={props.title} description={props.description} />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:72:      <Suspense fallback={<LoadingState label="Loading the people who have access…" />}>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:73:        <OrgStaffList {...props} />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:74:      </Suspense>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:75:    </>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:76:  );
apps/web/app/_shared/org-staff/org-staff-screen.tsx:77:}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:78:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:79:async function OrgStaffList({
apps/web/app/_shared/org-staff/org-staff-screen.tsx:80:  workspaceId,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:81:  organisationNoun,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:82:  roles,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:83:  addAction,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:84:  withdrawAction,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:85:}: OrgStaffScreenProps) {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:86:  const viewer = await currentViewer(workspaceId);
apps/web/app/_shared/org-staff/org-staff-screen.tsx:87:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:88:  /*
apps/web/app/_shared/org-staff/org-staff-screen.tsx:89:    🔴 SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT — the defect the
apps/web/app/_shared/org-staff/org-staff-screen.tsx:90:    workshop version records. `/memberships` unfiltered returns every membership
apps/web/app/_shared/org-staff/org-staff-screen.tsx:91:    in the tenant, and a tenant may hold more than one organisation, so an
apps/web/app/_shared/org-staff/org-staff-screen.tsx:92:    unfiltered list over-reports who can reach THIS one. A page that over-reports
apps/web/app/_shared/org-staff/org-staff-screen.tsx:93:    access is worse than one that says nothing.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:94:  */
apps/web/app/_shared/org-staff/org-staff-screen.tsx:95:  const orgFilter = viewer?.organizationId
apps/web/app/_shared/org-staff/org-staff-screen.tsx:96:    ? `?organizationId=${encodeURIComponent(viewer.organizationId)}`
apps/web/app/_shared/org-staff/org-staff-screen.tsx:97:    : '';
apps/web/app/_shared/org-staff/org-staff-screen.tsx:98:  const [users, memberships] = await Promise.all([
apps/web/app/_shared/org-staff/org-staff-screen.tsx:99:    apiGet<UserRow[]>(workspaceId, '/users'),
apps/web/app/_shared/org-staff/org-staff-screen.tsx:100:    apiGet<MembershipRow[]>(workspaceId, `/memberships${orgFilter}`),
apps/web/app/_shared/org-staff/org-staff-screen.tsx:101:  ]);
apps/web/app/_shared/org-staff/org-staff-screen.tsx:102:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:103:  if (!users.ok) return <ApiFailure reason={users.reason} workspaceId={workspaceId} />;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:104:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId={workspaceId} />;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:105:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:106:  const byUser = new Map(users.data.map((u) => [u.id, u]));
apps/web/app/_shared/org-staff/org-staff-screen.tsx:107:  // Active memberships only. A revoked one is kept in the database so that "was
apps/web/app/_shared/org-staff/org-staff-screen.tsx:108:  // this person ever granted access?" stays answerable, and showing it in a
apps/web/app/_shared/org-staff/org-staff-screen.tsx:109:  // staff LIST would read as though they still work here.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:110:  const active = memberships.data.filter((m) => m.status === 'active');
apps/web/app/_shared/org-staff/org-staff-screen.tsx:111:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:112:  return (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:113:    <>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:114:      {/*
apps/web/app/_shared/org-staff/org-staff-screen.tsx:115:        The form FIRST: on a newly registered organisation the founder is the
apps/web/app/_shared/org-staff/org-staff-screen.tsx:116:        only member, so the whole point of this page is to add somebody, and a
apps/web/app/_shared/org-staff/org-staff-screen.tsx:117:        form under an empty state is a form nobody finds.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:118:      */}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:119:      <AddOrgMemberForm
apps/web/app/_shared/org-staff/org-staff-screen.tsx:120:        action={addAction}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:121:        roles={roles}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:122:        organisationNoun={organisationNoun}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:123:      />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:124:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:125:      {active.length === 0 ? (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:126:        <EmptyState
apps/web/app/_shared/org-staff/org-staff-screen.tsx:127:          title="Nobody else has access yet"
apps/web/app/_shared/org-staff/org-staff-screen.tsx:128:          description={`Add a colleague by their email address above. They need an account first — ask them to sign up, then add them 
here.`}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:129:        />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:130:      ) : (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:131:        <ul
apps/web/app/_shared/org-staff/org-staff-screen.tsx:132:          style={{
apps/web/app/_shared/org-staff/org-staff-screen.tsx:133:            listStyle: 'none',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:134:            margin: `${primitive.space[6]} 0 0`,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:135:            padding: 0,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:136:            display: 'grid',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:137:            gap: primitive.space[3],
apps/web/app/_shared/org-staff/org-staff-screen.tsx:138:          }}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:139:        >
apps/web/app/_shared/org-staff/org-staff-screen.tsx:140:          {active.map((m) => {
apps/web/app/_shared/org-staff/org-staff-screen.tsx:141:            const person = byUser.get(m.userId);
apps/web/app/_shared/org-staff/org-staff-screen.tsx:142:            const isSelf = viewer?.userId === m.userId;
apps/web/app/_shared/org-staff/org-staff-screen.tsx:143:            return (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:144:              <li
apps/web/app/_shared/org-staff/org-staff-screen.tsx:145:                key={m.id}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:146:                style={{
apps/web/app/_shared/org-staff/org-staff-screen.tsx:147:                  border: `1px solid ${themeVar.borderDefault}`,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:148:                  borderRadius: primitive.radius.xl,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:149:                  padding: primitive.space[4],
apps/web/app/_shared/org-staff/org-staff-screen.tsx:150:                  background: themeVar.surfaceRaised,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:151:                  display: 'flex',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:152:                  flexWrap: 'wrap',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:153:                  gap: primitive.space[3],
apps/web/app/_shared/org-staff/org-staff-screen.tsx:154:                  alignItems: 'center',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:155:                  justifyContent: 'space-between',
apps/web/app/_shared/org-staff/org-staff-screen.tsx:156:                }}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:157:              >
apps/web/app/_shared/org-staff/org-staff-screen.tsx:158:                <div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:159:                  <div style={{ fontWeight: 600 }}>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:160:                    {/* A membership can outlive the directory read in one edge
apps/web/app/_shared/org-staff/org-staff-screen.tsx:161:                        case — a user suspended between the two requests — so the
apps/web/app/_shared/org-staff/org-staff-screen.tsx:162:                        name is never assumed to be there. */}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:163:                    {person?.displayName ?? 'Unknown user'}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:164:                    {isSelf ? (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:165:                      <span
apps/web/app/_shared/org-staff/org-staff-screen.tsx:166:                        style={{
apps/web/app/_shared/org-staff/org-staff-screen.tsx:167:                          marginLeft: primitive.space[2],
apps/web/app/_shared/org-staff/org-staff-screen.tsx:168:                          color: themeVar.textSecondary,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:169:                          fontWeight: 400,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:170:                          fontSize: primitive.fontSize.sm,
apps/web/app/_shared/org-staff/org-staff-screen.tsx:171:                        }}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:172:                      >
apps/web/app/_shared/org-staff/org-staff-screen.tsx:173:                        (you)
apps/web/app/_shared/org-staff/org-staff-screen.tsx:174:                      </span>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:175:                    ) : null}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:176:                  </div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:177:                  <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:178:                    {person?.email ?? '—'}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:179:                  </div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:180:                  {/* A suspended account holds a membership and cannot sign in.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:181:                      Marked rather than hidden: dropping them would make somebody
apps/web/app/_shared/org-staff/org-staff-screen.tsx:182:                      who still holds a membership invisible to the only screen
apps/web/app/_shared/org-staff/org-staff-screen.tsx:183:                      that can remove it. */}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:184:                  {person && person.status !== 'active' ? (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:185:                    <div
apps/web/app/_shared/org-staff/org-staff-screen.tsx:186:                      style={{ color: themeVar.statusAttention, fontSize: primitive.fontSize.xs }}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:187:                    >
apps/web/app/_shared/org-staff/org-staff-screen.tsx:188:                      account {person.status} — they cannot sign in
apps/web/app/_shared/org-staff/org-staff-screen.tsx:189:                    </div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:190:                  ) : null}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:191:                </div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:192:
apps/web/app/_shared/org-staff/org-staff-screen.tsx:193:                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:194:                  {/* `roleLabel` so the screen never shows raw snake_case. */}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:195:                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:196:                  {/*
apps/web/app/_shared/org-staff/org-staff-screen.tsx:197:                    🔴 NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it —
apps/web/app/_shared/org-staff/org-staff-screen.tsx:198:                    withdrawal is not self-referential there — and an
apps/web/app/_shared/org-staff/org-staff-screen.tsx:199:                    administrator who revoked their own membership would lose
apps/web/app/_shared/org-staff/org-staff-screen.tsx:200:                    access to the organisation they registered, with no screen
apps/web/app/_shared/org-staff/org-staff-screen.tsx:201:                    anywhere to undo it. For these two organisation types that is
apps/web/app/_shared/org-staff/org-staff-screen.tsx:202:                    worse than for a workshop: until 085 there was exactly one
apps/web/app/_shared/org-staff/org-staff-screen.tsx:203:                    member, so self-removal was an unrecoverable lockout of the
apps/web/app/_shared/org-staff/org-staff-screen.tsx:204:                    whole business. A control whose success is indistinguishable
apps/web/app/_shared/org-staff/org-staff-screen.tsx:205:                    from a lockout should not be offered.
apps/web/app/_shared/org-staff/org-staff-screen.tsx:206:                  */}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:207:                  {isSelf ? (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:208:                    <span
apps/web/app/_shared/org-staff/org-staff-screen.tsx:209:                      style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:210:                    >
apps/web/app/_shared/org-staff/org-staff-screen.tsx:211:                      cannot remove yourself
apps/web/app/_shared/org-staff/org-staff-screen.tsx:212:                    </span>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:213:                  ) : (
apps/web/app/_shared/org-staff/org-staff-screen.tsx:214:                    <WithdrawOrgMemberButton
apps/web/app/_shared/org-staff/org-staff-screen.tsx:215:                      action={withdrawAction}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:216:                      membershipId={m.id}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:217:                      name={person?.displayName ?? 'this person'}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:218:                      organisationNoun={organisationNoun}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:219:                    />
apps/web/app/_shared/org-staff/org-staff-screen.tsx:220:                  )}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:221:                </div>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:222:              </li>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:223:            );
apps/web/app/_shared/org-staff/org-staff-screen.tsx:224:          })}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:225:        </ul>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:226:      )}
apps/web/app/_shared/org-staff/org-staff-screen.tsx:227:    </>
apps/web/app/_shared/org-staff/org-staff-screen.tsx:228:  );
apps/web/app/_shared/org-staff/org-staff-screen.tsx:229:}

 succeeded in 838ms:
apps/api/src/identity/identity.controllers.ts:40:  list(@Req() req: AuthenticatedRequest, @Query('organizationId') organizationId?: string) {
apps/api/src/identity/identity.controllers.ts:41:    return this.branches.list(req.tenantContext, organizationId);
apps/api/src/identity/identity.controllers.ts:83:    @Query('organizationId') organizationId?: string,
apps/api/src/identity/identity.controllers.ts:85:    return this.memberships.list(req.tenantContext, { userId, organizationId });
apps/api/src/identity/identity.schemas.ts:27:  organizationId: uuid(),
apps/api/src/identity/identity.schemas.ts:55:  organizationId: uuid(),
apps/api/src/identity/membership.service.ts:18:  organizationId: string;
apps/api/src/identity/membership.service.ts:142:const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
apps/api/src/identity/membership.service.ts:193:  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
apps/api/src/identity/membership.service.ts:227:      if (filter.organizationId) {
apps/api/src/identity/membership.service.ts:228:        values.push(filter.organizationId);
apps/api/src/identity/membership.service.ts:249:  async grant(
apps/api/src/identity/membership.service.ts:255:      organizationId: string;
apps/api/src/identity/membership.service.ts:334:        [input.organizationId, ctx.tenantId],
apps/api/src/identity/membership.service.ts:388:          [input.branchId, input.organizationId, ctx.tenantId],
apps/api/src/identity/membership.service.ts:403:          input.organizationId,
apps/api/src/identity/membership.service.ts:449:          [ctx.userId, input.organizationId, userId, input.roleName, ctx.tenantId,
apps/api/src/identity/membership.service.ts:469:          organizationId: input.organizationId,
apps/api/src/identity/membership.service.ts:487:  async withdraw(
apps/api/src/identity/membership.service.ts:552:    organizationId: row.organization_id,

 succeeded in 911ms:
apps/web/app/insurance/settings/users/page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/web/app/insurance/settings/users/page.tsx:2:import { InsuranceStaffScreen } from '../../_screens/staff-screen';
apps/web/app/insurance/settings/users/page.tsx:3:
apps/web/app/insurance/settings/users/page.tsx:4:/**
apps/web/app/insurance/settings/users/page.tsx:5: * `/insurance/settings/users` — the insurance company's own people.
apps/web/app/insurance/settings/users/page.tsx:6: *
apps/web/app/insurance/settings/users/page.tsx:7: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps/web/app/insurance/settings/users/page.tsx:8: * this component executing and its output would still ship in the RSC payload —
apps/web/app/insurance/settings/users/page.tsx:9: * a recorded defect in this repository, found when a staff member could read
apps/web/app/insurance/settings/users/page.tsx:10: * customers' vehicles on a page that "was gated".
apps/web/app/insurance/settings/users/page.tsx:11: *
apps/web/app/insurance/settings/users/page.tsx:12: * The `settings` group is declared with `organization.admin`, which since
apps/web/app/insurance/settings/users/page.tsx:13: * migration 085 only `insurance_owner` holds inside an insurance company. So an
apps/web/app/insurance/settings/users/page.tsx:14: * assessor is refused here by the navigation contract, the API's
apps/web/app/insurance/settings/users/page.tsx:15: * `CAN_GRANT_MEMBERSHIP` refuses them again, and RLS scopes whatever survives to
apps/web/app/insurance/settings/users/page.tsx:16: * their own tenant — the three independent layers CLAUDE.md §8 requires.
apps/web/app/insurance/settings/users/page.tsx:17: */
apps/web/app/insurance/settings/users/page.tsx:18:export default async function Page() {
apps/web/app/insurance/settings/users/page.tsx:19:  await requireNavRoute('insurance', '/settings/users');
apps/web/app/insurance/settings/users/page.tsx:20:  return <InsuranceStaffScreen />;
apps/web/app/insurance/settings/users/page.tsx:21:}
apps/web/app/towing/_screens/staff-actions.ts:1:'use server';
apps/web/app/towing/_screens/staff-actions.ts:2:
apps/web/app/towing/_screens/staff-actions.ts:3:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/towing/_screens/staff-actions.ts:4:import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';
apps/web/app/towing/_screens/staff-actions.ts:5:
apps/web/app/towing/_screens/staff-actions.ts:6:/**
apps/web/app/towing/_screens/staff-actions.ts:7: * The towing pack's entry points into the shared org-staff actions.
apps/web/app/towing/_screens/staff-actions.ts:8: *
apps/web/app/towing/_screens/staff-actions.ts:9: * ⚠️ THIN ON PURPOSE — see the insurance equivalent. What belongs here is the
apps/web/app/towing/_screens/staff-actions.ts:10: * pair of values that must NOT come from the client: the workspace id and the
apps/web/app/towing/_screens/staff-actions.ts:11: * paths to revalidate.
apps/web/app/towing/_screens/staff-actions.ts:12: */
apps/web/app/towing/_screens/staff-actions.ts:13:
apps/web/app/towing/_screens/staff-actions.ts:14:/**
apps/web/app/towing/_screens/staff-actions.ts:15: * The towing tree has no separate "Users" entry — §52 gives it one `settings`
apps/web/app/towing/_screens/staff-actions.ts:16: * entry — so the people list lives on the settings page and that is the path
apps/web/app/towing/_screens/staff-actions.ts:17: * to revalidate. Adding a nav entry §52 does not define would be changing
apps/web/app/towing/_screens/staff-actions.ts:18: * approved navigation, which CLAUDE.md prohibits without review.
apps/web/app/towing/_screens/staff-actions.ts:19: */
apps/web/app/towing/_screens/staff-actions.ts:20:const REVALIDATE = ['/towing/operations/settings'] as const;
apps/web/app/towing/_screens/staff-actions.ts:21:
apps/web/app/towing/_screens/staff-actions.ts:22:export async function addTowingMemberAction(formData: FormData): Promise<ActionResult> {
apps/web/app/towing/_screens/staff-actions.ts:23:  return addOrgMember('towing', REVALIDATE, formData);
apps/web/app/towing/_screens/staff-actions.ts:24:}
apps/web/app/towing/_screens/staff-actions.ts:25:
apps/web/app/towing/_screens/staff-actions.ts:26:export async function withdrawTowingMemberAction(formData: FormData): Promise<ActionResult> {
apps/web/app/towing/_screens/staff-actions.ts:27:  return withdrawOrgMember('towing', REVALIDATE, formData);
apps/web/app/towing/_screens/staff-actions.ts:28:}
apps/web/app/insurance/_screens/staff-actions.ts:1:'use server';
apps/web/app/insurance/_screens/staff-actions.ts:2:
apps/web/app/insurance/_screens/staff-actions.ts:3:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/insurance/_screens/staff-actions.ts:4:import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';
apps/web/app/insurance/_screens/staff-actions.ts:5:
apps/web/app/insurance/_screens/staff-actions.ts:6:/**
apps/web/app/insurance/_screens/staff-actions.ts:7: * The insurance pack's entry points into the shared org-staff actions.
apps/web/app/insurance/_screens/staff-actions.ts:8: *
apps/web/app/insurance/_screens/staff-actions.ts:9: * ⚠️ THIN ON PURPOSE. The rules live once in `org-staff-core.ts`; what belongs
apps/web/app/insurance/_screens/staff-actions.ts:10: * here is the pair of values that must NOT come from the client: the workspace
apps/web/app/insurance/_screens/staff-actions.ts:11: * id (which decides the API credential and cookie scope) and the paths to
apps/web/app/insurance/_screens/staff-actions.ts:12: * revalidate. Binding them in a `'use server'` module makes them server-side
apps/web/app/insurance/_screens/staff-actions.ts:13: * constants rather than form fields.
apps/web/app/insurance/_screens/staff-actions.ts:14: */
apps/web/app/insurance/_screens/staff-actions.ts:15:
apps/web/app/insurance/_screens/staff-actions.ts:16:/** Every route that renders this organisation's people. */
apps/web/app/insurance/_screens/staff-actions.ts:17:const REVALIDATE = ['/insurance/settings/users'] as const;
apps/web/app/insurance/_screens/staff-actions.ts:18:
apps/web/app/insurance/_screens/staff-actions.ts:19:export async function addInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
apps/web/app/insurance/_screens/staff-actions.ts:20:  return addOrgMember('insurance', REVALIDATE, formData);
apps/web/app/insurance/_screens/staff-actions.ts:21:}
apps/web/app/insurance/_screens/staff-actions.ts:22:
apps/web/app/insurance/_screens/staff-actions.ts:23:export async function withdrawInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
apps/web/app/insurance/_screens/staff-actions.ts:24:  return withdrawOrgMember('insurance', REVALIDATE, formData);
apps/web/app/insurance/_screens/staff-actions.ts:25:}
apps/web/app/insurance/_screens/staff-screen.tsx:1:import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
apps/web/app/insurance/_screens/staff-screen.tsx:2:import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
apps/web/app/insurance/_screens/staff-screen.tsx:3:import { addInsuranceMemberAction, withdrawInsuranceMemberAction } from './staff-actions';
apps/web/app/insurance/_screens/staff-screen.tsx:4:
apps/web/app/insurance/_screens/staff-screen.tsx:5:/**
apps/web/app/insurance/_screens/staff-screen.tsx:6: * `/insurance/settings/users` — who works for this insurance company.
apps/web/app/insurance/_screens/staff-screen.tsx:7: *
apps/web/app/insurance/_screens/staff-screen.tsx:8: * 🔴 THE NAVIGATION HAS ADVERTISED THIS ENTRY AND THERE WAS NO PAGE. The
apps/web/app/insurance/_screens/staff-screen.tsx:9: * `settings` group is gated on `organization.admin`, a permission NO insurance
apps/web/app/insurance/_screens/staff-screen.tsx:10: * role held until migration 085 — so the entry was invisible to everyone, and
apps/web/app/insurance/_screens/staff-screen.tsx:11: * the moment 085 made it visible it fell through `[...slug]/page.tsx` to the
apps/web/app/insurance/_screens/staff-screen.tsx:12: * "not built yet" placeholder. That is why this screen ships in the same
apps/web/app/insurance/_screens/staff-screen.tsx:13: * session as the role.
apps/web/app/insurance/_screens/staff-screen.tsx:14: *
apps/web/app/insurance/_screens/staff-screen.tsx:15: * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.insurance_company` in
apps/web/app/insurance/_screens/staff-screen.tsx:16: * `membership.service.ts`. Offering a role the API will refuse is a form that
apps/web/app/insurance/_screens/staff-screen.tsx:17: * fails on submit, and `membership-role-fit.spec.ts` is what keeps the API side
apps/web/app/insurance/_screens/staff-screen.tsx:18: * honest. Two literals in two files cannot be type-checked into agreement — the
apps/web/app/insurance/_screens/staff-screen.tsx:19: * most-recorded root cause in this repository — so if a role is added there,
apps/web/app/insurance/_screens/staff-screen.tsx:20: * add it here.
apps/web/app/insurance/_screens/staff-screen.tsx:21: */
apps/web/app/insurance/_screens/staff-screen.tsx:22:
apps/web/app/insurance/_screens/staff-screen.tsx:23:const INSURANCE_ROLE_OPTIONS: readonly OrgRoleOption[] = [
apps/web/app/insurance/_screens/staff-screen.tsx:24:  {
apps/web/app/insurance/_screens/staff-screen.tsx:25:    value: 'insurance_assessor',
apps/web/app/insurance/_screens/staff-screen.tsx:26:    label: 'Assessor',
apps/web/app/insurance/_screens/staff-screen.tsx:27:    hint: 'Assesses claims, registers products and records policies sold',
apps/web/app/insurance/_screens/staff-screen.tsx:28:  },
apps/web/app/insurance/_screens/staff-screen.tsx:29:  {
apps/web/app/insurance/_screens/staff-screen.tsx:30:    value: 'insurance_owner',
apps/web/app/insurance/_screens/staff-screen.tsx:31:    label: 'Administrator',
apps/web/app/insurance/_screens/staff-screen.tsx:32:    hint: 'Full control of this company, including appointing and removing people',
apps/web/app/insurance/_screens/staff-screen.tsx:33:  },
apps/web/app/insurance/_screens/staff-screen.tsx:34:];
apps/web/app/insurance/_screens/staff-screen.tsx:35:
apps/web/app/insurance/_screens/staff-screen.tsx:36:export function InsuranceStaffScreen() {
apps/web/app/insurance/_screens/staff-screen.tsx:37:  return (
apps/web/app/insurance/_screens/staff-screen.tsx:38:    <OrgStaffScreen
apps/web/app/insurance/_screens/staff-screen.tsx:39:      workspaceId="insurance"
apps/web/app/insurance/_screens/staff-screen.tsx:40:      title="Users"
apps/web/app/insurance/_screens/staff-screen.tsx:41:      description="Everyone with access to this insurance company, and what they may do. Adding someone gives them access immediately; a 
suspended account is marked and cannot sign in."
apps/web/app/insurance/_screens/staff-screen.tsx:42:      organisationNoun="insurance company"
apps/web/app/insurance/_screens/staff-screen.tsx:43:      roles={INSURANCE_ROLE_OPTIONS}
apps/web/app/insurance/_screens/staff-screen.tsx:44:      addAction={addInsuranceMemberAction}
apps/web/app/insurance/_screens/staff-screen.tsx:45:      withdrawAction={withdrawInsuranceMemberAction}
apps/web/app/insurance/_screens/staff-screen.tsx:46:    />
apps/web/app/insurance/_screens/staff-screen.tsx:47:  );
apps/web/app/insurance/_screens/staff-screen.tsx:48:}
apps/web/app/towing/_screens/staff-section.tsx:1:import { OrgStaffScreen } from '../../_shared/org-staff/org-staff-screen';
apps/web/app/towing/_screens/staff-section.tsx:2:import type { OrgRoleOption } from '../../_shared/org-staff/org-staff-screen';
apps/web/app/towing/_screens/staff-section.tsx:3:import { addTowingMemberAction, withdrawTowingMemberAction } from './staff-actions';
apps/web/app/towing/_screens/staff-section.tsx:4:
apps/web/app/towing/_screens/staff-section.tsx:5:/**
apps/web/app/towing/_screens/staff-section.tsx:6: * Who works for this towing company — rendered inside `/operations/settings`.
apps/web/app/towing/_screens/staff-section.tsx:7: *
apps/web/app/towing/_screens/staff-section.tsx:8: * 🔴 WHY IT IS A SECTION AND NOT ITS OWN ROUTE. `02.txt` §52 defines ONE
apps/web/app/towing/_screens/staff-section.tsx:9: * settings entry for the towing tree, and CLAUDE.md lists "changing approved
apps/web/app/towing/_screens/staff-section.tsx:10: * navigation without review" among the prohibited actions. Inventing a `users`
apps/web/app/towing/_screens/staff-section.tsx:11: * entry to match the insurance tree would be exactly that. The settings entry is
apps/web/app/towing/_screens/staff-section.tsx:12: * already gated on `organization.admin` — the permission `towing_owner` gained
apps/web/app/towing/_screens/staff-section.tsx:13: * in migration 085 — so this is the correct home for it under the approved
apps/web/app/towing/_screens/staff-section.tsx:14: * navigation, and no nav change is needed.
apps/web/app/towing/_screens/staff-section.tsx:15: *
apps/web/app/towing/_screens/staff-section.tsx:16: * ⚠️ THE ROLES MUST MATCH `ROLES_BY_ORG_TYPE.towing_company` in
apps/web/app/towing/_screens/staff-section.tsx:17: * `membership.service.ts`. Offering a role the API will refuse is a form that
apps/web/app/towing/_screens/staff-section.tsx:18: * fails on submit.
apps/web/app/towing/_screens/staff-section.tsx:19: */
apps/web/app/towing/_screens/staff-section.tsx:20:
apps/web/app/towing/_screens/staff-section.tsx:21:const TOWING_ROLE_OPTIONS: readonly OrgRoleOption[] = [
apps/web/app/towing/_screens/staff-section.tsx:22:  {
apps/web/app/towing/_screens/staff-section.tsx:23:    value: 'towing_operator',
apps/web/app/towing/_screens/staff-section.tsx:24:    label: 'Operator',
apps/web/app/towing/_screens/staff-section.tsx:25:    hint: 'Takes requests, runs the dispatch board and manages drivers and vehicles',
apps/web/app/towing/_screens/staff-section.tsx:26:  },
apps/web/app/towing/_screens/staff-section.tsx:27:  {
apps/web/app/towing/_screens/staff-section.tsx:28:    value: 'towing_owner',
apps/web/app/towing/_screens/staff-section.tsx:29:    label: 'Administrator',
apps/web/app/towing/_screens/staff-section.tsx:30:    hint: 'Full control of this company, including appointing people, rates and invoices',
apps/web/app/towing/_screens/staff-section.tsx:31:  },
apps/web/app/towing/_screens/staff-section.tsx:32:];
apps/web/app/towing/_screens/staff-section.tsx:33:
apps/web/app/towing/_screens/staff-section.tsx:34:export function TowingStaffSection() {
apps/web/app/towing/_screens/staff-section.tsx:35:  return (
apps/web/app/towing/_screens/staff-section.tsx:36:    <OrgStaffScreen
apps/web/app/towing/_screens/staff-section.tsx:37:      workspaceId="towing"
apps/web/app/towing/_screens/staff-section.tsx:38:      title="People"
apps/web/app/towing/_screens/staff-section.tsx:39:      description="Everyone with access to this towing company, and what they may do. Adding someone gives them access immediately; a suspended 
account is marked and cannot sign in."
apps/web/app/towing/_screens/staff-section.tsx:40:      organisationNoun="towing company"
apps/web/app/towing/_screens/staff-section.tsx:41:      roles={TOWING_ROLE_OPTIONS}
apps/web/app/towing/_screens/staff-section.tsx:42:      addAction={addTowingMemberAction}
apps/web/app/towing/_screens/staff-section.tsx:43:      withdrawAction={withdrawTowingMemberAction}
apps/web/app/towing/_screens/staff-section.tsx:44:    />
apps/web/app/towing/_screens/staff-section.tsx:45:  );
apps/web/app/towing/_screens/staff-section.tsx:46:}
apps/web/app/towing/operations/settings/page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/web/app/towing/operations/settings/page.tsx:2:import { SettingsScreen } from '../../_screens/settings-screen';
apps/web/app/towing/operations/settings/page.tsx:3:import { TowingStaffSection } from '../../_screens/staff-section';
apps/web/app/towing/operations/settings/page.tsx:4:
apps/web/app/towing/operations/settings/page.tsx:5:/**
apps/web/app/towing/operations/settings/page.tsx:6: * `/operations/settings` — the rates every invoice is priced from.
apps/web/app/towing/operations/settings/page.tsx:7: *
apps/web/app/towing/operations/settings/page.tsx:8: * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
apps/web/app/towing/operations/settings/page.tsx:9: * this component executing and its output would still ship in the RSC payload —
apps/web/app/towing/operations/settings/page.tsx:10: * a recorded defect in this repository, found when a staff member could read
apps/web/app/towing/operations/settings/page.tsx:11: * customers' vehicles on a page that "was gated".
apps/web/app/towing/operations/settings/page.tsx:12: */
apps/web/app/towing/operations/settings/page.tsx:13:export default async function Page() {
apps/web/app/towing/operations/settings/page.tsx:14:  await requireNavRoute('towing', '/operations/settings');
apps/web/app/towing/operations/settings/page.tsx:15:  return (
apps/web/app/towing/operations/settings/page.tsx:16:    <>
apps/web/app/towing/operations/settings/page.tsx:17:      <SettingsScreen />
apps/web/app/towing/operations/settings/page.tsx:18:      {/*
apps/web/app/towing/operations/settings/page.tsx:19:        🔴 THE PEOPLE SECTION — the towing half of what migration 085 unblocked.
apps/web/app/towing/operations/settings/page.tsx:20:        Until 085 a towing company had exactly one member, its founder, and no
apps/web/app/towing/operations/settings/page.tsx:21:        way to appoint a second; the grant authority 085 created then had no
apps/web/app/towing/operations/settings/page.tsx:22:        caller until this shipped.
apps/web/app/towing/operations/settings/page.tsx:23:
apps/web/app/towing/operations/settings/page.tsx:24:        Rendered here rather than at its own route because §52 defines ONE
apps/web/app/towing/operations/settings/page.tsx:25:        settings entry for this tree, and this route already carries the
apps/web/app/towing/operations/settings/page.tsx:26:        `organization.admin` gate that `towing_owner` newly satisfies.
apps/web/app/towing/operations/settings/page.tsx:27:      */}
apps/web/app/towing/operations/settings/page.tsx:28:      <TowingStaffSection />
apps/web/app/towing/operations/settings/page.tsx:29:    </>
apps/web/app/towing/operations/settings/page.tsx:30:  );
apps/web/app/towing/operations/settings/page.tsx:31:}

 succeeded in 1047ms:
apps/web/app\_shared\org-staff\org-staff-screen.tsx
apps/web/app\workshop\_screens\staff-screen.tsx
apps/web/app\workshop\_screens\staff-actions.ts
apps/web/app\workshop\[...slug]\page.tsx
apps/web/app\fleet\[...slug]\page.tsx
apps/web/app\insurance\_screens\staff-screen.tsx
apps/web/app\insurance\_screens\staff-actions.ts
apps/web/app\customer\(app)\[...slug]\page.tsx
apps/web/app\insurance\[...slug]\page.tsx
apps/web/app\towing\_screens\staff-actions.ts
apps/web/app\towing\[...slug]\page.tsx
apps/web/app\supplier\[...slug]\page.tsx
apps/web/app\admin\[...slug]\page.tsx

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/web/app/_shared/org-staff/org-staff-screen.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt 
$c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/web/app/_shared/org-staff/org-staff-form.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt 
$c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/api/src/identity/membership.service.ts'; "'$c=Get-Content $p; foreach($r in 
@(@(130,180),@(185,245),@(249,485),@(487,570))){for($i=$r[0]-1;$i -lt $r[1];$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }}' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content -Raw apps/web/app/workshop/_screens/staff-actions.ts; Get-Content -Raw 
apps/web/app/workshop/_screens/staff-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T18:22:02.107006Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 
'$p='"'apps/web/app/_shared/org-staff/org-staff-screen.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt $c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/web/app/_shared/org-staff/org-staff-screen.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt 
$c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/web/app/_shared/org-staff/org-staff-form.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt 
$c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '$p='"'apps/api/src/identity/membership.service.ts'; "'$c=Get-Content $p; foreach($r in 
@(@(130,180),@(185,245),@(249,485),@(487,570))){for($i=$r[0]-1;$i -lt $r[1];$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }}'` rejected: blocked by policy
2026-08-17T18:22:02.107665Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 
'$p='"'apps/web/app/_shared/org-staff/org-staff-form.tsx'; "'$c=Get-Content $p; for($i=0;$i -lt $c.Count;$i++){ '"'{0}:{1}' -f ("'$i+1),$c[$i] }'` rejected: blocked by policy
2026-08-17T18:22:02.108627Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 
'$p='"'apps/api/src/identity/membership.service.ts'; "'$c=Get-Content $p; foreach($r in @(@(130,180),@(185,245),@(249,485),@(487,570))){for($i=$r[0]-1;$i -lt $r[1];$i++){ '"'{0}:{1}' -f 
("'$i+1),$c[$i] }}'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/web/app/_shared/org-staff/org-staff-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/web/app/_shared/org-staff/org-staff-form.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/api/src/identity/membership.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/web/app/workshop/_screens/staff-actions.ts apps/web/app/workshop/_screens/staff-screen.tsx' 
in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 974ms:
apps/web/app/workshop/_screens/staff-actions.ts:1:'use server';
apps/web/app/workshop/_screens/staff-actions.ts:2:
apps/web/app/workshop/_screens/staff-actions.ts:3:import { revalidatePath } from 'next/cache';
apps/web/app/workshop/_screens/staff-actions.ts:4:import { apiPatch, apiPost, currentViewer } from '@autoworkshop/next-shell';
apps/web/app/workshop/_screens/staff-actions.ts:5:import type { ActionResult } from '@autoworkshop/ui';
apps/web/app/workshop/_screens/staff-actions.ts:6:
apps/web/app/workshop/_screens/staff-actions.ts:7:/**
apps/web/app/workshop/_screens/staff-actions.ts:8: * Adding and removing workshop staff — `07.txt` pt2 §50.
apps/web/app/workshop/_screens/staff-actions.ts:9: *
apps/web/app/workshop/_screens/staff-actions.ts:10: * ── 🔴 WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
apps/web/app/workshop/_screens/staff-actions.ts:11: *
apps/web/app/workshop/_screens/staff-actions.ts:12: * `MembershipService.grant()` has been complete since Phase 2 — role gate,
apps/web/app/workshop/_screens/staff-actions.ts:13: * tenant check, branch check, audit — and until now it had **no reachable
apps/web/app/workshop/_screens/staff-actions.ts:14: * caller**. It took a `userId`, and the only source of one is `GET /users`,
apps/web/app/workshop/_screens/staff-actions.ts:15: * which is driven FROM `identity.memberships` and therefore lists people who
apps/web/app/workshop/_screens/staff-actions.ts:16: * are ALREADY members. So there was no path, from any screen that could exist,
apps/web/app/workshop/_screens/staff-actions.ts:17: * to add a colleague. A workshop owner could not hire anybody.
apps/web/app/workshop/_screens/staff-actions.ts:18: *
apps/web/app/workshop/_screens/staff-actions.ts:19: * The same shape as Solar's `link_sponsor_user()`, which also had no caller
apps/web/app/workshop/_screens/staff-actions.ts:20: * outside its tests and made third-level approval unreachable. A capability
apps/web/app/workshop/_screens/staff-actions.ts:21: * with no way in is not a feature, it is a wall.
apps/web/app/workshop/_screens/staff-actions.ts:22: *
apps/web/app/workshop/_screens/staff-actions.ts:23: * The API now accepts `userEmail` and resolves it server-side, which is why
apps/web/app/workshop/_screens/staff-actions.ts:24: * this action sends an address and never a uuid.
apps/web/app/workshop/_screens/staff-actions.ts:25: */
apps/web/app/workshop/_screens/staff-actions.ts:26:
apps/web/app/workshop/_screens/staff-actions.ts:27:/** Add a colleague to this workshop. */
apps/web/app/workshop/_screens/staff-actions.ts:28:export async function addStaffAction(formData: FormData): Promise<ActionResult> {
apps/web/app/workshop/_screens/staff-actions.ts:29:  const read = (k: string) => {
apps/web/app/workshop/_screens/staff-actions.ts:30:    const v = String(formData.get(k) ?? '').trim();
apps/web/app/workshop/_screens/staff-actions.ts:31:    return v === '' ? undefined : v;
apps/web/app/workshop/_screens/staff-actions.ts:32:  };
apps/web/app/workshop/_screens/staff-actions.ts:33:
apps/web/app/workshop/_screens/staff-actions.ts:34:  // ⚠️ THE ORGANISATION COMES FROM THE SESSION, NEVER FROM THE FORM. A hidden
apps/web/app/workshop/_screens/staff-actions.ts:35:  // field would let a caller grant a membership into another organisation they
apps/web/app/workshop/_screens/staff-actions.ts:36:  // happen to know the id of — and `grant()` does re-check it against the
apps/web/app/workshop/_screens/staff-actions.ts:37:  // active tenant, but a form that offers the value at all invites the attempt
apps/web/app/workshop/_screens/staff-actions.ts:38:  // and would 404 confusingly when it failed.
apps/web/app/workshop/_screens/staff-actions.ts:39:  const viewer = await currentViewer('workshop');
apps/web/app/workshop/_screens/staff-actions.ts:40:  if (!viewer) return { error: 'Your session has ended. Sign in again, then retry.' };
apps/web/app/workshop/_screens/staff-actions.ts:41:
apps/web/app/workshop/_screens/staff-actions.ts:42:  const result = await apiPost('workshop', '/memberships', {
apps/web/app/workshop/_screens/staff-actions.ts:43:    userEmail: read('userEmail'),
apps/web/app/workshop/_screens/staff-actions.ts:44:    organizationId: viewer.organizationId,
apps/web/app/workshop/_screens/staff-actions.ts:45:    roleName: read('roleName'),
apps/web/app/workshop/_screens/staff-actions.ts:46:  });
apps/web/app/workshop/_screens/staff-actions.ts:47:
apps/web/app/workshop/_screens/staff-actions.ts:48:  if (!result.ok) {
apps/web/app/workshop/_screens/staff-actions.ts:49:    const error =
apps/web/app/workshop/_screens/staff-actions.ts:50:      result.reason === 'invalid'
apps/web/app/workshop/_screens/staff-actions.ts:51:        ? (result.message ?? 'Those details were not accepted. Check the email and role.')
apps/web/app/workshop/_screens/staff-actions.ts:52:        : result.reason === 'forbidden'
apps/web/app/workshop/_screens/staff-actions.ts:53:          ? (result.message ?? 'Your role may not add staff. Only a workshop owner can.')
apps/web/app/workshop/_screens/staff-actions.ts:54:          : result.reason === 'unauthenticated'
apps/web/app/workshop/_screens/staff-actions.ts:55:            ? 'Your session has ended. Sign in again, then retry.'
apps/web/app/workshop/_screens/staff-actions.ts:56:            : result.reason === 'notFound'
apps/web/app/workshop/_screens/staff-actions.ts:57:              ? // The API's own sentence names the way forward — "ask them to
apps/web/app/workshop/_screens/staff-actions.ts:58:                // sign up first" — and inventing a vaguer one here would turn a
apps/web/app/workshop/_screens/staff-actions.ts:59:                // solvable refusal into a dead end.
apps/web/app/workshop/_screens/staff-actions.ts:60:                (result.message ??
apps/web/app/workshop/_screens/staff-actions.ts:61:                'No account with that email address. Ask them to sign up first.')
apps/web/app/workshop/_screens/staff-actions.ts:62:              : 'The service did not respond. Nothing has been changed — try again shortly.';
apps/web/app/workshop/_screens/staff-actions.ts:63:    return { error };
apps/web/app/workshop/_screens/staff-actions.ts:64:  }
apps/web/app/workshop/_screens/staff-actions.ts:65:
apps/web/app/workshop/_screens/staff-actions.ts:66:  for (const path of ['/workshop-management/staff', '/settings/staff-and-roles']) {
apps/web/app/workshop/_screens/staff-actions.ts:67:    revalidatePath(path);
apps/web/app/workshop/_screens/staff-actions.ts:68:  }
apps/web/app/workshop/_screens/staff-actions.ts:69:  return { created: 'Added. They can sign in and will see this workshop immediately.' };
apps/web/app/workshop/_screens/staff-actions.ts:70:}
apps/web/app/workshop/_screens/staff-actions.ts:71:
apps/web/app/workshop/_screens/staff-actions.ts:72:/**
apps/web/app/workshop/_screens/staff-actions.ts:73: * Remove someone's access.
apps/web/app/workshop/_screens/staff-actions.ts:74: *
apps/web/app/workshop/_screens/staff-actions.ts:75: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps/web/app/workshop/_screens/staff-actions.ts:76: * that "was this person ever granted access, and by whom?" stays answerable —
apps/web/app/workshop/_screens/staff-actions.ts:77: * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
apps/web/app/workshop/_screens/staff-actions.ts:78: */
apps/web/app/workshop/_screens/staff-actions.ts:79:export async function withdrawStaffAction(formData: FormData): Promise<ActionResult> {
apps/web/app/workshop/_screens/staff-actions.ts:80:  const membershipId = String(formData.get('membershipId') ?? '').trim();
apps/web/app/workshop/_screens/staff-actions.ts:81:  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };
apps/web/app/workshop/_screens/staff-actions.ts:82:
apps/web/app/workshop/_screens/staff-actions.ts:83:  const result = await apiPatch('workshop', `/memberships/${membershipId}/status`, {
apps/web/app/workshop/_screens/staff-actions.ts:84:    // `revoked`, not `suspended`: this button is "remove", and suspension is a
apps/web/app/workshop/_screens/staff-actions.ts:85:    // different decision that deserves its own control rather than being what
apps/web/app/workshop/_screens/staff-actions.ts:86:    // "remove" quietly does.
apps/web/app/workshop/_screens/staff-actions.ts:87:    status: 'revoked',
apps/web/app/workshop/_screens/staff-actions.ts:88:  });
apps/web/app/workshop/_screens/staff-actions.ts:89:
apps/web/app/workshop/_screens/staff-actions.ts:90:  if (!result.ok) {
apps/web/app/workshop/_screens/staff-actions.ts:91:    const error =
apps/web/app/workshop/_screens/staff-actions.ts:92:      result.reason === 'invalid'
apps/web/app/workshop/_screens/staff-actions.ts:93:        ? (result.message ?? 'That change was not accepted.')
apps/web/app/workshop/_screens/staff-actions.ts:94:        : result.reason === 'forbidden'
apps/web/app/workshop/_screens/staff-actions.ts:95:          ? (result.message ?? 'Your role may not change staff access.')
apps/web/app/workshop/_screens/staff-actions.ts:96:          : result.reason === 'unauthenticated'
apps/web/app/workshop/_screens/staff-actions.ts:97:            ? 'Your session has ended. Sign in again, then retry.'
apps/web/app/workshop/_screens/staff-actions.ts:98:            : result.reason === 'notFound'
apps/web/app/workshop/_screens/staff-actions.ts:99:              ? 'That membership no longer exists. Reload the page.'
apps/web/app/workshop/_screens/staff-actions.ts:100:              : 'The service did not respond. Nothing has been changed — try again shortly.';
apps/web/app/workshop/_screens/staff-actions.ts:101:    return { error };
apps/web/app/workshop/_screens/staff-actions.ts:102:  }
apps/web/app/workshop/_screens/staff-actions.ts:103:
apps/web/app/workshop/_screens/staff-actions.ts:104:  for (const path of ['/workshop-management/staff', '/settings/staff-and-roles']) {
apps/web/app/workshop/_screens/staff-actions.ts:105:    revalidatePath(path);
apps/web/app/workshop/_screens/staff-actions.ts:106:  }
apps/web/app/workshop/_screens/staff-actions.ts:107:  return { created: 'Removed. They can no longer see this workshop.' };
apps/web/app/workshop/_screens/staff-actions.ts:108:}
apps/web/app/workshop/_screens/staff-screen.tsx:1:import { Suspense } from 'react';
apps/web/app/workshop/_screens/staff-screen.tsx:2:import { ApiFailure, apiGet, currentViewer } from '@autoworkshop/next-shell';
apps/web/app/workshop/_screens/staff-screen.tsx:3:import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
apps/web/app/workshop/_screens/staff-screen.tsx:4:import { primitive, themeVar } from '@autoworkshop/design-tokens';
apps/web/app/workshop/_screens/staff-screen.tsx:5:import { roleLabel } from '@autoworkshop/next-shell';
apps/web/app/workshop/_screens/staff-screen.tsx:6:import { AddStaffForm, WithdrawStaffButton } from './staff-form';
apps/web/app/workshop/_screens/staff-screen.tsx:7:
apps/web/app/workshop/_screens/staff-screen.tsx:8:/**
apps/web/app/workshop/_screens/staff-screen.tsx:9: * Workshop staff — `07.txt` pt2 §50, mounted at the owner tree's
apps/web/app/workshop/_screens/staff-screen.tsx:10: * `/workshop-management/staff` and the default tree's `/settings/staff-and-roles`.
apps/web/app/workshop/_screens/staff-screen.tsx:11: *
apps/web/app/workshop/_screens/staff-screen.tsx:12: * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
apps/web/app/workshop/_screens/staff-screen.tsx:13: *
apps/web/app/workshop/_screens/staff-screen.tsx:14: * The navigation has advertised "Staff" since Phase 3 and there was no page.
apps/web/app/workshop/_screens/staff-screen.tsx:15: * More than cosmetic: `MembershipService.grant()` took a `userId`, and the only
apps/web/app/workshop/_screens/staff-screen.tsx:16: * source of one is `GET /users`, which lists people who are ALREADY members —
apps/web/app/workshop/_screens/staff-screen.tsx:17: * so the platform's privilege-granting operation had no reachable caller and a
apps/web/app/workshop/_screens/staff-screen.tsx:18: * workshop owner could not add a single colleague.
apps/web/app/workshop/_screens/staff-screen.tsx:19: *
apps/web/app/workshop/_screens/staff-screen.tsx:20: * ⚠️ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
apps/web/app/workshop/_screens/staff-screen.tsx:21: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps/web/app/workshop/_screens/staff-screen.tsx:22: * are tenant-scoped server-side and RLS is under both; joining them here is
apps/web/app/workshop/_screens/staff-screen.tsx:23: * presentation (CLAUDE.md §8).
apps/web/app/workshop/_screens/staff-screen.tsx:24: */
apps/web/app/workshop/_screens/staff-screen.tsx:25:
apps/web/app/workshop/_screens/staff-screen.tsx:26:export const dynamic = 'force-dynamic';
apps/web/app/workshop/_screens/staff-screen.tsx:27:
apps/web/app/workshop/_screens/staff-screen.tsx:28:/** Field names taken from `TenantUser` in the API — never guessed. */
apps/web/app/workshop/_screens/staff-screen.tsx:29:interface UserRow {
apps/web/app/workshop/_screens/staff-screen.tsx:30:  id: string;
apps/web/app/workshop/_screens/staff-screen.tsx:31:  email: string;
apps/web/app/workshop/_screens/staff-screen.tsx:32:  displayName: string;
apps/web/app/workshop/_screens/staff-screen.tsx:33:  phone: string | null;
apps/web/app/workshop/_screens/staff-screen.tsx:34:  status: string;
apps/web/app/workshop/_screens/staff-screen.tsx:35:  roles: string[];
apps/web/app/workshop/_screens/staff-screen.tsx:36:}
apps/web/app/workshop/_screens/staff-screen.tsx:37:
apps/web/app/workshop/_screens/staff-screen.tsx:38:/** Field names taken from `Membership` in the API. */
apps/web/app/workshop/_screens/staff-screen.tsx:39:interface MembershipRow {
apps/web/app/workshop/_screens/staff-screen.tsx:40:  id: string;
apps/web/app/workshop/_screens/staff-screen.tsx:41:  organizationId: string;
apps/web/app/workshop/_screens/staff-screen.tsx:42:  branchId: string | null;
apps/web/app/workshop/_screens/staff-screen.tsx:43:  userId: string;
apps/web/app/workshop/_screens/staff-screen.tsx:44:  roleName: string;
apps/web/app/workshop/_screens/staff-screen.tsx:45:  status: 'active' | 'suspended' | 'revoked';
apps/web/app/workshop/_screens/staff-screen.tsx:46:}
apps/web/app/workshop/_screens/staff-screen.tsx:47:
apps/web/app/workshop/_screens/staff-screen.tsx:48:export function StaffScreen() {
apps/web/app/workshop/_screens/staff-screen.tsx:49:  return (
apps/web/app/workshop/_screens/staff-screen.tsx:50:    <>
apps/web/app/workshop/_screens/staff-screen.tsx:51:      <PageHeader
apps/web/app/workshop/_screens/staff-screen.tsx:52:        title="Staff"
apps/web/app/workshop/_screens/staff-screen.tsx:53:        description="Everyone with access to this workshop, and what they may do. Adding someone gives them access immediately; a suspended 
account is marked and cannot sign in."
apps/web/app/workshop/_screens/staff-screen.tsx:54:      />
apps/web/app/workshop/_screens/staff-screen.tsx:55:      <Suspense fallback={<LoadingState label="Loading your staff…" />}>
apps/web/app/workshop/_screens/staff-screen.tsx:56:        <StaffList />
apps/web/app/workshop/_screens/staff-screen.tsx:57:      </Suspense>
apps/web/app/workshop/_screens/staff-screen.tsx:58:    </>
apps/web/app/workshop/_screens/staff-screen.tsx:59:  );
apps/web/app/workshop/_screens/staff-screen.tsx:60:}
apps/web/app/workshop/_screens/staff-screen.tsx:61:
apps/web/app/workshop/_screens/staff-screen.tsx:62:async function StaffList() {
apps/web/app/workshop/_screens/staff-screen.tsx:63:  const viewer = await currentViewer('workshop');
apps/web/app/workshop/_screens/staff-screen.tsx:64:  /*
apps/web/app/workshop/_screens/staff-screen.tsx:65:    🔴 SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT.
apps/web/app/workshop/_screens/staff-screen.tsx:66:
apps/web/app/workshop/_screens/staff-screen.tsx:67:    `/memberships` unfiltered returns every membership in the tenant, and a
apps/web/app/workshop/_screens/staff-screen.tsx:68:    tenant may hold several organisations — the dev data has Alpha Motors and
apps/web/app/workshop/_screens/staff-screen.tsx:69:    Alpha Parts Supply. Reception staff belong to both, so this page listed them
apps/web/app/workshop/_screens/staff-screen.tsx:70:    TWICE while promising "everyone who can sign in to this workshop". A page
apps/web/app/workshop/_screens/staff-screen.tsx:71:    that over-reports who has access to your workshop is worse than one that
apps/web/app/workshop/_screens/staff-screen.tsx:72:    says nothing, and the duplicate made it look like a data bug.
apps/web/app/workshop/_screens/staff-screen.tsx:73:
apps/web/app/workshop/_screens/staff-screen.tsx:74:    Found by reading the rendered list, not by any test — the same lesson as
apps/web/app/workshop/_screens/staff-screen.tsx:75:    every other defect in this session.
apps/web/app/workshop/_screens/staff-screen.tsx:76:  */
apps/web/app/workshop/_screens/staff-screen.tsx:77:  const orgFilter = viewer?.organizationId
apps/web/app/workshop/_screens/staff-screen.tsx:78:    ? `?organizationId=${encodeURIComponent(viewer.organizationId)}`
apps/web/app/workshop/_screens/staff-screen.tsx:79:    : '';
apps/web/app/workshop/_screens/staff-screen.tsx:80:  const [users, memberships] = await Promise.all([
apps/web/app/workshop/_screens/staff-screen.tsx:81:    apiGet<UserRow[]>('workshop', '/users'),
apps/web/app/workshop/_screens/staff-screen.tsx:82:    apiGet<MembershipRow[]>('workshop', `/memberships${orgFilter}`),
apps/web/app/workshop/_screens/staff-screen.tsx:83:  ]);
apps/web/app/workshop/_screens/staff-screen.tsx:84:
apps/web/app/workshop/_screens/staff-screen.tsx:85:  if (!users.ok) return <ApiFailure reason={users.reason} workspaceId="workshop" />;
apps/web/app/workshop/_screens/staff-screen.tsx:86:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId="workshop" />;
apps/web/app/workshop/_screens/staff-screen.tsx:87:
apps/web/app/workshop/_screens/staff-screen.tsx:88:  const byUser = new Map(users.data.map((u) => [u.id, u]));
apps/web/app/workshop/_screens/staff-screen.tsx:89:  // Active memberships only. A revoked one is kept in the database so that "was
apps/web/app/workshop/_screens/staff-screen.tsx:90:  // this person ever granted access?" stays answerable, and showing it in a
apps/web/app/workshop/_screens/staff-screen.tsx:91:  // staff LIST would read as though they still work here.
apps/web/app/workshop/_screens/staff-screen.tsx:92:  const active = memberships.data.filter((m) => m.status === 'active');
apps/web/app/workshop/_screens/staff-screen.tsx:93:
apps/web/app/workshop/_screens/staff-screen.tsx:94:  return (
apps/web/app/workshop/_screens/staff-screen.tsx:95:    <>
apps/web/app/workshop/_screens/staff-screen.tsx:96:      {/*
apps/web/app/workshop/_screens/staff-screen.tsx:97:        The form FIRST, because on an empty workshop the whole point of this
apps/web/app/workshop/_screens/staff-screen.tsx:98:        page is to add somebody, and a form under an empty state is a form
apps/web/app/workshop/_screens/staff-screen.tsx:99:        nobody finds.
apps/web/app/workshop/_screens/staff-screen.tsx:100:      */}
apps/web/app/workshop/_screens/staff-screen.tsx:101:      <AddStaffForm />
apps/web/app/workshop/_screens/staff-screen.tsx:102:
apps/web/app/workshop/_screens/staff-screen.tsx:103:      {active.length === 0 ? (
apps/web/app/workshop/_screens/staff-screen.tsx:104:        <EmptyState
apps/web/app/workshop/_screens/staff-screen.tsx:105:          title="Nobody else has access yet"
apps/web/app/workshop/_screens/staff-screen.tsx:106:          description="Add a colleague by their email address above. They need an account first — ask them to sign up, then add them here."
apps/web/app/workshop/_screens/staff-screen.tsx:107:        />
apps/web/app/workshop/_screens/staff-screen.tsx:108:      ) : (
apps/web/app/workshop/_screens/staff-screen.tsx:109:        <ul
apps/web/app/workshop/_screens/staff-screen.tsx:110:          style={{
apps/web/app/workshop/_screens/staff-screen.tsx:111:            listStyle: 'none',
apps/web/app/workshop/_screens/staff-screen.tsx:112:            margin: `${primitive.space[6]} 0 0`,
apps/web/app/workshop/_screens/staff-screen.tsx:113:            padding: 0,
apps/web/app/workshop/_screens/staff-screen.tsx:114:            display: 'grid',
apps/web/app/workshop/_screens/staff-screen.tsx:115:            gap: primitive.space[3],
apps/web/app/workshop/_screens/staff-screen.tsx:116:          }}
apps/web/app/workshop/_screens/staff-screen.tsx:117:        >
apps/web/app/workshop/_screens/staff-screen.tsx:118:          {active.map((m) => {
apps/web/app/workshop/_screens/staff-screen.tsx:119:            const person = byUser.get(m.userId);
apps/web/app/workshop/_screens/staff-screen.tsx:120:            const isSelf = viewer?.userId === m.userId;
apps/web/app/workshop/_screens/staff-screen.tsx:121:            return (
apps/web/app/workshop/_screens/staff-screen.tsx:122:              <li
apps/web/app/workshop/_screens/staff-screen.tsx:123:                key={m.id}
apps/web/app/workshop/_screens/staff-screen.tsx:124:                style={{
apps/web/app/workshop/_screens/staff-screen.tsx:125:                  border: `1px solid ${themeVar.borderDefault}`,
apps/web/app/workshop/_screens/staff-screen.tsx:126:                  borderRadius: primitive.radius.xl,
apps/web/app/workshop/_screens/staff-screen.tsx:127:                  padding: primitive.space[4],
apps/web/app/workshop/_screens/staff-screen.tsx:128:                  background: themeVar.surfaceRaised,
apps/web/app/workshop/_screens/staff-screen.tsx:129:                  display: 'flex',
apps/web/app/workshop/_screens/staff-screen.tsx:130:                  flexWrap: 'wrap',
apps/web/app/workshop/_screens/staff-screen.tsx:131:                  gap: primitive.space[3],
apps/web/app/workshop/_screens/staff-screen.tsx:132:                  alignItems: 'center',
apps/web/app/workshop/_screens/staff-screen.tsx:133:                  justifyContent: 'space-between',
apps/web/app/workshop/_screens/staff-screen.tsx:134:                }}
apps/web/app/workshop/_screens/staff-screen.tsx:135:              >
apps/web/app/workshop/_screens/staff-screen.tsx:136:                <div>
apps/web/app/workshop/_screens/staff-screen.tsx:137:                  <div style={{ fontWeight: 600 }}>
apps/web/app/workshop/_screens/staff-screen.tsx:138:                    {/*
apps/web/app/workshop/_screens/staff-screen.tsx:139:                      A membership can outlive the directory read in one edge
apps/web/app/workshop/_screens/staff-screen.tsx:140:                      case — a user suspended between the two requests — so the
apps/web/app/workshop/_screens/staff-screen.tsx:141:                      name is never assumed to be there.
apps/web/app/workshop/_screens/staff-screen.tsx:142:                    */}
apps/web/app/workshop/_screens/staff-screen.tsx:143:                    {person?.displayName ?? 'Unknown user'}
apps/web/app/workshop/_screens/staff-screen.tsx:144:                    {isSelf ? (
apps/web/app/workshop/_screens/staff-screen.tsx:145:                      <span
apps/web/app/workshop/_screens/staff-screen.tsx:146:                        style={{
apps/web/app/workshop/_screens/staff-screen.tsx:147:                          marginLeft: primitive.space[2],
apps/web/app/workshop/_screens/staff-screen.tsx:148:                          color: themeVar.textSecondary,
apps/web/app/workshop/_screens/staff-screen.tsx:149:                          fontWeight: 400,
apps/web/app/workshop/_screens/staff-screen.tsx:150:                          fontSize: primitive.fontSize.sm,
apps/web/app/workshop/_screens/staff-screen.tsx:151:                        }}
apps/web/app/workshop/_screens/staff-screen.tsx:152:                      >
apps/web/app/workshop/_screens/staff-screen.tsx:153:                        (you)
apps/web/app/workshop/_screens/staff-screen.tsx:154:                      </span>
apps/web/app/workshop/_screens/staff-screen.tsx:155:                    ) : null}
apps/web/app/workshop/_screens/staff-screen.tsx:156:                  </div>
apps/web/app/workshop/_screens/staff-screen.tsx:157:                  <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
apps/web/app/workshop/_screens/staff-screen.tsx:158:                    {person?.email ?? '—'}
apps/web/app/workshop/_screens/staff-screen.tsx:159:                  </div>
apps/web/app/workshop/_screens/staff-screen.tsx:160:                  {/*
apps/web/app/workshop/_screens/staff-screen.tsx:161:                    🔴 THE PAGE SAYS "everyone who can sign in", AND A SUSPENDED
apps/web/app/workshop/_screens/staff-screen.tsx:162:                    ACCOUNT CANNOT. `/users` returns members regardless of
apps/web/app/workshop/_screens/staff-screen.tsx:163:                    `u.status`, while `memberships_for_subject()` filters
apps/web/app/workshop/_screens/staff-screen.tsx:164:                    `u.status = 'active'` at login — so a suspended person held
apps/web/app/workshop/_screens/staff-screen.tsx:165:                    an active MEMBERSHIP and no access, and this list claimed
apps/web/app/workshop/_screens/staff-screen.tsx:166:                    otherwise.
apps/web/app/workshop/_screens/staff-screen.tsx:167:
apps/web/app/workshop/_screens/staff-screen.tsx:168:                    Marked rather than hidden, deliberately: dropping them would
apps/web/app/workshop/_screens/staff-screen.tsx:169:                    make somebody who still holds a membership invisible to the
apps/web/app/workshop/_screens/staff-screen.tsx:170:                    only screen that can remove it. (Codex, 2026-08-04.)
apps/web/app/workshop/_screens/staff-screen.tsx:171:                  */}
apps/web/app/workshop/_screens/staff-screen.tsx:172:                  {person && person.status !== 'active' ? (
apps/web/app/workshop/_screens/staff-screen.tsx:173:                    <div style={{ color: themeVar.statusAttention, fontSize: primitive.fontSize.xs }}>
apps/web/app/workshop/_screens/staff-screen.tsx:174:                      account {person.status} — they cannot sign in
apps/web/app/workshop/_screens/staff-screen.tsx:175:                    </div>
apps/web/app/workshop/_screens/staff-screen.tsx:176:                  ) : null}
apps/web/app/workshop/_screens/staff-screen.tsx:177:                </div>
apps/web/app/workshop/_screens/staff-screen.tsx:178:
apps/web/app/workshop/_screens/staff-screen.tsx:179:                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
apps/web/app/workshop/_screens/staff-screen.tsx:180:                  {/* `roleLabel` so the screen never shows raw snake_case. */}
apps/web/app/workshop/_screens/staff-screen.tsx:181:                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
apps/web/app/workshop/_screens/staff-screen.tsx:182:                  {/*
apps/web/app/workshop/_screens/staff-screen.tsx:183:                    🔴 NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it
apps/web/app/workshop/_screens/staff-screen.tsx:184:                    — withdrawal is not self-referential there — and a workshop
apps/web/app/workshop/_screens/staff-screen.tsx:185:                    owner who revoked their own membership would lose access to
apps/web/app/workshop/_screens/staff-screen.tsx:186:                    the workshop they own, with no screen anywhere to undo it.
apps/web/app/workshop/_screens/staff-screen.tsx:187:                    A control whose success is indistinguishable from a lockout
apps/web/app/workshop/_screens/staff-screen.tsx:188:                    should not be offered.
apps/web/app/workshop/_screens/staff-screen.tsx:189:                  */}
apps/web/app/workshop/_screens/staff-screen.tsx:190:                  {isSelf ? (
apps/web/app/workshop/_screens/staff-screen.tsx:191:                    <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>
apps/web/app/workshop/_screens/staff-screen.tsx:192:                      cannot remove yourself
apps/web/app/workshop/_screens/staff-screen.tsx:193:                    </span>
apps/web/app/workshop/_screens/staff-screen.tsx:194:                  ) : (
apps/web/app/workshop/_screens/staff-screen.tsx:195:                    <WithdrawStaffButton
apps/web/app/workshop/_screens/staff-screen.tsx:196:                      membershipId={m.id}
apps/web/app/workshop/_screens/staff-screen.tsx:197:                      name={person?.displayName ?? 'this person'}
apps/web/app/workshop/_screens/staff-screen.tsx:198:                    />
apps/web/app/workshop/_screens/staff-screen.tsx:199:                  )}
apps/web/app/workshop/_screens/staff-screen.tsx:200:                </div>
apps/web/app/workshop/_screens/staff-screen.tsx:201:              </li>
apps/web/app/workshop/_screens/staff-screen.tsx:202:            );
apps/web/app/workshop/_screens/staff-screen.tsx:203:          })}
apps/web/app/workshop/_screens/staff-screen.tsx:204:        </ul>
apps/web/app/workshop/_screens/staff-screen.tsx:205:      )}
apps/web/app/workshop/_screens/staff-screen.tsx:206:    </>
apps/web/app/workshop/_screens/staff-screen.tsx:207:  );
apps/web/app/workshop/_screens/staff-screen.tsx:208:}

 succeeded in 1048ms:
1:'use client';
2:
3:import * as React from 'react';
4:import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
5:import type { ActionResult } from '@autoworkshop/ui';
6:import { primitive, themeVar } from '@autoworkshop/design-tokens';
7:import type { OrgRoleOption } from './org-staff-screen';
8:
9:/**
10: * The appointment form, shared by the insurance and towing packs.
11: *
12: * ⚠️ THE ACTION IS PASSED IN, NOT CHOSEN HERE. Each pack supplies its own
13: * `'use server'` entry point with the workspace id already bound server-side.
14: * A workspace chosen in client code would be attacker-controlled, and the
15: * workspace decides which API credential and cookie scope the request uses.
16: */
17:export function AddOrgMemberForm({
18:  action,
19:  roles,
20:  organisationNoun,
21:}: {
22:  action: (formData: FormData) => Promise<ActionResult>;
23:  roles: readonly OrgRoleOption[];
24:  organisationNoun: string;
25:}) {
26:  // The FIRST option is the default, and each pack lists its operational role
27:  // first — appointing another administrator is the rarer, weightier act and
28:  // should be a deliberate choice rather than the value already in the box.
29:  const [role, setRole] = React.useState(roles[0]?.value ?? '');
30:  const hint = roles.find((r) => r.value === role)?.hint;
31:
32:  return (
33:    <div
34:      style={{
35:        border: `1px solid ${themeVar.borderDefault}`,
36:        borderRadius: primitive.radius.xl,
37:        padding: primitive.space[6],
38:        background: themeVar.surfaceRaised,
39:      }}
40:    >
41:      <h2 style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: primitive.fontSize.lg }}>
42:        Add a colleague
43:      </h2>
44:      <p
45:        style={{
46:          margin: `0 0 ${primitive.space[4]}`,
47:          color: themeVar.textSecondary,
48:          fontSize: primitive.fontSize.sm,
49:        }}
50:      >
51:        {/*
52:          Stated up front rather than discovered through a failure. There is no
53:          invitation flow yet (T-0028), and a form that looks like it will send
54:          an invite and instead refuses an unknown address is worse than one
55:          that says so first.
56:        */}
57:        They need an account already. Ask them to sign up, then add them here with
58:        the same email address.
59:      </p>
60:
61:      <FormShell action={action} successPrefix="">
62:        <Field label="Their email address" htmlFor="userEmail">
63:          <TextInput
64:            id="userEmail"
65:            name="userEmail"
66:            type="email"
67:            required
68:            autoComplete="off"
69:            placeholder="colleague@example.com"
70:          />
71:        </Field>
72:
73:        <Field label="What they may do" htmlFor="roleName" hint={hint}>
74:          <Select
75:            id="roleName"
76:            name="roleName"
77:            value={role}
78:            onChange={(e) => setRole(e.currentTarget.value)}
79:            options={roles.map((r) => ({ value: r.value, label: r.label }))}
80:          />
81:        </Field>
82:
83:        {/* A form without one of these shipped in this repo once, and the live
84:            suite has a check for it. */}
85:        <SubmitButton>Add to this {organisationNoun}</SubmitButton>
86:      </FormShell>
87:    </div>
88:  );
89:}
90:
91:/**
92: * Remove someone's access.
93: *
94: * A form rather than a bare button so it posts through the same server-action
95: * path as everything else, and so it works with JavaScript disabled.
96: */
97:export function WithdrawOrgMemberButton({
98:  action,
99:  membershipId,
100:  name,
101:  organisationNoun,
102:}: {
103:  action: (formData: FormData) => Promise<ActionResult>;
104:  membershipId: string;
105:  name: string;
106:  organisationNoun: string;
107:}) {
108:  return (
109:    <FormShell action={action} successPrefix="">
110:      <input type="hidden" name="membershipId" value={membershipId} />
111:      <button
112:        type="submit"
113:        // `confirm` because this is destructive from the user's point of view
114:        // and instant. The row survives in the database, but their access does
115:        // not, and there is no undo screen.
116:        onClick={(e) => {
117:          if (!window.confirm(`Remove ${name}'s access to this ${organisationNoun}?`)) {
118:            e.preventDefault();
119:          }
120:        }}
121:        style={{
122:          padding: `${primitive.space[2]} ${primitive.space[4]}`,
123:          fontSize: primitive.fontSize.sm,
124:          fontFamily: 'inherit',
125:          color: themeVar.statusDanger,
126:          background: 'transparent',
127:          border: `1px solid ${themeVar.borderDefault}`,
128:          borderRadius: primitive.radius.md,
129:          cursor: 'pointer',
130:        }}
131:      >
132:        Remove
133:      </button>
134:    </FormShell>
135:  );
136:}

 succeeded in 1034ms:
1:import {
2:  BadRequestException,
3:  ForbiddenException,
4:  Injectable,
5:  NotFoundException,
6:} from '@nestjs/common';
7:import { AuditService } from '../audit/audit.service';
8:import { DatabaseService } from '../database/database.service';
9:import type { TenantContext } from '../tenancy/tenant-context';
10:import {
11:  assertWorkshopStaff,
12:  isOrganisationAdmin,
13:  isWorkshopStaff,
14:} from '../authz/workshop-roles';
15:
16:export interface Membership {
17:  id: string;
18:  organizationId: string;
19:  branchId: string | null;
20:  userId: string;
21:  roleName: string;
22:  status: 'active' | 'suspended' | 'revoked';
23:  createdAt: string;
24:}
25:
26:/**
27: * Roles permitted to grant or withdraw a membership.
28: *
29: * Deliberately the narrowest list in the identity module. A membership IS the
30: * authority — PLAN_EXTENSION_v1 §2.1: "Authority derives from membership and
31: * role, never from the account type claim itself." Whoever can mint one can
32: * mint access, so this is the privilege-escalation surface of the whole
33: * platform and it is not shared with operational roles.
34: *
35: * `07.txt` part 2 §3 assigns roles and approval limits at INVITATION time, and
36: * §50 gives only the owner "full workshop governance, staff ... access". The
37: * manager, who has "daily operational control", is excluded on purpose.
38: */
39:const CAN_GRANT_MEMBERSHIP = new Set([
40:  'platform_administrator',
41:  'workshop_owner',
42:  'supplier_owner',
43:  'fleet_administrator',
44:  // 🔴 ADDED BY 085. Until then this set had FOUR entries and two of the six
45:  // self-service organisation types were absent from it — so an insurance
46:  // company and a towing firm could create exactly ONE member, the founder,
47:  // and never a second one. Ten insurance screens and ten towing screens sat
48:  // above a team that could not be assembled.
49:  //
50:  // ⚠️ These are ORG-ADMIN roles, deliberately distinct from the operational
51:  // `insurance_assessor` / `towing_operator`. Adding the OPERATIONAL roles here
52:  // would have been one line shorter and wrong: it hands the person who
53:  // assesses a claim the authority to appoint the person who approves it,
54:  // destroying the separation of duty the insurance-governance slice exists to
55:  // create. Migration 085 has the full reasoning and the two rejected options.
56:  'insurance_owner',
57:  'towing_owner',
58:]);
59:
60:/**
61: * Roles a membership may confer.
62: *
63: * An allow-list, not free text. `role_name` is a plain `TEXT` column with no
64: * database CHECK, so without this the grant endpoint would accept any string —
65: * including one that a future authorization rule happens to treat as
66: * privileged. An unconstrained role name is a privilege-escalation hole that
67: * types cannot catch.
68: *
69: * The eight workshop roles are `07.txt` part 2 §50 verbatim.
70: */
71:const GRANTABLE_ROLES = new Set([
72:  // 07 pt2 §50 — workshop
73:  'workshop_owner',
74:  'workshop_manager',
75:  'reception_staff',
76:  'workshop_supervisor',
77:  'technician',
78:  'storekeeper',
79:  'quality_control_inspector',
80:  'cashier',
81:  // other workspaces
82:  'supplier_owner',
83:  'fleet_administrator',
84:  // 085 — the org admins for insurance and towing. Grantable so that a
85:  // platform administrator can appoint a replacement when a founder leaves;
86:  // without that an insurer whose founder departs is unadministrable for ever,
87:  // which is the same dead end 085 exists to remove, one step later.
88:  'insurance_owner',
89:  'insurance_assessor',
90:  'towing_owner',
91:  'towing_operator',
92:  'customer',
93:]);
94:
95:/**
96: * The roles a WORKSHOP organisation may hold — the eight of `07.txt` pt2 §50,
97: * plus the two the product genuinely puts there.
98: *
99: * Derived from `GRANTABLE_ROLES` rather than retyped, so a role added above
100: * cannot be silently absent here. The four partner roles are subtracted by
101: * name because each belongs to its own organisation type.
102: */
103:const WORKSHOP_ROLE_SET: readonly string[] = [
104:  ...[...GRANTABLE_ROLES].filter(
105:    (r) =>
106:      r !== 'supplier_owner' &&
107:      r !== 'fleet_administrator' &&
108:      r !== 'insurance_owner' &&
109:      r !== 'insurance_assessor' &&
110:      r !== 'towing_owner' &&
111:      r !== 'towing_operator',
112:  ),
113:  // Not in `GRANTABLE_ROLES` — it cannot be granted through this service at all
114:  // (migration 077/078 made it a grant RECORD). It is listed here because
115:  // existing memberships carry the name inside the owner's workshop, and this
116:  // map must not describe those as invalid.
117:  'platform_administrator',
118:];
119:
120:/**
121: * Which roles belong in which kind of organisation.
122: *
123: * 🔴 THE GAP THIS CLOSES, MEASURED. `grant()` checked who may grant, that the
124: * role is grantable, that the organisation is in the caller's tenant and that
125: * the branch is in the organisation — and never that the ROLE SUITS THE
126: * ORGANISATION. A query of the development database found
127: * `parts_supplier | reception_staff`, a workshop reception role inside a parts
128: * supplier, which every one of those gates passed.
129: *
130: * ⚠️ THE ORG TYPE KEYS ARE `ORG_TYPES` FROM `organization.schemas.ts`, which
131: * mirrors the `organizations_org_type_check` CHECK constraint in
132: * `001_tenancy_foundation.sql`. Two lists that must agree are a drift risk, and
133: * `membership-role-fit.spec.ts` reads the schema module and fails if this one
134: * names a type the database does not admit.
135: *
136: * ⚠️ AN ORG TYPE ABSENT FROM THIS MAP GRANTS NOTHING. `vehicle_owner` and
137: * `training_institution` have no roles defined yet, so a grant into one is
138: * refused rather than waved through. That is the fail-closed direction: a role
139: * nobody has designed for an organisation nobody has built is not a thing to
140: * guess at. When those organisations get roles, they get an entry here.
141: */
142:const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
143:  // The three workshop shapes take the eight workshop roles of `07.txt` pt2
144:  // §50, plus `customer` — migration 061 enrols a vehicle owner INTO the
145:  // workshop's own organisation, so that pairing is what the product produces —
146:  // plus `platform_administrator`, the documented compromise described above.
147:  individual_workshop: WORKSHOP_ROLE_SET,
148:  multi_branch_workshop: WORKSHOP_ROLE_SET,
149:  mobile_technician: WORKSHOP_ROLE_SET,
150:
151:  parts_supplier: ['supplier_owner'],
152:  fleet_operator: ['fleet_administrator'],
153:  // 085 — each of these now admits its ORG ADMIN and its OPERATIONAL role.
154:  // The admin is what `CAN_GRANT_MEMBERSHIP` recognises; the operational role
155:  // is what the admin appoints. Before 085 each list held only the operational
156:  // role, so the only member these organisations could have was one nobody
157:  // could have granted — and in fact nobody did: migration 080's registration
158:  // function wrote it directly, which is why the dead end was invisible.
159:  insurance_company: ['insurance_owner', 'insurance_assessor'],
160:  towing_company: ['towing_owner', 'towing_operator'],
161:
162:  // The platform's own organisation, if one is ever created. Named because
163:  // leaving it out would refuse the one role that obviously belongs in it.
164:  platform_operator: ['platform_administrator'],
165:});
166:
167:/** Whether `roleName` may be granted inside an organisation of `orgType`. */
168:function roleSuitsOrganisation(roleName: string, orgType: string): boolean {
169:  // `Object.hasOwn` rather than a bare lookup, for the reason
170:  // `permissionsForRole` documents: a plain index resolves up the PROTOTYPE
171:  // chain, so `ROLES_BY_ORG_TYPE['constructor']` returns the Object function —
172:  // truthy — and `?? []` never fires. On this function that would admit every
173:  // role into an organisation type called `constructor`.
174:  if (!Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)) return false;
175:  return ROLES_BY_ORG_TYPE[orgType]!.includes(roleName);
176:}
177:
178:/**
179: * Membership domain service — T-0003.
180: *
181: * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
182: * SECURITY`, so cross-tenant reads fail closed at the database. The rules that
183: * RLS cannot express — who may grant, which roles exist, and that nobody may
184: * quietly widen their own access — live here.
185: */
186:@Injectable()
187:export class MembershipService {
188:  constructor(
189:    private readonly db: DatabaseService,
190:    private readonly audit: AuditService,
191:  ) {}
192:
193:  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
194:    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
195:    // this same organisation and the controller carries only TenantGuard —
196:    // who you are, not what you may do. See `authz/workshop-roles.ts`.
197:    //
198:    // 🔴 …OR THE ORGANISATION'S OWN ADMINISTRATOR (085, Supervisor pass).
199:    // `assertWorkshopStaff` alone made the grant authority 085 created
200:    // UNUSABLE BY THE ROLES IT WAS CREATED FOR: an `insurance_owner` could
201:    // `POST /memberships` (201) and then `GET /memberships` (403), so they
202:    // could never see who was in their own organisation — and since
203:    // `withdraw()` needs an `id` that only this roster returns, every
204:    // appointment they made was IRREVERSIBLE. A write half with no readable
205:    // roster is the same defect as a withdrawal with no caller.
206:    //
207:    // ⚠️ This does NOT let a partner admin read a workshop's roster. The query
208:    // below is tenant-scoped and RLS backstops it, and a partner organisation
209:    // has its own tenant (076/080) — so the widening is confined to the
210:    // caller's own organisation, which is exactly what "administer your own
211:    // business" means.
212:    if (!isWorkshopStaff(ctx) && !isOrganisationAdmin(ctx)) {
213:      assertWorkshopStaff(ctx, 'The membership roster');
214:    }
215:    return this.db.withTenant(ctx, async (client) => {
216:      // CLAUDE.md §6: the application filters AND RLS backstops it. Seeded
217:      // rather than appended, so the tenant predicate cannot go missing when
218:      // no other filter is supplied -- and so a platform administrator, whom
219:      // the RLS policy permits across tenants, still gets the ONE tenant this
220:      // request resolved to.
221:      const values: unknown[] = [ctx.tenantId];
222:      const where: string[] = ['tenant_id = $1'];
223:      if (filter.userId) {
224:        values.push(filter.userId);
225:        where.push(`user_id = $${values.length}`);
226:      }
227:      if (filter.organizationId) {
228:        values.push(filter.organizationId);
229:        where.push(`organization_id = $${values.length}`);
230:      }
231:      const res = await client.query(
232:        `SELECT id, organization_id, branch_id, user_id, role_name, status, created_at
233:           FROM identity.memberships
234:          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
235:          ORDER BY created_at`,
236:        values,
237:      );
238:      return res.rows.map(this.toDomain);
239:    });
240:  }
241:
242:  /**
243:   * Grant a membership — the platform's privilege-granting operation.
244:   *
245:   * `07.txt` part 2 §3 (staff invitation): role and approval limits are set at
246:   * invitation. §50's closing rule governs the result: "No user shall receive
247:   * functions outside the user's approved role and branch."
248:   */
249:  async grant(
250:    ctx: TenantContext,
251:    input: {
252:      userId?: string;
253:      /** The person's email — resolved here, so no lookup endpoint exists to harvest. */
254:      userEmail?: string;
255:      organizationId: string;
256:      branchId?: string | null;
257:      roleName: string;
258:    },
259:  ): Promise<Membership> {
260:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
261:      throw new ForbiddenException(
262:        `role '${ctx.activeRole}' may not grant a membership`,
263:      );
264:    }
265:    // 🔴 THE "EXACTLY ONE" RULE BELONGS HERE, NOT ONLY IN THE ZOD SCHEMA.
266:    //
267:    // `GrantMembershipBody` refines it at the HTTP boundary, and this service is
268:    // NOT only reached over HTTP: ADR-010/013 route agents through MCP into
269:    // these same domain services, and CLAUDE.md is explicit that business rules
270:    // live in the service. A direct caller sending BOTH would have had `userId`
271:    // silently win, and one sending NEITHER would have run an email lookup for
272:    // `undefined` — on the platform's privilege-granting operation, either is a
273:    // silent disagreement about WHO is being given access. (Codex, 2026-08-04.)
274:    if (Boolean(input.userId) === Boolean(input.userEmail)) {
275:      throw new BadRequestException('send exactly one of userId or userEmail');
276:    }
277:    if (!GRANTABLE_ROLES.has(input.roleName)) {
278:      // Names the constraint, not the valid set: enumerating grantable roles in
279:      // an error message hands a caller the platform's authorization taxonomy,
280:      // which is the disclosure the catch-all route was already fixed to avoid.
281:      throw new BadRequestException('unknown role');
282:    }
283:
284:    return this.db.withTenant(ctx, async (client) => {
285:      // ── resolve WHO, before anything else ────────────────────────────────
286:      //
287:      // `identity.users` is deliberately NOT tenant-scoped (one human may hold
288:      // memberships in several tenants), so this lookup can see an account that
289:      // is not yet a member — which is the entire point: without it there was
290:      // no way to add anybody who was not already inside.
291:      //
292:      // ⚠️ EXACT MATCH, CASE-INSENSITIVE, ONE ROW. Not a prefix, not a LIKE.
293:      // The caller learns only whether the single address they already typed
294:      // has an account, and only after passing the role gate above. That is not
295:      // an enumeration oracle; a search endpoint would have been one.
296:      let userId = input.userId ?? null;
297:      if (!userId) {
298:        const found = await client.query(
299:          `SELECT id FROM identity.users WHERE lower(email) = lower($1)`,
300:          [input.userEmail],
301:        );
302:        if (found.rows.length === 0) {
303:          // Names the way forward rather than just refusing. There is no invite
304:          // flow yet (T-0028), so the honest instruction is that the person
305:          // signs up first — a refusal with no reachable next step is the wall
306:          // this repository keeps writing down.
307:          throw new NotFoundException(
308:            'no account with that email address. Ask them to sign up first, then add them here.',
309:          );
310:        }
311:        userId = found.rows[0].id as string;
312:      }
313:
314:      // The organization must belong to the ACTIVE TENANT, and the branch (if
315:      // given) must belong to that organization. Nothing else in the stack
316:      // checks either of these.
317:      //
318:      // The foreign keys reference `identity.organizations(id)` and
319:      // `identity.branches(id)` by id alone — a foreign key cannot carry a
320:      // tenant predicate — and RLS `WITH CHECK` validates the `tenant_id` of
321:      // the row being INSERTED, not the tenant of the rows it points at. So
322:      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
323:      // satisfies the FK and the policy at once. On the platform's
324:      // privilege-GRANTING operation, that is a membership filed under one
325:      // tenant and pointing into another's organization.
326:      //
327:      // Both lookups work because those tables are under FORCE RLS: a row in
328:      // another tenant is simply invisible here and returns nothing.
329:      const org = await client.query<{ org_type: string }>(
330:        // 🔴 `org_type`, NOT `1`. See the compatibility check below — the row's
331:        // EXISTENCE was all this asked for, and existence is not the whole
332:        // question on the privilege-granting operation.
333:        `SELECT org_type FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
334:        [input.organizationId, ctx.tenantId],
335:      );
336:      if (org.rows.length === 0) throw new NotFoundException('organization not found');
337:
338:      // ── 🔴 THE ROLE MUST SUIT THE ORGANISATION IT IS GRANTED IN ───────────
339:      //
340:      // MEASURED, NOT HYPOTHETICAL. Before this check, a query of the
341:      // development database returned:
342:      //
343:      //     parts_supplier | reception_staff | 1
344:      //
345:      // — a workshop reception role inside a PARTS SUPPLIER organisation. Every
346:      // gate above passed it: `reception_staff` is in `GRANTABLE_ROLES`, the
347:      // organisation was in the caller's tenant, and RLS `WITH CHECK` validates
348:      // the tenant of the row being inserted and says nothing about whether the
349:      // role makes sense where it landed.
350:      //
351:      // The consequence is not a cross-tenant leak — `resolveTenantContext`
352:      // still pins the request to this organisation — it is INCOHERENCE, which
353:      // fails in the quiet direction this repository keeps paying for. A
354:      // `reception_staff` in a supplier organisation resolves the WORKSHOP
355:      // reception navigation tree (`workspaceForRole`), so the person is shown
356:      // Vehicle Intake and Customer Complaints for an organisation that has
357:      // neither, and `isForeignToWorkspace` sends them to the workshop pack,
358:      // where every API call is scoped to a supplier's tenant. Nothing errors.
359:      //
360:      // ⚠️ ENFORCED ON THE GRANT, NOT ON EXISTING ROWS. This is a forward
361:      // constraint: the row above keeps working and is not migrated away, so no
362:      // live membership breaks. A database CHECK would have been the stronger
363:      // place and is not available — the pairing spans two tables.
364:      //
365:      // ⚠️ `platform_administrator` IS DELIBERATELY VALID IN A WORKSHOP. It is
366:      // the documented compromise the model forces (the owner holds it via a
367:      // membership attached to their own workshop), and since migration 078 the
368:      // AUTHORITY comes from a grant record rather than this name, so admitting
369:      // the name here confers nothing on its own.
370:      const orgType = org.rows[0]!.org_type;
371:      if (!roleSuitsOrganisation(input.roleName, orgType)) {
372:        // Names the mismatch without enumerating the taxonomy, matching the
373:        // deliberately vague 'unknown role' above: the caller learns that the
374:        // pair is wrong, not what the full set of valid pairs is.
375:        throw new BadRequestException(
376:          `role '${input.roleName}' cannot be granted in a ${orgType} organisation`,
377:        );
378:      }
379:
380:      if (input.branchId) {
381:        // Also asserts the branch belongs to THIS organization — a branch from
382:        // a sibling organization in the same tenant would pass a bare
383:        // existence check while scoping the membership to the wrong site,
384:        // which §50's "approved role and branch" rule forbids.
385:        const branch = await client.query(
386:          `SELECT 1 FROM identity.branches
387:              WHERE id = $1 AND organization_id = $2 AND tenant_id = $3`,
388:          [input.branchId, input.organizationId, ctx.tenantId],
389:        );
390:        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
391:      }
392:
393:      const res = await client.query(
394:        `INSERT INTO identity.memberships
395:           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
396:         VALUES ($1, $2, $3, $4, $5, $6)
397:         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
398:         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
399:        [
400:          // From the resolved context, never the request body. RLS `WITH CHECK`
401:          // would reject a mismatch anyway — both layers, by design.
402:          ctx.tenantId,
403:          input.organizationId,
404:          input.branchId ?? null,
405:          userId,
406:          input.roleName,
407:          ctx.userId,
408:        ],
409:      );
410:
411:      let row = res.rows[0];
412:      if (!row) {
413:        // ── the unique constraint fired: this grant already exists ──────────
414:        //
415:        // 🔴 AND IT MAY BE A REVOKED ONE, WHICH USED TO BE A DEAD END. A
416:        // membership is never deleted — withdrawal sets `status = 'revoked'`
417:        // and keeps the row so "was this person ever granted access?" stays
418:        // answerable. But the row still occupies the unique key, so re-hiring
419:        // somebody previously removed hit `ON CONFLICT DO NOTHING` and was
420:        // refused with "membership already exists" — a message that is the
421:        // OPPOSITE of the truth, told to an owner looking at a colleague who
422:        // demonstrably has no access, with nothing anywhere to undo it.
423:        //
424:        // A rule whose escape hatch is unreachable is a wall, not a rule.
425:        const existing = await client.query(
426:          `UPDATE identity.memberships
427:              -- 🔴 THE BRANCH IS RE-SET, NOT INHERITED. The unique key is
428:              -- (organization_id, user_id, role_name) and does NOT include the
429:              -- branch, so re-hiring the same person into the same role at a
430:              -- DIFFERENT site matched the old row and would have reactivated
431:              -- it with the OLD branch_id — quietly granting access to a site
432:              -- nobody approved, which is exactly what §50's "approved role AND
433:              -- branch" forbids. The branchId parameter has already been
434:              -- validated against this organization above.
435:              --
436:              -- NO BACKTICKS IN THIS COMMENT: it sits inside a TS template
437:              -- literal, so one terminates the string. FIFTH instance.
438:              -- (Codex, 2026-08-04.)
439:              SET status = 'active', branch_id = $6,
440:                  updated_at = now(), updated_by = $1
441:            WHERE organization_id = $2 AND user_id = $3 AND role_name = $4
442:              AND tenant_id = $5
443:              -- Only a WITHDRAWN one is reinstated. An ACTIVE row matches
444:              -- nothing here and still falls through to the refusal below,
445:              -- because "add them again" when they are already there changed
446:              -- nothing and must not read as though it did.
447:              AND status <> 'active'
448:            RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
449:          [ctx.userId, input.organizationId, userId, input.roleName, ctx.tenantId,
450:           input.branchId ?? null],
451:        );
452:        row = existing.rows[0];
453:      }
454:      if (!row) {
455:        throw new BadRequestException('membership already exists');
456:      }
457:
458:      await this.audit.write(client, ctx, {
459:        action: 'membership.granted',
460:        resourceType: 'membership',
461:        resourceId: row.id,
462:        detail: {
463:          // 🔴 THE RESOLVED ID, NOT `input.userId`. Once `userEmail` became an
464:          // accepted input, `input.userId` was undefined for every grant made
465:          // by email — so the audit entry for the platform's PRIVILEGE-GRANTING
466:          // operation would have recorded `userId: undefined` and lost the one
467:          // fact it exists to preserve: who was given access.
468:          userId,
469:          organizationId: input.organizationId,
470:          branchId: input.branchId ?? null,
471:          roleName: input.roleName,
472:        },
473:      });
474:
475:      return this.toDomain(row);
476:    });
477:  }
478:
479:  /**
480:   * Suspend or revoke a membership — withdrawing access.
481:   *
482:   * Status only ever moves toward LESS access. Re-granting is a new grant, with
483:   * its own audit row, rather than a status flip: the audit trail for approvals
484:   * and access is append-only per CLAUDE.md, and a reversible toggle would make
485:   * "was this person ever revoked?" unanswerable.
486:   */
487:  async withdraw(
488:    ctx: TenantContext,
489:    id: string,
490:    status: 'suspended' | 'revoked',
491:  ): Promise<Membership> {
492:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
493:      throw new ForbiddenException(
494:        `role '${ctx.activeRole}' may not withdraw a membership`,
495:      );
496:    }
497:
498:    // Validate the target status AT RUNTIME. The parameter's union type is
499:    // erased at compile time, and the controller passes the request body
500:    // straight through, so `{ "status": "active" }` reached this method as a
501:    // string the database's CHECK constraint happily accepts — turning a
502:    // withdrawal into a silent no-op that still wrote an audit row reading
503:    // `membership.active`, an action this service never performs. Any other
504:    // string produced a constraint violation and a 500 where a 400 was owed.
505:    //
506:    // The check belongs HERE and not only in the controller because an MCP tool
507:    // calls this service directly, without passing through any controller. A
508:    // rule enforced only at the HTTP edge is not enforced for agents — which is
509:    // the whole premise of the AI boundary (`0.txt` §13, §26).
510:    if (status !== 'suspended' && status !== 'revoked') {
511:      throw new BadRequestException('status must be suspended or revoked');
512:    }
513:
514:    return this.db.withTenant(ctx, async (client) => {
515:      const res = await client.query(
516:        `UPDATE identity.memberships
517:            SET status = $2, updated_at = now(), updated_by = $3
518:          WHERE id = $1
519:            AND status = 'active'
520:            AND tenant_id = $4
521:        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
522:        [id, status, ctx.userId, ctx.tenantId],
523:      );
524:      const row = res.rows[0];
525:      if (!row) {
526:        // Either it is not in this tenant (RLS hid it) or it was not active.
527:        // One message for both, so the response cannot be used to probe which.
528:        throw new NotFoundException('active membership not found');
529:      }
530:
531:      await this.audit.write(client, ctx, {
532:        action: `membership.${status}`,
533:        resourceType: 'membership',
534:        resourceId: row.id,
535:        detail: { userId: row.user_id, roleName: row.role_name },
536:      });
537:
538:      return this.toDomain(row);
539:    });
540:  }
541:
542:  private toDomain = (row: {
543:    id: string;
544:    organization_id: string;
545:    branch_id: string | null;
546:    user_id: string;
547:    role_name: string;
548:    status: Membership['status'];
549:    created_at: Date;
550:  }): Membership => ({
551:    id: row.id,
552:    organizationId: row.organization_id,
553:    branchId: row.branch_id,
554:    userId: row.user_id,
555:    roleName: row.role_name,
556:    status: row.status,
557:    createdAt: row.created_at.toISOString(),
558:  });
559:}

 succeeded in 1070ms:
1:import { Suspense } from 'react';
2:import { ApiFailure, apiGet, currentViewer, roleLabel } from '@autoworkshop/next-shell';
3:import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
4:import { primitive, themeVar } from '@autoworkshop/design-tokens';
5:import type { ActionResult } from '@autoworkshop/ui';
6:import { AddOrgMemberForm, WithdrawOrgMemberButton } from './org-staff-form';
7:
8:/**
9: * Who has access to a non-workshop organisation, and what they may do.
10: *
11: * Mounted by the insurance and towing packs. Modelled on
12: * `workshop/_screens/staff-screen.tsx`, whose comments explain most of the
13: * shape; the differences are noted where they occur.
14: *
15: * ⚠️ THE LIST IS BUILT FROM TWO READS, AND NEITHER IS THE CONTROL. `/users`
16: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
17: * are tenant-scoped server-side with RLS underneath; joining them here is
18: * presentation (CLAUDE.md §8).
19: *
20: * 🔴 BOTH READS WERE REFUSED FOR THESE ROLES UNTIL 2026-08-17. `list()` was
21: * gated on `assertWorkshopStaff`, whose set contains no partner role, so this
22: * screen could not have existed: `POST /memberships` answered 201 and
23: * `GET /memberships` answered 403.
24: */
25:
26:export const dynamic = 'force-dynamic';
27:
28:/** Field names taken from `TenantUser` in the API — never guessed. */
29:interface UserRow {
30:  id: string;
31:  email: string;
32:  displayName: string;
33:  phone: string | null;
34:  status: string;
35:  roles: string[];
36:}
37:
38:/** Field names taken from `Membership` in the API. */
39:interface MembershipRow {
40:  id: string;
41:  organizationId: string;
42:  branchId: string | null;
43:  userId: string;
44:  roleName: string;
45:  status: 'active' | 'suspended' | 'revoked';
46:}
47:
48:export interface OrgRoleOption {
49:  value: string;
50:  label: string;
51:  hint: string;
52:}
53:
54:export interface OrgStaffScreenProps {
55:  /** Which pack this is mounted in — decides the API credential and cookie scope. */
56:  workspaceId: string;
57:  /** Page title, e.g. "Users". */
58:  title: string;
59:  description: string;
60:  /** What this organisation is called in prose, e.g. "insurance company". */
61:  organisationNoun: string;
62:  /** The roles this organisation type may confer — must match `ROLES_BY_ORG_TYPE`. */
63:  roles: readonly OrgRoleOption[];
64:  addAction: (formData: FormData) => Promise<ActionResult>;
65:  withdrawAction: (formData: FormData) => Promise<ActionResult>;
66:}
67:
68:export function OrgStaffScreen(props: OrgStaffScreenProps) {
69:  return (
70:    <>
71:      <PageHeader title={props.title} description={props.description} />
72:      <Suspense fallback={<LoadingState label="Loading the people who have access…" />}>
73:        <OrgStaffList {...props} />
74:      </Suspense>
75:    </>
76:  );
77:}
78:
79:async function OrgStaffList({
80:  workspaceId,
81:  organisationNoun,
82:  roles,
83:  addAction,
84:  withdrawAction,
85:}: OrgStaffScreenProps) {
86:  const viewer = await currentViewer(workspaceId);
87:
88:  /*
89:    🔴 SCOPED TO THE ACTIVE ORGANISATION, NOT THE WHOLE TENANT — the defect the
90:    workshop version records. `/memberships` unfiltered returns every membership
91:    in the tenant, and a tenant may hold more than one organisation, so an
92:    unfiltered list over-reports who can reach THIS one. A page that over-reports
93:    access is worse than one that says nothing.
94:  */
95:  const orgFilter = viewer?.organizationId
96:    ? `?organizationId=${encodeURIComponent(viewer.organizationId)}`
97:    : '';
98:  const [users, memberships] = await Promise.all([
99:    apiGet<UserRow[]>(workspaceId, '/users'),
100:    apiGet<MembershipRow[]>(workspaceId, `/memberships${orgFilter}`),
101:  ]);
102:
103:  if (!users.ok) return <ApiFailure reason={users.reason} workspaceId={workspaceId} />;
104:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId={workspaceId} />;
105:
106:  const byUser = new Map(users.data.map((u) => [u.id, u]));
107:  // Active memberships only. A revoked one is kept in the database so that "was
108:  // this person ever granted access?" stays answerable, and showing it in a
109:  // staff LIST would read as though they still work here.
110:  const active = memberships.data.filter((m) => m.status === 'active');
111:
112:  return (
113:    <>
114:      {/*
115:        The form FIRST: on a newly registered organisation the founder is the
116:        only member, so the whole point of this page is to add somebody, and a
117:        form under an empty state is a form nobody finds.
118:      */}
119:      <AddOrgMemberForm
120:        action={addAction}
121:        roles={roles}
122:        organisationNoun={organisationNoun}
123:      />
124:
125:      {active.length === 0 ? (
126:        <EmptyState
127:          title="Nobody else has access yet"
128:          description={`Add a colleague by their email address above. They need an account first — ask them to sign up, then add them here.`}
129:        />
130:      ) : (
131:        <ul
132:          style={{
133:            listStyle: 'none',
134:            margin: `${primitive.space[6]} 0 0`,
135:            padding: 0,
136:            display: 'grid',
137:            gap: primitive.space[3],
138:          }}
139:        >
140:          {active.map((m) => {
141:            const person = byUser.get(m.userId);
142:            const isSelf = viewer?.userId === m.userId;
143:            return (
144:              <li
145:                key={m.id}
146:                style={{
147:                  border: `1px solid ${themeVar.borderDefault}`,
148:                  borderRadius: primitive.radius.xl,
149:                  padding: primitive.space[4],
150:                  background: themeVar.surfaceRaised,
151:                  display: 'flex',
152:                  flexWrap: 'wrap',
153:                  gap: primitive.space[3],
154:                  alignItems: 'center',
155:                  justifyContent: 'space-between',
156:                }}
157:              >
158:                <div>
159:                  <div style={{ fontWeight: 600 }}>
160:                    {/* A membership can outlive the directory read in one edge
161:                        case — a user suspended between the two requests — so the
162:                        name is never assumed to be there. */}
163:                    {person?.displayName ?? 'Unknown user'}
164:                    {isSelf ? (
165:                      <span
166:                        style={{
167:                          marginLeft: primitive.space[2],
168:                          color: themeVar.textSecondary,
169:                          fontWeight: 400,
170:                          fontSize: primitive.fontSize.sm,
171:                        }}
172:                      >
173:                        (you)
174:                      </span>
175:                    ) : null}
176:                  </div>
177:                  <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
178:                    {person?.email ?? '—'}
179:                  </div>
180:                  {/* A suspended account holds a membership and cannot sign in.
181:                      Marked rather than hidden: dropping them would make somebody
182:                      who still holds a membership invisible to the only screen
183:                      that can remove it. */}
184:                  {person && person.status !== 'active' ? (
185:                    <div
186:                      style={{ color: themeVar.statusAttention, fontSize: primitive.fontSize.xs }}
187:                    >
188:                      account {person.status} — they cannot sign in
189:                    </div>
190:                  ) : null}
191:                </div>
192:
193:                <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center' }}>
194:                  {/* `roleLabel` so the screen never shows raw snake_case. */}
195:                  <StatusBadge kind="active" label={roleLabel(m.roleName)} />
196:                  {/*
197:                    🔴 NO REMOVE BUTTON ON YOUR OWN ROW. The API would accept it —
198:                    withdrawal is not self-referential there — and an
199:                    administrator who revoked their own membership would lose
200:                    access to the organisation they registered, with no screen
201:                    anywhere to undo it. For these two organisation types that is
202:                    worse than for a workshop: until 085 there was exactly one
203:                    member, so self-removal was an unrecoverable lockout of the
204:                    whole business. A control whose success is indistinguishable
205:                    from a lockout should not be offered.
206:                  */}
207:                  {isSelf ? (
208:                    <span
209:                      style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}
210:                    >
211:                      cannot remove yourself
212:                    </span>
213:                  ) : (
214:                    <WithdrawOrgMemberButton
215:                      action={withdrawAction}
216:                      membershipId={m.id}
217:                      name={person?.displayName ?? 'this person'}
218:                      organisationNoun={organisationNoun}
219:                    />
220:                  )}
221:                </div>
222:              </li>
223:            );
224:          })}
225:        </ul>
226:      )}
227:    </>
228:  );
229:}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content apps/api/src/identity/membership.service.ts | Select-Object -Skip 135 -First 45; Get-Content 
apps/api/src/identity/membership.service.ts | Select-Object -Skip 240 -First 250; Get-Content apps/api/src/identity/membership.service.ts | Select-Object -Skip 480 -First 95' in 
C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "insurance.*settings|settings/users|towing.*operations/settings|organizationAdmin|organization.admin" 
packages apps/web -g "*.ts" -g "*.tsx" -g "*.json"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "function requireNavRoute|export.*requireNavRoute|async function 
requireNavRoute|currentViewer|apiGet|apiPost|apiPatch" packages -g "*.ts" -g "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "insurance_owner|towing_owner" apps/api/src/authz/permission-matrix.ts packages -g "*.ts"; rg -n 
"§8|three independent|route gate|RSC" CLAUDE.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 953ms:
packages\marketplace-ui\src\public-api.ts:6: * ⚠️ DELIBERATELY NOT `apiGet` FROM `@autoworkshop/next-shell`. That helper
packages\marketplace-ui\src\public-api.ts:117: * `apiGet` from next-shell, not this helper.
packages\marketplace-ui\src\basket-panel.tsx:37:   * shape as `renderAddToBasket` on the landing. Both actions call `apiGet` /
packages\marketplace-ui\src\basket-panel.tsx:38:   * `apiPost` with a WORKSPACE ID, and the workspace differs per app:
packages\next-shell\src\quick-create.ts:6:import { currentViewer, viewerRole } from './viewer';
packages\next-shell\src\quick-create.ts:57:    currentViewer(workspaceId),
packages\next-shell\src\NotificationsInbox.tsx:3:import { apiGet } from './api';
packages\next-shell\src\NotificationsInbox.tsx:93:  const result = await apiGet<NotificationRow[]>(workspace, '/notifications?limit=100');
packages\next-shell\src\ModulePage.tsx:10:import { viewerRole, currentViewer } from './viewer';
packages\next-shell\src\ModulePage.tsx:90:  if (isForeignToWorkspace(workspaceId, (await currentViewer(workspaceId))?.activeRole))
packages\next-shell\src\viewer.ts:67:  // ONE-SHOT raw fetch, and when it failed `currentViewer` returned null,
packages\next-shell\src\viewer.ts:111:        // `aw.activeRole` and `apiGet` duly sent `x-role-name` on every PAGE
packages\next-shell\src\viewer.ts:160: * Kept separate from `currentViewer()` on purpose (Codex finding M2). The
packages\next-shell\src\viewer.ts:162: * person at all. When the API is unreachable `currentViewer()` correctly
packages\next-shell\src\viewer.ts:174:export async function currentViewer(
packages\next-shell\src\index.ts:6:export { currentViewer, viewerGrants, viewerRole } from './viewer';
packages\next-shell\src\index.ts:30:export { requireNavRoute } from './require-route';
packages\next-shell\src\index.ts:36:export { apiGet, apiPost, apiPut, apiPatch, apiDelete, describeApiFailure } from './api';
packages\next-shell\src\ApiFailure.tsx:23: * THE API CANNOT TELL THESE APART — `apiGet` returns `unauthenticated` both when
packages\next-shell\src\api.ts:3:import { activeOrganizationHeader, activeRoleHeader, currentViewer } from './viewer';
packages\next-shell\src\api.ts:117:  const viewer = await currentViewer(workspaceId);
packages\next-shell\src\api.ts:151: * `apiPost`/`apiPatch`/`apiDelete` are deliberately NOT changed. This
packages\next-shell\src\api.ts:182:export async function apiGet<T>(
packages\next-shell\src\api.ts:264: * Same discipline as `apiGet` and for the same reasons — server only, so the
packages\next-shell\src\api.ts:276: * `cache` is not set: Next does not cache POSTs. `no-store` is on `apiGet`
packages\next-shell\src\api.ts:280:export async function apiPost<T>(
packages\next-shell\src\api.ts:292: * CALLER. `apiPatch` means "change these fields"; this means "replace the whole
packages\next-shell\src\api.ts:313: * Identical handling to `apiPost` — same auth, same never-throws contract, same
packages\next-shell\src\api.ts:324:export async function apiPatch<T>(
packages\next-shell\src\api.ts:335: * Shares `apiWrite` for the same reasons `apiPatch` does — same auth, same
packages\next-shell\src\require-route.ts:8:import { currentViewer, viewerRole } from './viewer';
packages\next-shell\src\require-route.ts:57:export async function requireNavRoute(
packages\next-shell\src\require-route.ts:66:  // use. `currentViewer` and `viewerRole` are memoised per request with React's
packages\next-shell\src\require-route.ts:70:    currentViewer(workspaceId),
packages\next-shell\src\require-access.ts:3:import { currentViewer } from './viewer';
packages\next-shell\src\require-access.ts:49:  const viewer = await currentViewer(workspaceId);
packages\next-shell\src\registration.ts:2:import { apiGet } from './api';
packages\next-shell\src\registration.ts:51:    const result = await apiGet<RegistrationStatus>(workspaceId, '/registration/status');

 succeeded in 1071ms:
packages\navigation\src\workspaces.ts:151:    // `organization.admin` is the right key because among those five roles ONLY
packages\navigation\src\workspaces.ts:156:    ['register-customer', 'Register Customer', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:160:    ['register-vehicle', 'Register Vehicle', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:267:    'organization.admin',
packages\navigation\src\workspaces.ts:341:    'organization.admin',
packages\navigation\src\workspaces.ts:399:    'organization.admin',
packages\navigation\src\workspaces.ts:480:    'organization.admin',
packages\navigation\src\workspaces.ts:505:    ['settings', 'Settings', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:747:    'organization.admin',
packages\navigation\src\resolve.test.ts:47:    const groups = visibleGroups(workshop, ['organization.admin']);
packages\navigation\src\resolve.test.ts:345:    const withFinance = hrefs(['finance.read', 'organization.admin']);
packages\navigation\src\resolve.test.ts:346:    const withoutFinance = hrefs(['organization.admin']);
packages\navigation\src\landing-path.test.ts:40:      const landing = landingPathFor(id, ALL, ['platform.admin', 'finance.read', 'organization.admin']);
packages\next-shell\src\WorkspaceGate.test.ts:36:    expect(hasWorkspaceAccess(viewer(['organization.admin', 'finance.read']), 'platform.admin')).toBe(
packages\next-shell\src\viewer.test.ts:62:  { label: 'workshop owner', viewer: viewer('workshop_owner', ['finance.read', 'organization.admin']) },
packages\next-shell\src\viewer.test.ts:65:    viewer: viewer('platform_administrator', ['platform.admin', 'organization.admin', 'finance.read']),
packages\next-shell\src\viewer.test.ts:108:    // The demo implementation returned `['organization.admin']` to everyone,
packages\next-shell\src\viewer.test.ts:118:    const owner = viewer('workshop_owner', ['finance.read', 'organization.admin']);
packages\next-shell\src\viewer.test.ts:119:    expect(grantsFor(owner)).toEqual(['finance.read', 'organization.admin']);
packages\next-shell\src\viewer-contract.ts:270: * computes (`finance.read`, `organization.admin`, `platform.admin`) are already
packages\next-shell\src\viewer-contract.ts:365: * The previous demo implementation returned `['organization.admin']` to anyone
packages\next-shell\src\quick-create.ts:33: * `permission: 'organization.admin'`. A viewer on that tree WITHOUT the grant
apps/web\app\towing\_screens\staff-section.tsx:6: * Who works for this towing company — rendered inside `/operations/settings`.
apps/web\app\towing\_screens\staff-section.tsx:11: * entry to match the insurance tree would be exactly that. The settings entry is
apps/web\app\towing\_screens\staff-section.tsx:12: * already gated on `organization.admin` — the permission `towing_owner` gained
apps/web\app\towing\_screens\staff-actions.ts:20:const REVALIDATE = ['/towing/operations/settings'] as const;
apps/web\app\towing\_screens\settings-screen.tsx:31: * ⚠️ GATED ON `organization.admin` IN THE NAVIGATION (§52). The nav hides it,
apps/web\app\towing\_screens\recoveries-screen.tsx:176:        <Link href="/towing/operations/settings">Settings</Link>
apps/web\app\towing\operations\settings\page.tsx:14:  await requireNavRoute('towing', '/operations/settings');
apps/web\app\towing\operations\settings\page.tsx:26:        `organization.admin` gate that `towing_owner` newly satisfies.
apps/web\app\insurance\_screens\staff-screen.tsx:6: * `/insurance/settings/users` — who works for this insurance company.
apps/web\app\insurance\_screens\staff-screen.tsx:9: * `settings` group is gated on `organization.admin`, a permission NO insurance
apps/web\app\insurance\_screens\staff-actions.ts:17:const REVALIDATE = ['/insurance/settings/users'] as const;
apps/web\app\workshop\_screens\quick-create.spec.ts:74:   * default tree `register-customer` carries `permission: 'organization.admin'`.
apps/web\app\workshop\_screens\quick-create.spec.ts:78:  it('the default tree hides the target from a viewer without organization.admin', () => {
apps/web\app\workshop\_screens\quick-create.spec.ts:80:    expect(resolve(undefined, 'register-customer', ['organization.admin'])).toBe(
apps/web\app\workshop\_screens\quick-create.spec.ts:109:        resolve(role, 'create-job-card', ['organization.admin', 'platform.admin']),
apps/web\app\workshop\_screens\quick-create.spec.ts:113:    expect(resolve(undefined, 'create-job-card', ['organization.admin'])).toBeNull();
apps/web\app\insurance\settings\users\page.tsx:5: * `/insurance/settings/users` — the insurance company's own people.
apps/web\app\insurance\settings\users\page.tsx:12: * The `settings` group is declared with `organization.admin`, which since
apps/web\app\insurance\settings\users\page.tsx:19:  await requireNavRoute('insurance', '/settings/users');
apps/web\app\workshop\_screens\planned-workshop.spec.ts:85: * `organization.admin` group in the §34 tree and a workshop supervisor holds no
apps/web\app\workshop\_screens\planned-workshop.spec.ts:125:      //     'organization.admin',
apps/web\app\workshop\settings\pricing\page.tsx:18: * ⚠️ IT SITS IN THE `organization.admin` GROUP, which is the point rather than a

 succeeded in 1032ms:
apps/api/src/authz/permission-matrix.ts:121:  insurance_owner: [financeRead, organizationAdmin],
apps/api/src/authz/permission-matrix.ts:125:  towing_owner: [financeRead, organizationAdmin],
apps/api/src/authz/permission-matrix.ts:134:   * adding `towing_owner` beside it — a comment asserting a fact about a
apps/api/src/authz/permission-matrix.ts:147:   * `towing_owner` above holds both. The operator keeps neither, on purpose.
apps/api/src/authz/permission-matrix.ts:329:  'insurance_owner',
apps/api/src/authz/permission-matrix.ts:330:  'towing_owner',
packages\next-shell\src\viewer-contract.ts:135:  'insurance_owner',
packages\next-shell\src\viewer-contract.ts:137:  'towing_owner',
packages\next-shell\src\viewer-contract.ts:178:  insurance_owner: 'insurance',
packages\next-shell\src\viewer-contract.ts:180:  towing_owner: 'towing',
18:`05.txt` §1, §2, §6 and §8 require zero-cost open-source tooling — §8 covers the **first production release**,

 succeeded in 1512ms:
 * âš ï¸ AN ORG TYPE ABSENT FROM THIS MAP GRANTS NOTHING. `vehicle_owner` and
 * `training_institution` have no roles defined yet, so a grant into one is
 * refused rather than waved through. That is the fail-closed direction: a role
 * nobody has designed for an organisation nobody has built is not a thing to
 * guess at. When those organisations get roles, they get an entry here.
 */
const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // The three workshop shapes take the eight workshop roles of `07.txt` pt2
  // Â§50, plus `customer` â€” migration 061 enrols a vehicle owner INTO the
  // workshop's own organisation, so that pairing is what the product produces â€”
  // plus `platform_administrator`, the documented compromise described above.
  individual_workshop: WORKSHOP_ROLE_SET,
  multi_branch_workshop: WORKSHOP_ROLE_SET,
  mobile_technician: WORKSHOP_ROLE_SET,

  parts_supplier: ['supplier_owner'],
  fleet_operator: ['fleet_administrator'],
  // 085 â€” each of these now admits its ORG ADMIN and its OPERATIONAL role.
  // The admin is what `CAN_GRANT_MEMBERSHIP` recognises; the operational role
  // is what the admin appoints. Before 085 each list held only the operational
  // role, so the only member these organisations could have was one nobody
  // could have granted â€” and in fact nobody did: migration 080's registration
  // function wrote it directly, which is why the dead end was invisible.
  insurance_company: ['insurance_owner', 'insurance_assessor'],
  towing_company: ['towing_owner', 'towing_operator'],

  // The platform's own organisation, if one is ever created. Named because
  // leaving it out would refuse the one role that obviously belongs in it.
  platform_operator: ['platform_administrator'],
});

/** Whether `roleName` may be granted inside an organisation of `orgType`. */
function roleSuitsOrganisation(roleName: string, orgType: string): boolean {
  // `Object.hasOwn` rather than a bare lookup, for the reason
  // `permissionsForRole` documents: a plain index resolves up the PROTOTYPE
  // chain, so `ROLES_BY_ORG_TYPE['constructor']` returns the Object function â€”
  // truthy â€” and `?? []` never fires. On this function that would admit every
  // role into an organisation type called `constructor`.
  if (!Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)) return false;
  return ROLES_BY_ORG_TYPE[orgType]!.includes(roleName);
}

/**
 * Membership domain service â€” T-0003.
 *

  /**
   * Grant a membership â€” the platform's privilege-granting operation.
   *
   * `07.txt` part 2 Â§3 (staff invitation): role and approval limits are set at
   * invitation. Â§50's closing rule governs the result: "No user shall receive
   * functions outside the user's approved role and branch."
   */
  async grant(
    ctx: TenantContext,
    input: {
      userId?: string;
      /** The person's email â€” resolved here, so no lookup endpoint exists to harvest. */
      userEmail?: string;
      organizationId: string;
      branchId?: string | null;
      roleName: string;
    },
  ): Promise<Membership> {
    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not grant a membership`,
      );
    }
    // ðŸ”´ THE "EXACTLY ONE" RULE BELONGS HERE, NOT ONLY IN THE ZOD SCHEMA.
    //
    // `GrantMembershipBody` refines it at the HTTP boundary, and this service is
    // NOT only reached over HTTP: ADR-010/013 route agents through MCP into
    // these same domain services, and CLAUDE.md is explicit that business rules
    // live in the service. A direct caller sending BOTH would have had `userId`
    // silently win, and one sending NEITHER would have run an email lookup for
    // `undefined` â€” on the platform's privilege-granting operation, either is a
    // silent disagreement about WHO is being given access. (Codex, 2026-08-04.)
    if (Boolean(input.userId) === Boolean(input.userEmail)) {
      throw new BadRequestException('send exactly one of userId or userEmail');
    }
    if (!GRANTABLE_ROLES.has(input.roleName)) {
      // Names the constraint, not the valid set: enumerating grantable roles in
      // an error message hands a caller the platform's authorization taxonomy,
      // which is the disclosure the catch-all route was already fixed to avoid.
      throw new BadRequestException('unknown role');
    }

    return this.db.withTenant(ctx, async (client) => {
      // â”€â”€ resolve WHO, before anything else â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // `identity.users` is deliberately NOT tenant-scoped (one human may hold
      // memberships in several tenants), so this lookup can see an account that
      // is not yet a member â€” which is the entire point: without it there was
      // no way to add anybody who was not already inside.
      //
      // âš ï¸ EXACT MATCH, CASE-INSENSITIVE, ONE ROW. Not a prefix, not a LIKE.
      // The caller learns only whether the single address they already typed
      // has an account, and only after passing the role gate above. That is not
      // an enumeration oracle; a search endpoint would have been one.
      let userId = input.userId ?? null;
      if (!userId) {
        const found = await client.query(
          `SELECT id FROM identity.users WHERE lower(email) = lower($1)`,
          [input.userEmail],
        );
        if (found.rows.length === 0) {
          // Names the way forward rather than just refusing. There is no invite
          // flow yet (T-0028), so the honest instruction is that the person
          // signs up first â€” a refusal with no reachable next step is the wall
          // this repository keeps writing down.
          throw new NotFoundException(
            'no account with that email address. Ask them to sign up first, then add them here.',
          );
        }
        userId = found.rows[0].id as string;
      }

      // The organization must belong to the ACTIVE TENANT, and the branch (if
      // given) must belong to that organization. Nothing else in the stack
      // checks either of these.
      //
      // The foreign keys reference `identity.organizations(id)` and
      // `identity.branches(id)` by id alone â€” a foreign key cannot carry a
      // tenant predicate â€” and RLS `WITH CHECK` validates the `tenant_id` of
      // the row being INSERTED, not the tenant of the rows it points at. So
      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
      // satisfies the FK and the policy at once. On the platform's
      // privilege-GRANTING operation, that is a membership filed under one
      // tenant and pointing into another's organization.
      //
      // Both lookups work because those tables are under FORCE RLS: a row in
      // another tenant is simply invisible here and returns nothing.
      const org = await client.query<{ org_type: string }>(
        // ðŸ”´ `org_type`, NOT `1`. See the compatibility check below â€” the row's
        // EXISTENCE was all this asked for, and existence is not the whole
        // question on the privilege-granting operation.
        `SELECT org_type FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (org.rows.length === 0) throw new NotFoundException('organization not found');

      // â”€â”€ ðŸ”´ THE ROLE MUST SUIT THE ORGANISATION IT IS GRANTED IN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // MEASURED, NOT HYPOTHETICAL. Before this check, a query of the
      // development database returned:
      //
      //     parts_supplier | reception_staff | 1
      //
      // â€” a workshop reception role inside a PARTS SUPPLIER organisation. Every
      // gate above passed it: `reception_staff` is in `GRANTABLE_ROLES`, the
      // organisation was in the caller's tenant, and RLS `WITH CHECK` validates
      // the tenant of the row being inserted and says nothing about whether the
      // role makes sense where it landed.
      //
      // The consequence is not a cross-tenant leak â€” `resolveTenantContext`
      // still pins the request to this organisation â€” it is INCOHERENCE, which
      // fails in the quiet direction this repository keeps paying for. A
      // `reception_staff` in a supplier organisation resolves the WORKSHOP
      // reception navigation tree (`workspaceForRole`), so the person is shown
      // Vehicle Intake and Customer Complaints for an organisation that has
      // neither, and `isForeignToWorkspace` sends them to the workshop pack,
      // where every API call is scoped to a supplier's tenant. Nothing errors.
      //
      // âš ï¸ ENFORCED ON THE GRANT, NOT ON EXISTING ROWS. This is a forward
      // constraint: the row above keeps working and is not migrated away, so no
      // live membership breaks. A database CHECK would have been the stronger
      // place and is not available â€” the pairing spans two tables.
      //
      // âš ï¸ `platform_administrator` IS DELIBERATELY VALID IN A WORKSHOP. It is
      // the documented compromise the model forces (the owner holds it via a
      // membership attached to their own workshop), and since migration 078 the
      // AUTHORITY comes from a grant record rather than this name, so admitting
      // the name here confers nothing on its own.
      const orgType = org.rows[0]!.org_type;
      if (!roleSuitsOrganisation(input.roleName, orgType)) {
        // Names the mismatch without enumerating the taxonomy, matching the
        // deliberately vague 'unknown role' above: the caller learns that the
        // pair is wrong, not what the full set of valid pairs is.
        throw new BadRequestException(
          `role '${input.roleName}' cannot be granted in a ${orgType} organisation`,
        );
      }

      if (input.branchId) {
        // Also asserts the branch belongs to THIS organization â€” a branch from
        // a sibling organization in the same tenant would pass a bare
        // existence check while scoping the membership to the wrong site,
        // which Â§50's "approved role and branch" rule forbids.
        const branch = await client.query(
          `SELECT 1 FROM identity.branches
              WHERE id = $1 AND organization_id = $2 AND tenant_id = $3`,
          [input.branchId, input.organizationId, ctx.tenantId],
        );
        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
      }

      const res = await client.query(
        `INSERT INTO identity.memberships
           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
        [
          // From the resolved context, never the request body. RLS `WITH CHECK`
          // would reject a mismatch anyway â€” both layers, by design.
          ctx.tenantId,
          input.organizationId,
          input.branchId ?? null,
          userId,
          input.roleName,
          ctx.userId,
        ],
      );

      let row = res.rows[0];
      if (!row) {
        // â”€â”€ the unique constraint fired: this grant already exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //
        // ðŸ”´ AND IT MAY BE A REVOKED ONE, WHICH USED TO BE A DEAD END. A
        // membership is never deleted â€” withdrawal sets `status = 'revoked'`
        // and keeps the row so "was this person ever granted access?" stays
        // answerable. But the row still occupies the unique key, so re-hiring
        // somebody previously removed hit `ON CONFLICT DO NOTHING` and was
        // refused with "membership already exists" â€” a message that is the
        // OPPOSITE of the truth, told to an owner looking at a colleague who
        // demonstrably has no access, with nothing anywhere to undo it.
        //
        // A rule whose escape hatch is unreachable is a wall, not a rule.
        const existing = await client.query(
          `UPDATE identity.memberships
              -- ðŸ”´ THE BRANCH IS RE-SET, NOT INHERITED. The unique key is
              -- (organization_id, user_id, role_name) and does NOT include the
              -- branch, so re-hiring the same person into the same role at a
              -- DIFFERENT site matched the old row and would have reactivated
              -- it with the OLD branch_id â€” quietly granting access to a site
              -- nobody approved, which is exactly what Â§50's "approved role AND
              -- branch" forbids. The branchId parameter has already been
              -- validated against this organization above.
              --
              -- NO BACKTICKS IN THIS COMMENT: it sits inside a TS template
              -- literal, so one terminates the string. FIFTH instance.
              -- (Codex, 2026-08-04.)
              SET status = 'active', branch_id = $6,
                  updated_at = now(), updated_by = $1
            WHERE organization_id = $2 AND user_id = $3 AND role_name = $4
              AND tenant_id = $5
              -- Only a WITHDRAWN one is reinstated. An ACTIVE row matches
              -- nothing here and still falls through to the refusal below,
              -- because "add them again" when they are already there changed
              -- nothing and must not read as though it did.
              AND status <> 'active'
            RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
          [ctx.userId, input.organizationId, userId, input.roleName, ctx.tenantId,
           input.branchId ?? null],
        );
        row = existing.rows[0];
      }
      if (!row) {
        throw new BadRequestException('membership already exists');
      }

      await this.audit.write(client, ctx, {
        action: 'membership.granted',
        resourceType: 'membership',
        resourceId: row.id,
        detail: {
          // ðŸ”´ THE RESOLVED ID, NOT `input.userId`. Once `userEmail` became an
          // accepted input, `input.userId` was undefined for every grant made
          // by email â€” so the audit entry for the platform's PRIVILEGE-GRANTING
          // operation would have recorded `userId: undefined` and lost the one
          // fact it exists to preserve: who was given access.
          userId,
          organizationId: input.organizationId,
          branchId: input.branchId ?? null,
          roleName: input.roleName,
        },
      });

      return this.toDomain(row);
    });
  }

  /**
   * Suspend or revoke a membership â€” withdrawing access.
   *
   * Status only ever moves toward LESS access. Re-granting is a new grant, with
   * its own audit row, rather than a status flip: the audit trail for approvals
   * and access is append-only per CLAUDE.md, and a reversible toggle would make
   * "was this person ever revoked?" unanswerable.
   */
  async withdraw(
    ctx: TenantContext,
    id: string,
    status: 'suspended' | 'revoked',
   *
   * Status only ever moves toward LESS access. Re-granting is a new grant, with
   * its own audit row, rather than a status flip: the audit trail for approvals
   * and access is append-only per CLAUDE.md, and a reversible toggle would make
   * "was this person ever revoked?" unanswerable.
   */
  async withdraw(
    ctx: TenantContext,
    id: string,
    status: 'suspended' | 'revoked',
  ): Promise<Membership> {
    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not withdraw a membership`,
      );
    }

    // Validate the target status AT RUNTIME. The parameter's union type is
    // erased at compile time, and the controller passes the request body
    // straight through, so `{ "status": "active" }` reached this method as a
    // string the database's CHECK constraint happily accepts â€” turning a
    // withdrawal into a silent no-op that still wrote an audit row reading
    // `membership.active`, an action this service never performs. Any other
    // string produced a constraint violation and a 500 where a 400 was owed.
    //
    // The check belongs HERE and not only in the controller because an MCP tool
    // calls this service directly, without passing through any controller. A
    // rule enforced only at the HTTP edge is not enforced for agents â€” which is
    // the whole premise of the AI boundary (`0.txt` Â§13, Â§26).
    if (status !== 'suspended' && status !== 'revoked') {
      throw new BadRequestException('status must be suspended or revoked');
    }

    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE identity.memberships
            SET status = $2, updated_at = now(), updated_by = $3
          WHERE id = $1
            AND status = 'active'
            AND tenant_id = $4
        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
        [id, status, ctx.userId, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // Either it is not in this tenant (RLS hid it) or it was not active.
        // One message for both, so the response cannot be used to probe which.
        throw new NotFoundException('active membership not found');
      }

      await this.audit.write(client, ctx, {
        action: `membership.${status}`,
        resourceType: 'membership',
        resourceId: row.id,
        detail: { userId: row.user_id, roleName: row.role_name },
      });

      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    organization_id: string;
    branch_id: string | null;
    user_id: string;
    role_name: string;
    status: Membership['status'];
    created_at: Date;
  }): Membership => ({
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    userId: row.user_id,
    roleName: row.role_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

codex
One concrete authorization weakness has emerged: the add path pins the organization server-side, but the withdraw path accepts a membership UUID and the API appears to constrain it only by 
tenant—not by the caller’s active organization. I’m verifying the tenant model and endpoint guards before assigning severity, because that determines whether this is a real sibling-organization 
attack or merely defense-in-depth.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content apps/api/src/identity/membership.service.ts | Select-Object -Skip 185 -First 65; Get-Content 
apps/api/src/identity/identity.controllers.ts | Select-Object -Skip 65 -First 50' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "rg -n \"class User|async list\\(|assertWorkshopStaff|isOrganisationAdmin|/users\" apps/api/src/identity -g 
\"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content packages/navigation/src/workspaces.ts | Select-Object -Skip 450 -First 75; Get-Content 
packages/navigation/src/workspaces.ts | Select-Object -Skip 720 -First 40; Get-Content packages/next-shell/src/require-route.ts | Select-Object -Skip 45 -First 75' in 
C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content packages/next-shell/src/api.ts | Select-Object -Skip 100 -First 245; Get-Content 
packages/next-shell/src/viewer.ts | Select-Object -Skip 165 -First 75' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 971ms:
apps/api/src/identity\identity.controllers.ts:60:export class UserController {
apps/api/src/identity\identity.schemas.ts:37: * `grant` took a uuid, and the only way to discover one is `GET /users` — which
apps/api/src/identity\identity.schemas.ts:46: * `GET /users?q=` lookup would be an enumeration oracle over every account on
apps/api/src/identity\identity.spec.ts:257:     * `grant` took a uuid, and the only source of one is `GET /users`, which is
apps/api/src/identity\user.service.ts:4:import { assertWorkshopStaff } from '../authz/workshop-roles';
apps/api/src/identity\user.service.ts:44:export class UserService {
apps/api/src/identity\user.service.ts:54:  async list(ctx: TenantContext): Promise<TenantUser[]> {
apps/api/src/identity\user.service.ts:58:    assertWorkshopStaff(ctx, 'The workshop staff directory');
apps/api/src/identity\user.service.ts:92:    assertWorkshopStaff(ctx, 'This staff record');
apps/api/src/identity\organization-registration.service.ts:187:  async list(
apps/api/src/identity\organization.service.ts:5:import { assertWorkshopStaff } from '../authz/workshop-roles';
apps/api/src/identity\organization.service.ts:45:  async list(ctx: TenantContext): Promise<Organization[]> {
apps/api/src/identity\organization.service.ts:49:    assertWorkshopStaff(ctx, 'The organisations in this tenant');
apps/api/src/identity\organization.service.ts:76:    assertWorkshopStaff(ctx, 'This organisation');
apps/api/src/identity\organization-registration.controller.ts:50:  async list(
apps/api/src/identity\membership.service.ts:11:  assertWorkshopStaff,
apps/api/src/identity\membership.service.ts:12:  isOrganisationAdmin,
apps/api/src/identity\membership.service.ts:193:  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
apps/api/src/identity\membership.service.ts:199:    // `assertWorkshopStaff` alone made the grant authority 085 created
apps/api/src/identity\membership.service.ts:212:    if (!isWorkshopStaff(ctx) && !isOrganisationAdmin(ctx)) {
apps/api/src/identity\membership.service.ts:213:      assertWorkshopStaff(ctx, 'The membership roster');
apps/api/src/identity\branch.service.ts:6:  assertWorkshopStaff,
apps/api/src/identity\branch.service.ts:7:  isOrganisationAdmin,
apps/api/src/identity\branch.service.ts:64:  async list(ctx: TenantContext, organizationId?: string): Promise<Branch[]> {
apps/api/src/identity\branch.service.ts:73:    if (!isWorkshopStaff(ctx) && !isOrganisationAdmin(ctx)) {
apps/api/src/identity\branch.service.ts:74:      assertWorkshopStaff(ctx, 'The branch list');
apps/api/src/identity\branch.service.ts:101:    if (!isWorkshopStaff(ctx) && !isOrganisationAdmin(ctx)) {
apps/api/src/identity\branch.service.ts:102:      assertWorkshopStaff(ctx, 'This branch');

 succeeded in 1413ms:
@Injectable()
export class MembershipService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
    // ðŸ”´ STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard â€”
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    //
    // ðŸ”´ â€¦OR THE ORGANISATION'S OWN ADMINISTRATOR (085, Supervisor pass).
    // `assertWorkshopStaff` alone made the grant authority 085 created
    // UNUSABLE BY THE ROLES IT WAS CREATED FOR: an `insurance_owner` could
    // `POST /memberships` (201) and then `GET /memberships` (403), so they
    // could never see who was in their own organisation â€” and since
    // `withdraw()` needs an `id` that only this roster returns, every
    // appointment they made was IRREVERSIBLE. A write half with no readable
    // roster is the same defect as a withdrawal with no caller.
    //
    // âš ï¸ This does NOT let a partner admin read a workshop's roster. The query
    // below is tenant-scoped and RLS backstops it, and a partner organisation
    // has its own tenant (076/080) â€” so the widening is confined to the
    // caller's own organisation, which is exactly what "administer your own
    // business" means.
    if (!isWorkshopStaff(ctx) && !isOrganisationAdmin(ctx)) {
      assertWorkshopStaff(ctx, 'The membership roster');
    }
    return this.db.withTenant(ctx, async (client) => {
      // CLAUDE.md Â§6: the application filters AND RLS backstops it. Seeded
      // rather than appended, so the tenant predicate cannot go missing when
      // no other filter is supplied -- and so a platform administrator, whom
      // the RLS policy permits across tenants, still gets the ONE tenant this
      // request resolved to.
      const values: unknown[] = [ctx.tenantId];
      const where: string[] = ['tenant_id = $1'];
      if (filter.userId) {
        values.push(filter.userId);
        where.push(`user_id = $${values.length}`);
      }
      if (filter.organizationId) {
        values.push(filter.organizationId);
        where.push(`organization_id = $${values.length}`);
      }
      const res = await client.query(
        `SELECT id, organization_id, branch_id, user_id, role_name, status, created_at
           FROM identity.memberships
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY created_at`,
        values,
      );
      return res.rows.map(this.toDomain);
    });
  }

  /**
   * Grant a membership â€” the platform's privilege-granting operation.
   *
   * `07.txt` part 2 Â§3 (staff invitation): role and approval limits are set at
   * invitation. Â§50's closing rule governs the result: "No user shall receive
   * functions outside the user's approved role and branch."
   */
  async grant(
    ctx: TenantContext,
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.findById(req.tenantContext, id);
  }
}

@Controller('memberships')
@UseGuards(TenantGuard)
export class MembershipController {
  constructor(private readonly memberships: MembershipService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.memberships.list(req.tenantContext, { userId, organizationId });
  }

  @Post()
  grant(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(GrantMembershipBody)) body: GrantMembershipBody,
  ) {
    return this.memberships.grant(req.tenantContext, body);
  }

  /**
   * PATCH, not DELETE: a membership is never removed. Withdrawal is a status
   * transition that leaves the row and its audit trail intact, because
   * "was this person ever granted access?" must stay answerable.
   */
  @Patch(':id/status')
  withdraw(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(WithdrawMembershipBody)) body: WithdrawMembershipBody,
  ) {
    return this.memberships.withdraw(req.tenantContext, id, body.status);
  }
}

/**
 * `GET /me` â€” who the caller is, and what their role may see.
 *
 * The endpoint the Next apps call to stop guessing. Everything it returns is
 * derived from the validated token plus membership records; no field of the

 succeeded in 1364ms:
    ['approved-repairs', 'Approved Repairs'],
    ['rejected-requests', 'Rejected Requests'],
    ['supplementary-requests', 'Supplementary Requests'],
  ]),
  group('workshops-and-products', 'Workshops and Products', 'box', [
    ['approved-workshops', 'Approved Workshops'],
    ['parts-review', 'Parts Review'],
    ['supplier-information', 'Supplier Information'],
  ]),
  group('finance-and-reports', 'Finance and Reports', 'card', [
    ['payments', 'Payments', { permission: 'finance.read' }],
    ['claim-costs', 'Claim Costs', { permission: 'finance.read' }],
    ['reports', 'Reports'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'insurance.messages.unread' }],
    ['calls', 'Calls'],
    ['disputes', 'Disputes', { warningKey: 'insurance.disputes.open' }],
  ]),
  group(
    'settings',
    'Settings',
    'settings',
    [
      ['users', 'Users'],
      ['approval-rules', 'Approval Rules'],
      ['claim-rules', 'Claim Rules'],
      ['integrations', 'Integrations'],
    ],
    'organization.admin',
  ),
];

/* ------------------------------------------------------------------ *
 * TOWING WORKSPACE â€” `autoworkshop 02.txt` Â§52
 *
 * NOTE THE DIFFERENT SOURCE. Â§52 gives towing a FLAT list of 10 entries, not
 * the grouped structure Â§33-37 use for the other workspaces. That is the spec's
 * shape, so it is preserved: one group holding the flat list, rather than
 * inventing groupings the spec never asked for. If grouping is wanted later it
 * is a spec change first.
 * ------------------------------------------------------------------ */

const towingGroups: NavGroup[] = [
  group('operations', 'Operations', 'truck', [
    ['dashboard', 'Dashboard'],
    ['new-requests', 'New Requests', { counterKey: 'towing.requests.new' }],
    ['dispatch-board', 'Dispatch Board', { counterKey: 'towing.dispatch.active' }],
    ['drivers', 'Drivers'],
    ['recovery-vehicles', 'Recovery Vehicles'],
    ['active-recoveries', 'Active Recoveries', { counterKey: 'towing.recoveries.active' }],
    ['completed-recoveries', 'Completed Recoveries'],
    ['invoices', 'Invoices', { permission: 'finance.read' }],
    ['incidents', 'Incidents', { warningKey: 'towing.incidents.open' }],
    ['settings', 'Settings', { permission: 'organization.admin' }],
  ]),
];

/* ------------------------------------------------------------------ *
 * PLATFORM ADMINISTRATION â€” `autoworkshop 02.txt` Â§58
 *
 * Also a flat list in the spec (25 entries). Split here into themed groups
 * because a 25-item flat side nav is precisely what Â§16 exists to prevent
 * ("rather than displayed as a long list of individual links"). Every LABEL is
 * the spec's; only the grouping is applied, and Â§32's own group titles are
 * reused so the naming stays the spec's too.
 *
 * The whole workspace is gated on `platform.admin` â€” Â§32: "visible only to
 * authorized administrative, security and operational users."
 * ------------------------------------------------------------------ */

const adminGroups: NavGroup[] = [
  group('home', 'Home', 'home', [['operations-dashboard', 'Operations Dashboard']], 'platform.admin'),
  group(
    'directory',
    ['wiring-diagrams', 'Wiring Diagrams'],
    ['training', 'Training'],
    ['competencies', 'Competencies'],
    ['certifications', 'Certifications'],
  ]),
  group('reports', 'Reports', 'chart', [
    ['workshop-performance', 'Workshop Performance'],
    ['technician-productivity', 'Technician Productivity'],
    ['service-bay-utilization', 'Service-Bay Utilization'],
    ['customer-service', 'Customer Service'],
    ['inventory', 'Inventory'],
    ['finance', 'Finance', { permission: 'finance.read' }],
    ['warranty', 'Warranty'],
  ]),
  group(
    'settings',
    'Settings',
    'cog',
    [
      ['workflow-rules', 'Workflow Rules'],
      ['approval-limits', 'Approval Limits'],
      ['templates', 'Templates'],
      ['notifications', 'Notifications'],
      ['security', 'Security'],
      ['integrations', 'Integrations'],
    ],
    'organization.admin',
  ),
];

/** Â§47 â€” Workshop Manager: daily operational control, assignment, workflow. */
const workshopManagerGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Operations Dashboard'],
    ['my-tasks', 'My Tasks', { counterKey: 'workshop.tasks.open' }],
    ['notification-inbox', 'Notification Inbox', { counterKey: 'workshop.notifications.unread' }],
    ['workshop-calendar', 'Workshop Calendar'],
  ]),
  group('requests-and-reception', 'Requests and Reception', 'users', [
    ['register-customer', 'Register Customer'],
 * shows only the denial. See `require-access.ts`.
 *
 * NOT THE CONTROL, AND NOTHING HERE MAY BE RELIED ON AS ONE. CLAUDE.md Â§8:
 * "Hidden â‰  secure." The API's `TenantGuard`, the services' role checks and
 * Postgres RLS deny independently, and every page must remain safe if this call
 * were deleted. What this stops is a viewer reaching a screen their own
 * navigation does not advertise â€” the Phase 3 acceptance criterion.
 *
 * 404 rather than 403, deliberately: a 403 confirms the route exists and hands
 * an unauthorised viewer a map of the platform's screens.
 */
export async function requireNavRoute(
  workspaceId: string,
  /** The route's own path, e.g. `/customer-reception/customers`. */
  pathname: string,
): Promise<void> {
  const base = getWorkspace(workspaceId);
  if (!base) notFound();

  // Resolved together and from the same helpers the layout and the catch-all
  // use. `currentViewer` and `viewerRole` are memoised per request with React's
  // `cache()`, so this cannot resolve a different identity than the shell
  // rendering around it.
  const [viewer, role] = await Promise.all([
    currentViewer(workspaceId),
    viewerRole(workspaceId),
  ]);

  // ðŸ”´ A ROLE FROM ANOTHER WORKSPACE IS REFUSED BEFORE THE TREE IS CONSULTED.
  //
  // Consulting it would ADMIT them. `navRoleFor()` returns `undefined` for a
  // customer, `workspaceForRole(base, undefined)` returns the workshop's DEFAULT
  // staff tree, and every item in that tree is ungated â€” so `visibleGroups`
  // filters nothing and all 45 entries come back "advertised". Measured: a
  // signed-in customer could reach Customers, Vehicles, Job Cards, Quotations,
  // Suppliers, Warranty Claims and the Reports screens.
  //
  // This is the REFUSING half of that fix. The navigation half lives in
  // `WorkspaceShell`, and neither is sufficient alone: hiding without refusing
  // is what CLAUDE.md Â§8 forbids by name, and refusing without hiding leaves 45
  // menu entries that 404 â€” the signpost-that-404s failure this repository has
  // already paid for three times.
  // âš ï¸ SCOPED TO THE WORKSPACE BEING RENDERED. This asked
  // `isForeignToWorkshop` while holding `workspaceId` and ignoring it, so a
  // customer was refused on CUSTOMER-web and a fleet administrator on
  // FLEET-web â€” the apps those roles exist for. See `isForeignToWorkspace`.
  if (isForeignToWorkspace(workspaceId, viewer?.activeRole)) notFound();

  // A signed-out visitor has no role and no grants, so they fall through to the
  // workspace default tree with `NO_GRANTS` â€” which is correct: they see what an
  // anonymous visitor may see, which for every gated item is nothing.
  const workspace = workspaceForRole(base, role);
  const groups = visibleGroups(workspace, grantsFor(viewer));

  // ADR-021 SYMMETRY. `visibleGroups` now returns MOUNTED hrefs (`/customer/...`),
  // while the 341 pages that call this still pass their own literal spec route
  // (`/customer-reception/customers`) because none of them were edited by the
  // consolidation. Normalising here â€” rather than at 341 call sites â€” is what
  // keeps the two comparable.
  //
  // ðŸ”´ IF THIS LINE IS REMOVED THE FAILURE IS SILENT AND TOTAL: no href would
  // ever equal an unmounted pathname, `advertised` would be false everywhere,
  // and every gated page in the product would 404 underneath a green build.
  // `withPackBase` is idempotent, so a caller that already passes a mounted
  // path is unaffected.
  const wanted = withPackBase(workspaceId, pathname);
  const advertised = groups.some((g) => g.items.some((i) => i.href === wanted));
  if (!advertised) notFound();
}

 succeeded in 1488ms:
 * is not refusing; the request must not be made.
 *
 * âš ï¸ A VIEWER WITH NO MEMBERSHIPS IS NOT REFUSED. A parts buyer with no
 * workshop affiliation is a REAL and intended user of this app â€” `/me` is
 * behind TenantGuard so they resolve to no viewer at all, and the marketplace
 * and basket are built for exactly that person. The refusal is narrow: a viewer
 * who resolved, holds memberships, and none of them is `customer`.
 *
 * âš ï¸ AND IT IS STILL NOT THE CONTROL. The API scopes and RLS isolates,
 * independently (CLAUDE.md Â§8). This closes a workspace the caller should never
 * have been reading; it does not replace either layer beneath it.
 */
async function refusedForWorkspace(
  workspaceId: WorkspaceId | string,
): Promise<ApiResult<never> | null> {
  if (workspaceId !== 'customer') return null;
  const viewer = await currentViewer(workspaceId);
  if (!viewer || viewer.memberships.length === 0) return null;
  const isCustomer = viewer.memberships.some((m) => m.roleName === 'customer');
  return isCustomer ? null : { ok: false, reason: 'forbidden', status: 403 };
}

/**
 * A READ that survives a cold container.
 *
 * â”€â”€ ðŸ”´ THE PROBLEM THIS SOLVES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Render's free tier spins a service down after ~15 minutes idle. Measured on
 * 2026-08-06: the API answers in 21.6s COLD and 0.91s WARM; Keycloak 136s cold
 * and 0.68s warm. Both return 200 â€” nothing is broken.
 *
 * But this read path was a ONE-SHOT. The first request after idle hit a waking
 * container, something in the chain gave up, and the user got "This information
 * is temporarily unavailable". The owner reported exactly that, and was right
 * about the framing: IF IT DOES NOT WORK FOR THE USER, IT IS DOWN TO THE USER.
 * A cold start is an explanation, not a defence.
 *
 * The second request is always fast, because THE FIRST ONE WOKE THE CONTAINER.
 * So one retry turns a 22-second error into a ~23-second page load, and costs
 * nothing â€” no extra instance-hours, which matters because the 750-hour Render
 * allowance is spent on other things the owner needs (ADR-012: no paid remedy).
 *
 * â”€â”€ âš ï¸ ONE RETRY, NOT A LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * A cold start is a single event. A loop would turn a REAL outage into a slow
 * one, holding the request open and making the page feel broken instead of
 * showing an honest error state quickly.
 *
 * â”€â”€ ðŸ”´ READS ONLY â€” A RETRIED WRITE IS A DOUBLE WRITE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * `apiPost`/`apiPatch`/`apiDelete` are deliberately NOT changed. This
 * application records payments, raises invoices and books resources; a retry
 * that duplicated any of those would be far worse than the error it fixed.
 * Cold-start-safe writes need idempotency keys â€” a different piece of work.
 *
 * âš ï¸ IT DOES NOT MATTER WHICH LAYER GIVES UP â€” undici, Render's edge, or
 * Next's fetch. Both observable signatures are handled: a THROWN fetch
 * (refused/reset while waking) and a 502/503/504 from the edge while it waits
 * for the container. The fix is agnostic to the cause, which is why it is safe
 * to ship without isolating it.
 */
const COLD_START_STATUSES = new Set([502, 503, 504]);
const COLD_START_RETRY_MS = 1500;

async function fetchRead(url: string, init: RequestInit): Promise<Response> {
  try {
    const first = await fetch(url, init);
    if (!COLD_START_STATUSES.has(first.status)) return first;
    // The edge answered for a container that is not up yet. It is waking now.
    await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS));
    return await fetch(url, init);
  } catch {
    // Thrown: refused, reset, or given up on while the container wakes. That
    // attempt itself started the wake, so the retry usually lands on a live
    // service. If it throws again the caller degrades to `unavailable` exactly
    // as before â€” this never makes the failure path worse.
    await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS));
    return await fetch(url, init);
  }
}

export async function apiGet<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  // BEFORE the token is even fetched: a caller who may not read this workspace
  // must not reach the API at all.
  const refused = await refusedForWorkspace(workspaceId);
  if (refused) return refused;

  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // Null means no session or an expired token. Fail closed: never fall back to
  // an unauthenticated call, because these endpoints would then answer 401 and
  // the page would report "unavailable" for what is really "please sign in".
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetchRead(`${apiBaseUrl()}/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // The viewer's chosen organization (T-0016). Absent until they pick
        // one, in which case the API takes its own deterministic default.
        ...(await activeOrganizationHeader(workspaceId)),
        // The viewer's chosen ROLE. Absent until they pick one, in which case
        // the API takes its own deterministic default. Validated again there â€”
        // a role the viewer does not hold is REFUSED, never downgraded.
        ...(await activeRoleHeader(workspaceId)),
      },
      cache: 'no-store',
    });
  } catch {
    // DNS failure, connection refused, TLS error. The API being down must
    // degrade to an error STATE, never to an exception that removes the page.
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    switch (response.status) {
      case 401: {
        // ðŸ”´ TWO DIFFERENT FACTS SHARE THIS STATUS CODE. `TenantGuard` throws
        // 401 both for "no bearer token / expired" and for
        // `TenantResolutionError` â€” of which the common case is
        // "user holds no active membership", i.e. somebody perfectly signed in
        // who simply belongs to no workshop yet.
        //
        // The remedies are opposite: one is "sign in again", the other is
        // "create or join a workshop". Telling the second group the first thing
        // is how an account gets stuck in a sign-in loop it cannot escape.
        //
        // Read from the API's OWN message rather than guessing, and fall back
        // to `unauthenticated` when it says nothing â€” the safer of the two.
        const said = await response
          .clone()
          .json()
          .then((b: { message?: string }) => String(b?.message ?? ''))
          .catch(() => '');
        if (/membership|no membership selected|not among the user/i.test(said)) {
          return { ok: false, reason: 'noMembership', status: 401, message: said };
        }
        return { ok: false, reason: 'unauthenticated', status: 401 };
      }
      case 403:
        return { ok: false, reason: 'forbidden', status: 403 };
      case 404:
        return { ok: false, reason: 'notFound', status: 404 };
      default:
        return { ok: false, reason: 'unavailable', status: response.status };
    }
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    // A 200 carrying HTML â€” a proxy error page, typically. Treating it as data
    // would put `[object Object]` on the screen instead of an error state.
    return { ok: false, reason: 'unavailable', status: response.status };
  }
}

/**
 * POST a resource as the current viewer.
 *
 * Same discipline as `apiGet` and for the same reasons â€” server only, so the
 * access token never reaches the browser, and IT NEVER THROWS, because a form
 * that throws on a rejected submission destroys the page the user was filling
 * in along with everything they typed.
 *
 * The one difference is `invalid`. A write can fail on its CONTENT â€” a duplicate
 * registration number, a malformed field â€” and that is the only failure the
 * person at the keyboard can actually do something about, so the API's message
 * is carried back rather than replaced with a generic apology. Those messages
 * are written to describe the INPUT ("a vehicle with this registration number or
 * VIN already exists"), never the system, so passing them through leaks nothing.
 *
 * `cache` is not set: Next does not cache POSTs. `no-store` is on `apiGet`
 * because a cached tenant-scoped GET is one tenant's data served to the next
 * viewer; that hazard does not exist here.
 */
export async function apiPost<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('POST', workspaceId, path, body);
}

/**
 * PUT a complete resource as the current viewer.
 *
 * âš ï¸ `PUT` RATHER THAN `PATCH`, AND THE DIFFERENCE IS LOAD-BEARING FOR ITS FIRST
 * CALLER. `apiPatch` means "change these fields"; this means "replace the whole
 * set". The workshop's pricing row is read as a UNIT by `quotation.service.ts`
 * when a quotation is built, so a partial write would leave a workshop quoting
 * with a new labour rate against an old tax rate â€” a combination nobody chose
 * and nobody can see on screen. The API's `parsePricingInput` requires every
 * field for the same reason, so a partial body is refused rather than merged.
 *
 * Shares `apiWrite` with the others: same auth, same never-throws contract, same
 * `invalid` pass-through so a screen can render the API's own sentence.
 */
export async function apiPut<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PUT', workspaceId, path, body);
}

/**
 * PATCH a resource as the current viewer.
 *
 * Identical handling to `apiPost` â€” same auth, same never-throws contract, same
 * `invalid` pass-through â€” and shares its implementation rather than copying it
 * (Directive Â§3). The distinction is only the verb: a PATCH sends the fields
 * being changed, so the caller does not have to hold a whole record it never
 * read and cannot accidentally write back a stale copy of the rest of it.
 *
 * `1.txt` Â§394's refusals arrive here as `invalid` (a 400 â€” "requires
 * overrideReason") or `forbidden` (a 403 â€” "role may not move a job card to
 * ..."), and the board shows the API's own sentence for the first because it
 * describes what the person can actually do about it.
 */
export async function apiPatch<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PATCH', workspaceId, path, body);
}

/**
 * DELETE a resource as the current viewer.
 *
 * Shares `apiWrite` for the same reasons `apiPatch` does â€” same auth, same
 * never-throws contract, same `invalid` pass-through.
 *
 * âš ï¸ NO BODY IS SENT, and that is why this is a separate export rather than
 * `apiWrite('DELETE', ..., {})`. An empty object would still set
 * `Content-Type: application/json` and a `{}` payload on a request whose meaning
 * is entirely in its URL â€” harmless today, and exactly the kind of thing a strict
 * gateway or a future body-schema validator rejects with a message about JSON when
 * the caller sent no data at all.
 *
 * Added for slice 3b's `removeFinding` (`DELETE /diagnoses/:id/findings/:id`),
 *
 * Costs nothing extra: no network call, just the cookie already on the request.
 */
export async function viewerHasSession(workspaceId: WorkspaceId | string): Promise<boolean> {
  return workspaceAuth(workspaceId).hasSession();
}

/** The viewer, or `null` when nobody is signed in. */
export async function currentViewer(
  workspaceId: WorkspaceId | string,
): Promise<ViewerDescription | null> {
  return fetchViewer(workspaceId);
}

/**
 * The viewer's permission grants â€” THE single source, for both the navigation
 * and the route resolver.
 *
 * The reason it is one function has not changed since it held demo data: the
 * grants were briefly supplied in two places, the side nav advertised modules
 * that answered 404 when clicked, and two sources of truth for "what may this
 * user see" produced that bug immediately. Now that the value comes from a
 * session the risk is worse, not better â€” two call sites could resolve two
 * different identities.
 */
export async function viewerGrants(
  workspaceId: WorkspaceId | string,
): Promise<readonly PermissionKey[]> {
  return grantsFor(await fetchViewer(workspaceId));
}

/**
 * The viewer's ROLE within a workspace â€” `07.txt` part 2 Â§46-Â§49 (T-0027).
 *
 * The role decides WHICH navigation tree the viewer is on; the grants decide
 * which of its entries they may open. Both must come from the same resolved
 * viewer, which is why they share `fetchViewer` rather than each fetching.
 *
 * ROLE IS NOT AUTHORITY. Selecting a tree grants nothing: every item in it is
 * still permission-filtered, and the API plus RLS deny independently. Â§50's rule
 * â€” "No user shall receive functions outside the user's approved role and
 * branch" â€” is enforced there, not by which menu got rendered.
 *
 * An unauthenticated viewer has no role, so the workspace's own default tree is
 * shown. That is the honest rendering of "we do not know who you are"; it is
 * not a fallback to a privileged view, because the default tree is filtered by
 * `NO_GRANTS`.
 */
export async function viewerRole(
  workspaceId: WorkspaceId | string,
): Promise<RoleId | undefined> {
  const viewer = await fetchViewer(workspaceId);
  return navRoleFor(viewer?.activeRole);
}

export { grantsFor, navRoleFor, NO_GRANTS };
export type { ViewerDescription };

/**
 * The organization header for ordinary API calls â€” VALIDATED.
 *
 * Drops a stored selection the viewer does not (or no longer) holds, so a stale
 * cookie degrades to the API's default instead of failing every request. The
 * check is a convenience, NOT the control: the API re-validates every
 * `x-organization-id` against the user's own memberships and refuses one that
 * is not theirs, whatever this sends.
 *
 * Lives here rather than in `active-organization.ts` because it needs the
 * viewer, and `active-organization.ts` is imported BY the viewer lookup â€”
 * putting it there would make the two modules import each other.
 */
export async function activeOrganizationHeader(
  workspaceId: WorkspaceId | string,
): Promise<Record<string, string>> {
  const id = await activeOrganizationId();

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content apps/api/src/identity/user.service.ts | Select-Object -Skip 40 -First 75; Get-Content 
apps/api/src/authz/workshop-roles.ts | Select-Object -Skip 1 -First 115' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'git diff --check; git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "Get-Content -Raw apps/web/package.json; rg --files apps/web/app/insurance/settings 
apps/web/app/towing/operations/settings | rg \"loading\\.tsx|error\\.tsx\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "OrgStaff|InsuranceStaff|TowingStaff|settings/users" apps/web -g "*.spec.ts" -g "*.test.ts" -g 
"*.spec.tsx" -g "*.test.tsx"; rg -n "insurance_owner.*users|UserService.*insurance|organisation administrator.*directory" apps/api/src/identity/*.spec.ts' in 
C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T18:22:53.441478Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:
rg: apps/api/src/identity/*.spec.ts: IO error for operation on apps/api/src/identity/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 exited 1 in 1062ms:
rg: apps/api/src/identity/*.spec.ts: IO error for operation on apps/api/src/identity/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'Get-Content apps/api/src/identity/user.service.ts | Select-Object -Skip 40 -First 75' in 
C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'git diff --check' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "OrgStaff|InsuranceStaff|TowingStaff|settings/users" apps/web -g "*.spec.ts" -g "*.test.ts" -g 
"*.spec.tsx" -g "*.test.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T18:23:00.654163Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.8 seconds
Output:

 exited 1 in 844ms:
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command 'rg -n "''^" apps/api/src/identity/user.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 324ms:
1:import { Injectable, NotFoundException } from '@nestjs/common';
2:import { DatabaseService } from '../database/database.service';
3:import type { TenantContext } from '../tenancy/tenant-context';
4:import { assertWorkshopStaff } from '../authz/workshop-roles';
5:
6:export interface TenantUser {
7:  id: string;
8:  email: string;
9:  displayName: string;
10:  phone: string | null;
11:  preferredLocale: string;
12:  status: string;
13:  /** The roles this user holds IN THE ACTIVE TENANT — never across tenants. */
14:  roles: string[];
15:}
16:
17:/**
18: * User directory, scoped to the active tenant — T-0003.
19: *
20: * ⚠️ READ THIS BEFORE ADDING A QUERY TO THIS FILE. ⚠️
21: *
22: * `identity.users` is the ONE table in the identity schema that is deliberately
23: * NOT tenant-scoped and has NO row-level security. Migration 001 says so
24: * explicitly: one human may hold memberships in several tenants, so the user
25: * row cannot belong to any single one of them.
26: *
27: * The consequence is sharp, and it is the opposite of everywhere else in this
28: * codebase: **RLS will not save you here.** A plain
29: * `SELECT * FROM identity.users` inside `withTenant` returns every user on the
30: * platform, across every tenant, and no policy stops it. It will look correct
31: * in review, pass typecheck, and leak the entire user base.
32: *
33: * Every query below therefore reaches users ONLY through
34: * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
35: * The join is what scopes the result: rows survive only for users who hold a
36: * membership visible to the current tenant. `user_directory_is_scoped_by_
37: * membership` in the spec file asserts this property, because a comment does
38: * not stop anyone.
39: *
40: * This also matches the authority model in PLAN_EXTENSION_v1 §2.1 — authority
41: * derives from membership, never from the user record itself.
42: */
43:@Injectable()
44:export class UserService {
45:  constructor(private readonly db: DatabaseService) {}
46:
47:  /**
48:   * Users who hold a membership in the active tenant.
49:   *
50:   * Aggregating roles rather than returning one row per membership: a user with
51:   * three roles is one person in the directory, and `07.txt` part 2 §46's Staff
52:   * screen lists people, not role assignments.
53:   */
54:  async list(ctx: TenantContext): Promise<TenantUser[]> {
55:    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
56:    // this same organisation and the controller carries only TenantGuard —
57:    // who you are, not what you may do. See `authz/workshop-roles.ts`.
58:    assertWorkshopStaff(ctx, 'The workshop staff directory');
59:    return this.db.withTenant(ctx, async (client) => {
60:      const res = await client.query(
61:        `SELECT u.id,
62:                u.email,
63:                u.display_name,
64:                u.phone,
65:                u.preferred_locale,
66:                u.status,
67:                array_agg(m.role_name ORDER BY m.role_name) AS roles
68:           FROM identity.memberships m
69:           JOIN identity.users u ON u.id = m.user_id
70:          WHERE m.status = 'active'
71:            AND m.tenant_id = $1
72:          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status
73:          ORDER BY u.display_name`,
74:        [ctx.tenantId],
75:      );
76:      return res.rows.map(this.toDomain);
77:    });
78:  }
79:
80:  /**
81:   * One user, but only if they are a member of the active tenant.
82:   *
83:   * Driving from `memberships` rather than from `users` is what makes this
84:   * safe: an id belonging to a user in another tenant simply matches no
85:   * membership row and yields 404 — the same non-oracle behaviour as the other
86:   * services, arrived at through the join instead of through a policy.
87:   */
88:  async findById(ctx: TenantContext, id: string): Promise<TenantUser> {
89:    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
90:    // this same organisation and the controller carries only TenantGuard —
91:    // who you are, not what you may do. See `authz/workshop-roles.ts`.
92:    assertWorkshopStaff(ctx, 'This staff record');
93:    return this.db.withTenant(ctx, async (client) => {
94:      const res = await client.query(
95:        `SELECT u.id,
96:                u.email,
97:                u.display_name,
98:                u.phone,
99:                u.preferred_locale,
100:                u.status,
101:                array_agg(m.role_name ORDER BY m.role_name) AS roles
102:           FROM identity.memberships m
103:           JOIN identity.users u ON u.id = m.user_id
104:          WHERE u.id = $1
105:            AND m.status = 'active'
106:            AND m.tenant_id = $2
107:          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status`,
108:        [id, ctx.tenantId],
109:      );
110:      const row = res.rows[0];
111:      if (!row) throw new NotFoundException('user not found');
112:      return this.toDomain(row);
113:    });
114:  }
115:
116:  private toDomain = (row: {
117:    id: string;
118:    email: string;
119:    display_name: string;
120:    phone: string | null;
121:    preferred_locale: string;
122:    status: string;
123:    roles: string[] | null;
124:  }): TenantUser => ({
125:    id: row.id,
126:    email: row.email,
127:    displayName: row.display_name,
128:    phone: row.phone,
129:    preferredLocale: row.preferred_locale,
130:    status: row.status,
131:    roles: row.roles ?? [],
132:  });
133:}

codex
## Findings

- **HIGH — Both new screens fail before rendering the add form.**  
  [org-staff-screen.tsx](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:98) requests `GET /users`, but 
[user.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/user.service.ts:54) still calls `assertWorkshopStaff`. Neither `insurance_owner` nor `towing_owner` is workshop 
staff.  
  Failing input: sign in as either founder and open `/insurance/settings/users` or `/towing/operations/settings`. `/memberships` succeeds, `/users` returns 403, and line 103 renders `ApiFailure`; 
because the form is below both successful reads, the founder still cannot add anyone.  
  The comments at [org-staff-screen.tsx:20](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:20) claiming “BOTH READS” were opened to these roles are 
plainly wrong. Only `MembershipService.list()` was widened.

- **HIGH — A forged withdrawal can target any active membership in the tenant, not necessarily the active organization.**  
  [org-staff-core.ts:107](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-core.ts:107) accepts `membershipId` from client-controlled `FormData`. The API update in 
[membership.service.ts:519](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:519) checks only `id`, active status, and `tenant_id`; it never requires 
`organization_id = ctx.organizationId`.  
  Failing input: replace the hidden membership UUID with an active membership UUID belonging to a sibling organization in the same tenant. An `insurance_owner` or `towing_owner` can revoke it 
despite not administering that organization. RLS does not prevent this because it is tenant-scoped.  
  This contradicts the “caller’s own organisation” security claims. Current partner registration may normally create one organization per tenant, but the service and schema support multiple 
organizations, so that operational convention is not an authorization boundary.

- **MEDIUM — The change has no regression tests for its central behavior.**  
  There are no new tests covering owner access to `/users`, exact offered role sets, route refusal for operational roles, immutable action workspace selection, or cross-organization withdrawal. 
The first finding is exactly the kind of incomplete backend/UI integration such a journey or service test should catch. This does not satisfy the repository’s stated Definition of Complete.

- **LOW — `dynamic = 'force-dynamic'` is exported from a non-route module and has no route-segment effect.**  
  [org-staff-screen.tsx:26](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:26) is an ordinary imported component, not a `page.tsx` or `layout.tsx`; 
Next only consumes route-segment configuration from route modules. The reads currently use `no-store` and session APIs, so this is unlikely to cause stale data, but the export does not do what 
its placement suggests.

## Checks that pass

- The offered roles exactly match `ROLES_BY_ORG_TYPE`:

  - Insurance: `insurance_owner`, `insurance_assessor`
  - Towing: `towing_owner`, `towing_operator`

- The workspace identifier used by add/withdraw actions is bound in per-pack `'use server'` modules. A browser cannot substitute the insurance action’s workspace with towing or workshop.

- The add action derives `organizationId` from `currentViewer()`, not form data. Through these new callers, a client cannot choose the grant organization. The API also checks grant authority, 
tenant membership of the organization, and role/organization compatibility.

- Both pages call `requireNavRoute()` before rendering components that access data, so unauthorized RSC execution is avoided at the route level.

- Passing an exported server action into a client component is valid Next.js usage here. The `'use server'` boundaries are correctly placed.

- Loading, empty, read-error, action-error, pending-submit, confirmation, and route-permission states are represented. The primary problem is that the read authorization mismatch makes the 
successful insurance/towing state unreachable.
tokens used
71,741
## Findings

- **HIGH — Both new screens fail before rendering the add form.**  
  [org-staff-screen.tsx](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:98) requests `GET /users`, but [user.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/user.service.ts:54) still calls `assertWorkshopStaff`. Neither `insurance_owner` nor `towing_owner` is workshop staff.  
  Failing input: sign in as either founder and open `/insurance/settings/users` or `/towing/operations/settings`. `/memberships` succeeds, `/users` returns 403, and line 103 renders `ApiFailure`; because the form is below both successful reads, the founder still cannot add anyone.  
  The comments at [org-staff-screen.tsx:20](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:20) claiming “BOTH READS” were opened to these roles are plainly wrong. Only `MembershipService.list()` was widened.

- **HIGH — A forged withdrawal can target any active membership in the tenant, not necessarily the active organization.**  
  [org-staff-core.ts:107](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-core.ts:107) accepts `membershipId` from client-controlled `FormData`. The API update in [membership.service.ts:519](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:519) checks only `id`, active status, and `tenant_id`; it never requires `organization_id = ctx.organizationId`.  
  Failing input: replace the hidden membership UUID with an active membership UUID belonging to a sibling organization in the same tenant. An `insurance_owner` or `towing_owner` can revoke it despite not administering that organization. RLS does not prevent this because it is tenant-scoped.  
  This contradicts the “caller’s own organisation” security claims. Current partner registration may normally create one organization per tenant, but the service and schema support multiple organizations, so that operational convention is not an authorization boundary.

- **MEDIUM — The change has no regression tests for its central behavior.**  
  There are no new tests covering owner access to `/users`, exact offered role sets, route refusal for operational roles, immutable action workspace selection, or cross-organization withdrawal. The first finding is exactly the kind of incomplete backend/UI integration such a journey or service test should catch. This does not satisfy the repository’s stated Definition of Complete.

- **LOW — `dynamic = 'force-dynamic'` is exported from a non-route module and has no route-segment effect.**  
  [org-staff-screen.tsx:26](C:/Users/USER/Documents/autoworkshop-ai/apps/web/app/_shared/org-staff/org-staff-screen.tsx:26) is an ordinary imported component, not a `page.tsx` or `layout.tsx`; Next only consumes route-segment configuration from route modules. The reads currently use `no-store` and session APIs, so this is unlikely to cause stale data, but the export does not do what its placement suggests.

## Checks that pass

- The offered roles exactly match `ROLES_BY_ORG_TYPE`:

  - Insurance: `insurance_owner`, `insurance_assessor`
  - Towing: `towing_owner`, `towing_operator`

- The workspace identifier used by add/withdraw actions is bound in per-pack `'use server'` modules. A browser cannot substitute the insurance action’s workspace with towing or workshop.

- The add action derives `organizationId` from `currentViewer()`, not form data. Through these new callers, a client cannot choose the grant organization. The API also checks grant authority, tenant membership of the organization, and role/organization compatibility.

- Both pages call `requireNavRoute()` before rendering components that access data, so unauthorized RSC execution is avoided at the route level.

- Passing an exported server action into a client component is valid Next.js usage here. The `'use server'` boundaries are correctly placed.

- Loading, empty, read-error, action-error, pending-submit, confirmation, and route-permission states are represented. The primary problem is that the read authorization mismatch makes the successful insurance/towing state unreachable.
