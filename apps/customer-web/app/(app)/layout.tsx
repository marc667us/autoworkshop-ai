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
import { NotYourWorkspace } from '../_screens/not-your-workspace';

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

  /**
   * 🔴 A WORKSHOP EMPLOYEE IS NOT A CUSTOMER, AND THIS APP SAYS "YOUR VEHICLES".
   *
   * MEASURED 2026-08-04: signing in as `owner@autoworkshop.local` and opening
   * this app showed "Your vehicles (3)" — Adjoa Boateng's car and two of Kwame
   * Mensah's. None of them the owner's. Neither app called
   * `requireWorkspaceAccess`, and the API narrows to a person's OWN vehicles
   * only when `activeRole === 'customer'`; for a viewer whose active role is
   * `workshop_owner` it correctly returns the organisation's, which is right
   * for the WORKSHOP app and a confidentiality breach on this one.
   *
   * ⚠️ THE GATE IS "HOLDS NO CUSTOMER MEMBERSHIP", NOT "HAS NO MEMBERSHIP".
   * A parts buyer with no membership at all is a REAL and intended user of this
   * app — `/me` is behind TenantGuard so `currentViewer` returns null for them,
   * and the marketplace and basket are built for exactly that person. Refusing
   * on a null viewer would lock out the consumer the app exists for. So the
   * refusal is narrow: a viewer who resolved, holds memberships, and none of
   * them is `customer`.
   *
   * ⚠️ AND IT IS NOT THE CONTROL. It stops the wrong PRESENTATION; the data is
   * still the API's to scope and RLS's to isolate (CLAUDE.md §8). Fixing the
   * screen without fixing the scoping would be hiding, not refusing — so
   * `verify-workspace-isolation.mjs` asserts the refusal AND that no other
   * person's registration appears.
   */
  const holdsCustomerRole = viewer?.memberships.some((m) => m.roleName === 'customer') ?? false;
  const wrongWorkspace = Boolean(viewer) && viewer!.memberships.length > 0 && !holdsCustomerRole;

  return (
    <WorkspaceShell
          workspaceId="customer"
          // The wordmark goes to the STORE, not to `/` — `/` would redirect a
          // signed-in customer straight back to the dashboard they were trying
          // to leave, which reads as a broken link (owner request 2026-08-03).
          brandHref="/marketplace"
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
      {/*
        Rendered INSIDE the shell, not instead of it: somebody who lands here by
        mistake needs the wordmark and the sign-out control to get out again.
        Stripping the shell would strand them on a page with no way back — the
        same reasoning as the signed-out landing.
      */}
      {wrongWorkspace ? <NotYourWorkspace name={viewer?.displayName ?? null} /> : children}
    </WorkspaceShell>
  );
}
