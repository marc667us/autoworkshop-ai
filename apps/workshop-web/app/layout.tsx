import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  viewerHasSession,
  OrganizationSwitcher,
  RoleSwitcher,
  roleLabel,
  setActiveRoleAction,
  setActiveOrganizationAction,
  organizationsFromMemberships,
} from '@autoworkshop/next-shell';
import { themeBootScript } from '@autoworkshop/ui';
import { signOutAction, switchUserAction } from './sign-out-action';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Workshop',
  description: 'Technicians and managers — job cards, staging board, diagnosis',
};

/**
 * All seven apps share one shell (`@autoworkshop/next-shell`). Only the
 * workspace id differs — the navigation itself comes from
 * `@autoworkshop/navigation`, transcribed from the approved spec.
 *
 * `currentViewer()` resolves the signed-in user from the Keycloak session and
 * `GET /api/v1/me` (T-0005). The grants and the role derived from it are the
 * single source shared with this workspace's catch-all route — React's
 * `cache()` makes both resolve the SAME viewer within one render, so the
 * navigation and the router cannot disagree about what may be seen.
 *
 * Accurate is not the same as enforcing: hiding a nav entry protects nothing.
 * The API's tenant guard and Postgres RLS deny independently (CLAUDE.md §8).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved together: the viewer DESCRIBES the person, the session says whether
  // there is one. They are separate calls because `/me` can fail while the
  // session is live, and sign-out must survive that (Codex finding M2).
  const [viewer, signedIn] = await Promise.all([
    currentViewer('workshop'),
    viewerHasSession('workshop'),
  ]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — prevents the
            flash of incorrect theme. Must be inline and synchronous. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body style={{ margin: 0, background: 'var(--aw-background-primary)', color: 'var(--aw-text-primary)' }}>
        <WorkspaceShell
          workspaceId="workshop"
          grants={grantsFor(viewer)}
          role={navRoleFor(viewer?.activeRole)}
          {...viewerLabels(viewer)}
          // T-0005 finding 5: a real sign-out — revoke the refresh token at
          // Keycloak, clear the cookie, end the SSO session. Passed from the
          // server layout because a server action cannot be created in the
          // client shell that renders the button.
          signOutAction={signOutAction}
          switchUserAction={switchUserAction}
          signInHref="/api/auth/signin"
          signedIn={signedIn}
          // T-0016. The options are the viewer's OWN memberships as the API
          // reported them, so the list cannot offer an organisation they do not
          // hold — and the API re-validates the choice regardless, refusing one
          // that is not theirs rather than silently falling back. The switcher
          // renders nothing when there is only one membership: a control that
          // cannot change anything is worse than no control.
          organizationSwitcher={
            viewer ? (
              // BOTH switchers share this slot rather than adding a second prop
              // to WorkspaceShell, which all seven apps would then have to
              // thread through. They are one control group to the user: "who am
              // I acting as, and where".
              <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                <OrganizationSwitcher
                  organizations={organizationsFromMemberships(viewer.memberships)}
                  activeId={viewer.organizationId}
                  action={setActiveOrganizationAction}
                />
                {/*
                  The ROLE switcher — one login acting as any role it holds,
                  without signing out. Options are the viewer's OWN memberships
                  as the API reported them, DEDUPLICATED because the same role in
                  two organisations is one choice here; the organisation switcher
                  beside it is what picks between them.

                  It renders nothing for a viewer holding a single role, which is
                  most of them. And it is NOT the control: the API refuses a role
                  the user does not hold rather than downgrading to one they do.
                */}
                <RoleSwitcher
                  roles={[...new Set(viewer.memberships.map((m) => m.roleName))].map((name) => ({
                    name,
                    label: roleLabel(name),
                  }))}
                  activeRole={viewer.activeRole}
                  action={async (formData: FormData) => {
                    'use server';
                    await setActiveRoleAction(String(formData.get('roleName') ?? ''));
                  }}
                />
              </span>
            ) : null
          }
          counters={{
            'workshop.tasks.open': 7,
            'workshop.approvals.pending': 3,
            'workshop.complaints.new': 4,
            'workshop.appointments.today': 6,
            'workshop.jobs.active': 12,
            'workshop.proposals.pendingApproval': 2,
            'workshop.messages.unread': 5,
          }}
          warnings={{ 'workshop.parts.reorderAlerts': 2 }}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks', count: 10 },
            { id: 'messages', label: 'Messages and calls', icon: 'messages', count: 5 },
            { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 3 },
            { id: 'ai', label: 'AI assistant', icon: 'ai' },
            { id: 'help', label: 'Help and support', icon: 'help' },
          ]}
        >
          {children}
        </WorkspaceShell>
      </body>
    </html>
  );
}
