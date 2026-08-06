import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  viewerHasSession,
  registrationStatus,
  needsWorkshop,
  ViewerSwitchers,
  ActingAsControl,
} from '@autoworkshop/next-shell';
import { themeBootScript } from '@autoworkshop/ui';
import { prewarmKeycloak } from '@autoworkshop/auth';
import { signOutAction, switchUserAction } from './sign-out-action';
import { liveCounters } from './_screens/live-counters';


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
  // Start Keycloak waking NOW, not when somebody presses "Sign in".
  //
  // Deliberately NOT awaited and deliberately BEFORE the two calls below: the
  // wake takes up to 136s and there is nothing to wait for, so it runs in the
  // background while this render does its real work. Throttled to one ping per
  // five minutes per process — see `prewarm.ts` for why that throttle is the
  // cost control and not a tuning knob.
  prewarmKeycloak();

  // Resolved together: the viewer DESCRIBES the person, the session says whether
  // there is one. They are separate calls because `/me` can fail while the
  // session is live, and sign-out must survive that (Codex finding M2).
  const [viewer, signedIn] = await Promise.all([
    currentViewer('workshop'),
    viewerHasSession('workshop'),
  ]);

  // ⚠️ USED FOR THE LABELS AND THE BADGES ONLY — NEVER TO REPLACE THE PAGE.
  //
  // It once swapped `children` for the onboarding form, which was right for the
  // app's own screens and WRONG for `/`: that route is now the PUBLIC parts
  // marketplace and the free VIN search, and a signed-in account with no
  // workshop asked for the landing and got a form. Measured in a browser — the
  // free tool the whole funnel depends on was unreachable for exactly the
  // people it converts. The screen now lives on the DASHBOARD, which is the
  // page whose emptiness it explains.
  //
  // What stays here is honest on every route: somebody with no workshop should
  // not see an organisation name they do not have, or badges counting work that
  // does not exist.
  const registration = signedIn ? await registrationStatus('workshop') : null;
  const onboarding = signedIn && needsWorkshop(registration);

  // 🔴 REAL NUMBERS. Counted from the records, never invented — see
  // `live-counters.ts` for what this replaced and why a missing badge is
  // preferable to a wrong one. Skipped entirely during onboarding, where every
  // count is necessarily zero and a badge would advertise work that cannot
  // exist yet.
  const { counters, warnings } = onboarding
    ? { counters: {}, warnings: {} }
    : await liveCounters(signedIn);



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
          // The wordmark reaches the public landing, which this app now serves
          // at `/` — the Solar pattern: one app, public and private routes side
          // by side, no second service and therefore no DNS work.
          brandHref="/"
          // `/` is the public parts marketplace and the free VIN search. A
          // signed-OUT visitor there gets no workshop menu and no placeholder
          // badges; a signed-in one keeps the shell so they can get back.
          publicPaths={['/']}
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
          // 🔴 REAL COUNTS, AND ONLY THE ONES THAT ARE REAL (slice 7).
          //
          // This block used to carry SEVEN INVENTED FIGURES — 7 open tasks, 12
          // active jobs, 5 unread messages — on the first screen every user
          // sees. Its own comment called them "provisional", but a badge does
          // not read as provisional: it reads as a fact about your workshop,
          // and a workshop with three jobs was being told it had twelve.
          //
          // `liveCounters()` returns what can be COUNTED from a real table
          // today. Anything it cannot count is ABSENT rather than guessed —
          // a missing badge says nothing, a wrong badge says something false.
          // The remaining keys get their numbers as their slices land.
          counters={onboarding ? {} : counters}
          warnings={onboarding ? {} : warnings}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks' },
            {
              id: 'messages',
              label: 'Messages and calls',
              icon: 'messages',
              // `undefined` rather than 0: the shell renders no badge at all
              // when there is nothing waiting, which is the correct look for
              // an empty inbox and not the same as a badge reading "0".
              count: counters['workshop.messages.unread'] || undefined,
            },
            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
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
