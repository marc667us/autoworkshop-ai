import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  registrationStatus,
  viewerHasSession,
  ViewerSwitchers,
  ActingAsControl,
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
  const [viewer, signedIn, status] = await Promise.all([
    currentViewer('customer'),
    viewerHasSession('customer'),
    // Only asked when a session exists — the call needs a token, and asking
    // without one spends a round trip to learn what the cookie already said.
    // Resolved in the SAME Promise.all rather than after it: this is the shell
    // every customer page renders inside.
    registrationStatus('customer'),
  ]);

  return (
    <WorkspaceShell
          workspaceId="customer"
          grants={grantsFor(viewer)}
          role={navRoleFor(viewer?.activeRole)}
          {...viewerLabels(viewer)}
          // 🔴 A SIGNED-IN CUSTOMER IS NOT "Not signed in", AND HERE THAT IS THE
          // NORMAL CASE, not an edge one. `/me` is behind TenantGuard, so a
          // viewer with no membership cannot be described — and in THIS
          // workspace almost nobody has one: a vehicle owner buying a filter
          // never joins a workshop. `viewerLabels(null)` therefore supplied the
          // signed-out labels to every customer, permanently, and the shell
          // rendered "Not signed in" next to a working "Sign out".
          //
          // Seen in a screenshot of the VIN funnel's final screen — the page
          // somebody reaches immediately AFTER being persuaded to register.
          //
          // The name comes from /registration/status, which is on UserGuard and
          // can answer for exactly this person. The organisation chip is left
          // ABSENT rather than filled: a customer has no organisation, and
          // `Selector` renders nothing for an empty value.
          {...(signedIn && !viewer
            ? { userLabel: status?.displayName, organizationLabel: undefined, branchLabel: undefined }
            : {})}
          // T-0005 finding 5: a real sign-out — revoke the refresh token at
          // Keycloak, clear the cookie, end the SSO session. Passed from the
          // server layout because a server action cannot be created in the
          // client shell that renders the button.
          signOutAction={signOutAction}
          signInHref="/api/auth/signin"
          signedIn={signedIn}
          // T-0016, as ONE shared component so all seven apps mount the identical
          // control. It lists only the viewer's own memberships and the API
          // re-validates the choice, REFUSING an organisation the viewer does not
          // hold rather than downgrading. The ROLE half moved to `roleControl`
          // below (owner request 2026-08-03). See `ViewerSwitchers`.
          organizationSwitcher={<ViewerSwitchers viewer={viewer} />}
          // The ROLE, top right beside the user chip (owner request 2026-08-03).
          // Renders the switcher only for a viewer holding several roles; a
          // single-role viewer gets `null` here and the shell falls back to its
          // read-only "Acting as" chip, so the role is stated either way.
          roleControl={<ActingAsControl viewer={viewer} />}
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
