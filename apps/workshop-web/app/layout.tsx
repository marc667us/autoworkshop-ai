import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  viewerHasSession,
  ViewerSwitchers,
  ActingAsControl,
  registrationStatus,
  needsWorkshop,
} from '@autoworkshop/next-shell';
import { themeBootScript } from '@autoworkshop/ui';
import { signOutAction, switchUserAction } from './sign-out-action';
import { CreateWorkshopScreen } from './_screens/create-workshop-screen';

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

  // ── SIGNED UP, BUT NOT IN A WORKSHOP YET ──────────────────────────────────
  //
  // Owner instruction 2026-08-03: "users must sign up via kc". Keycloak makes
  // the account; the first API call provisions the application user; neither
  // puts anybody in a workshop. Without this branch that person sees the full
  // shell with every count at zero and a dashboard saying its figures could not
  // be loaded — which is what a BROKEN application looks like, on the first
  // screen they ever see. It is not broken; they have nowhere to look yet.
  //
  // ⚠️ ONLY ASKED WHEN A SESSION EXISTS. `/registration/status` needs a token,
  // and asking without one would spend a round trip on every anonymous request
  // to learn what the cookie already said.
  //
  // ⚠️ `needsWorkshop` IS TRUE ONLY WHEN WE POSITIVELY KNOW. An unreachable API
  // returns null, which is NOT "no workshop" — collapsing the two would show
  // every existing owner an invitation to create the workshop they already have
  // during an outage, and the API would then refuse them with a 409 they did
  // nothing to earn.
  const registration = signedIn ? await registrationStatus('workshop') : null;
  const onboarding = signedIn && needsWorkshop(registration);

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
          // 🔴 OVERRIDES THE ORGANISATION CHIP DURING ONBOARDING, and the order
          // of these two lines is the fix. `/me` 401s for a user with no
          // membership, so `currentViewer()` is null and `viewerLabels(null)`
          // returns "Not signed in" — which the shell then rendered BESIDE a
          // working "Sign out" button. Seen in a screenshot of the new
          // onboarding screen, not reasoned about.
          //
          // That contradiction has cost this repo a session already (the
          // 2026-08-02 issuer bug presented exactly the same way), so a new user
          // meeting it on their FIRST screen would reasonably conclude sign-up
          // had half-failed. It is a true statement about the viewer lookup and
          // a false one about the person.
          {...(onboarding ? { organizationLabel: 'No workshop yet' } : {})}
          // T-0005 finding 5: a real sign-out — revoke the refresh token at
          // Keycloak, clear the cookie, end the SSO session. Passed from the
          // server layout because a server action cannot be created in the
          // client shell that renders the button.
          signOutAction={signOutAction}
          switchUserAction={switchUserAction}
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
          // ⚠️ NO BADGES DURING ONBOARDING. These are placeholder figures, and
          // on a normal screen they are merely provisional — but shown to
          // somebody whose workshop does not exist yet they are simply false:
          // "10 tasks" and "12 active jobs" against an account that owns
          // nothing. The first screen a user sees is the worst place to
          // advertise work that is not there.
          counters={onboarding ? {} : {
            'workshop.tasks.open': 7,
            'workshop.approvals.pending': 3,
            'workshop.complaints.new': 4,
            'workshop.appointments.today': 6,
            'workshop.jobs.active': 12,
            'workshop.proposals.pendingApproval': 2,
            'workshop.messages.unread': 5,
          }}
          warnings={onboarding ? {} : { 'workshop.parts.reorderAlerts': 2 }}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks', count: 10 },
            { id: 'messages', label: 'Messages and calls', icon: 'messages', count: 5 },
            { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 3 },
            { id: 'ai', label: 'AI assistant', icon: 'ai' },
            { id: 'help', label: 'Help and support', icon: 'help' },
          ]}
        >
          {/* Rendered IN PLACE of the page, never as a redirect. A redirect
              needs a second condition on the onboarding route to send finished
              users back, and two conditions are free to disagree — that is a
              redirect loop on the first screen a new user reaches, escapable
              only by clearing cookies. One condition cannot loop. */}
          {onboarding ? (
            <CreateWorkshopScreen displayName={viewer?.displayName} />
          ) : (
            children
          )}
        </WorkspaceShell>
      </body>
    </html>
  );
}
