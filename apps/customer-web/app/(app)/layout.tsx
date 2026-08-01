import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  viewerHasSession,
  ViewerSwitchers,
} from '@autoworkshop/next-shell';
import { signOutAction } from '../sign-out-action';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI — Customer',
  description: 'Vehicle owners — garage, complaints, proposals, payments',
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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Resolved together: the viewer DESCRIBES the person, the session says whether
  // there is one. They are separate calls because `/me` can fail while the
  // session is live, and sign-out must survive that (Codex finding M2).
  const [viewer, signedIn] = await Promise.all([
    currentViewer('customer'),
    viewerHasSession('customer'),
  ]);

  return (
    <WorkspaceShell
          workspaceId="customer"
          grants={grantsFor(viewer)}
          role={navRoleFor(viewer?.activeRole)}
          {...viewerLabels(viewer)}
          // T-0005 finding 5: a real sign-out — revoke the refresh token at
          // Keycloak, clear the cookie, end the SSO session. Passed from the
          // server layout because a server action cannot be created in the
          // client shell that renders the button.
          signOutAction={signOutAction}
          signInHref="/api/auth/signin"
          signedIn={signedIn}
          // T-0016 + the 2026-07-31 role switcher, as ONE shared component so
          // all seven apps mount the identical control group. Both halves list
          // only the viewer's own memberships and both are re-validated by the
          // API, which REFUSES an organisation or role the viewer does not hold
          // rather than downgrading. See `ViewerSwitchers`.
          organizationSwitcher={<ViewerSwitchers viewer={viewer} />}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks' },
            { id: 'messages', label: 'Messages and calls', icon: 'messages' },
            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
            { id: 'ai', label: 'AI assistant', icon: 'ai' },
            { id: 'help', label: 'Help and support', icon: 'help' },
          ]}
        >
      {children}
    </WorkspaceShell>
  );
}
