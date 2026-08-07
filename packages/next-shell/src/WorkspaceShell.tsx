'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, ThemeProvider, type TopNavAction } from '@autoworkshop/ui';
import {
  getWorkspace,
  workspaceForRole,
  type PermissionKey,
  type RoleId,
} from '@autoworkshop/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { AccountControl } from './AccountControl';

/**
 * The Next.js binding for the shared application shell.
 *
 * WHY THIS PACKAGE EXISTS. `@autoworkshop/ui` is deliberately framework-free —
 * it takes `renderLink` as a prop so Storybook and the Playwright journeys can
 * render the shell without a Next runtime. But all seven apps DO run on Next,
 * and each of them needs the identical `next/link` + `usePathname` adapter.
 * Copying that adapter into seven `app/` folders is exactly the duplication the
 * reusability rule forbids (root CLAUDE.md §0.3: "Copy-pasting an agent from
 * one app into another" — the same reasoning applies to components). One
 * adapter, imported seven times.
 *
 * An app's layout therefore reduces to:
 *
 *   <WorkspaceShell workspaceId="workshop">{children}</WorkspaceShell>
 */

export interface WorkspaceShellProps {
  /** Which workspace's navigation to render, e.g. `workshop`. */
  workspaceId: string;
  children: React.ReactNode;

  /**
   * The viewer's permission grants.
   *
   * ⚠️ Phase 2 supplies these from VALIDATED KEYCLOAK CLAIMS. They must never
   * be derived from anything the client sends, and hiding a nav item is not
   * what protects the page — the route guard, the API and RLS deny
   * independently (CLAUDE.md §5, §8).
   */
  grants?: readonly PermissionKey[];

  /**
   * The viewer's role, which selects the navigation tree (`07.txt` pt2 §46-§49).
   *
   * PASSED IN, not resolved here, and that is forced rather than preferred:
   * this is a CLIENT component, and since T-0005 the role comes from a Keycloak
   * session read on the server. A client component cannot await it.
   *
   * The single-decision-point rule still holds — `viewerRole()` remains the only
   * place the role is decided, it is simply called by the async layout that
   * renders this component and by `renderModulePage` for the same request.
   * React's `cache()` makes those the same resolution, so the menu and the
   * router cannot end up on different trees. Threading the value is not a
   * second source of truth; recomputing it here would be.
   *
   * Undefined means "no role" — an unauthenticated viewer, or a role with no
   * tree of its own — and yields the workspace default tree.
   */
  role?: RoleId;

  organizationLabel?: string;
  branchLabel?: string;
  userLabel?: string;
  /** Where the wordmark links. Omit and it stays plain text. */
  brandHref?: string;
  /**
   * The role the viewer is acting as, humanised — supplied by `viewerLabels()`
   * along with the other three, so a layout spreading `{...viewerLabels(viewer)}`
   * gets it with no extra wiring.
   */
  roleLabel?: string;
  /**
   * The role SWITCHER, for a viewer holding more than one role. Supplied as a
   * node because it needs a server action; when it is absent (or renders null,
   * which is every single-role viewer) the chip above stands in.
   */
  roleControl?: React.ReactNode;
  counters?: Record<string, number>;
  warnings?: Record<string, number>;
  topNavActions?: TopNavAction[];
  /** §5 organization switcher (T-0016), rendered in the top bar. */
  organizationSwitcher?: React.ReactNode;
  /**
   * Sign-out server action, supplied by the app (T-0005 finding 5). It is
   * per-app because the workspace decides which Keycloak client the refresh
   * token is revoked at; the sequence itself lives once in `@autoworkshop/auth`.
   */
  signOutAction?: () => Promise<void>;
  switchUserAction?: () => Promise<void>;
  /** Where a signed-out viewer goes to sign in. */
  signInHref?: string;
  /**
   * Whether a session cookie exists. Supplied by the layout from
   * `viewerHasSession()`, NOT inferred from `userLabel` — see AccountControl.
   */
  signedIn?: boolean;
  /**
   * Routes that are PUBLIC, and on which a SIGNED-OUT visitor gets no side
   * navigation and no counters.
   *
   * 🔴 THE DEFECT THIS CLOSES. The apex landing — the product's shop front —
   * showed anonymous visitors the entire workshop menu (Workshop Floor, Finance
   * and Warranty, Reports) with badges reading 10, 12, 5 and 2. Not a leak:
   * every route behind those items is gated server-side and the API and RLS
   * deny independently. But nothing there was reachable and none of the numbers
   * were real, so the first thing a stranger saw was a menu of doors that do
   * not open, counting work that does not exist.
   *
   * ⚠️ SIGNED-OUT ONLY, DELIBERATELY. A signed-in visitor keeps the shell on
   * the same page, because the landing is reachable from their wordmark and
   * taking their navigation away would leave them somewhere with no way back —
   * a defect this session already fixed once.
   *
   * ⚠️ DECIDED HERE RATHER THAN IN THE LAYOUT because a server layout cannot
   * read its own pathname. The previous attempt stamped it via middleware and
   * crashed the edge runtime with `Cannot redefine property:
   * __import_unsupported` — green typecheck, green lint, green build. This
   * component is already a client component and already calls `usePathname`.
   */
  publicPaths?: readonly string[];

  /**
   * The viewer holds a role belonging to a DIFFERENT workspace — a customer, a
   * supplier, a fleet administrator, an insurance assessor, a towing operator.
   *
   * Computed in the server layout with `isForeignToWorkshop(viewer?.activeRole)`
   * and passed in, because this is a client component and the raw role string
   * lives on the viewer the layout already resolved.
   *
   * ⚠️ NOT THE SAME QUESTION AS `signedIn`. They are signed in; this workspace
   * simply is not theirs. Before this existed, a signed-in customer on
   * workshop-web received the full workshop menu — 45 of 45 items, measured,
   * because the default staff tree is entirely ungated.
   *
   * ⚠️ NOT A SECURITY CONTROL (CLAUDE.md §8, hidden ≠ secure). It removes the
   * menu. `requireNavRoute` refuses the routes, and the API and RLS deny
   * independently.
   */
  foreignWorkspace?: boolean;
  drawer?: React.ReactNode;
}

export function WorkspaceShell({
  workspaceId,
  children,
  grants = [],
  role,
  organizationLabel,
  branchLabel,
  userLabel,
  brandHref,
  roleLabel,
  roleControl,
  counters,
  warnings,
  topNavActions,
  organizationSwitcher,
  signOutAction,
  switchUserAction,
  signInHref,
  signedIn,
  publicPaths,
  foreignWorkspace = false,
  drawer,
}: WorkspaceShellProps) {
  const pathname = usePathname() || '/';
  // Public page + nobody signed in = the shop front, not the application.
  // 🔴 `foreignWorkspace` IS THE SECOND WAY TO BE A VISITOR HERE, AND IT IS THE
  // ONE THAT WAS MISSING.
  //
  // `bare` used to mean only "not signed in, on a public path". A signed-in
  // CUSTOMER on workshop-web is signed in, so they were never bare — and they
  // got the full workshop navigation: 45 of 45 items, measured, because the
  // default staff tree is entirely ungated and grant filtering removed nothing.
  //
  // Being signed in says nothing about whether this workspace is YOURS. A
  // customer is not a degraded staff member to be filtered down; they are
  // somebody else's user, and the workshop's menu is not theirs to see. Folding
  // it into `bare` rather than adding a parallel branch is deliberate: every
  // consequence below — no side nav, no organisation or branch label, no
  // counters, no warnings, no action badges — is exactly right for them too.
  // Two conditions, one meaning: "you are a visitor to this workspace."
  //
  // ⚠️ CHILDREN STILL RENDER, AND THAT IS REQUIRED. workshop-web owns the APEX,
  // whose `/` is the PUBLIC parts marketplace and free VIN search. Blocking the
  // whole app for a customer would take the public shop front away from exactly
  // the people the funnel converts. What is removed is the workshop's own
  // navigation; the gated ROUTES are refused separately by `requireNavRoute`.
  const bare = foreignWorkspace || (!signedIn && (publicPaths ?? []).includes(pathname));

  const base = getWorkspace(workspaceId);
  // T-0027: the role selects the tree (`07.txt` pt2 §46-§49). The value comes
  // from the caller because this is a client component — see the `role` prop.
  const workspace = base ? workspaceForRole(base, role) : undefined;

  // A workspace with no navigation is a configuration error, and it must LOOK
  // like one. Rendering bare children would give a page with no nav that
  // otherwise appears to work — the failure would reach production unnoticed.
  if (!workspace) {
    return (
      <div style={{ padding: primitive.space[8], fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ color: themeVar.statusDanger, fontSize: primitive.fontSize.xl }}>
          Unknown workspace “{workspaceId}”
        </h1>
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          No navigation is registered for this workspace in <code>@autoworkshop/navigation</code>.
        </p>
      </div>
    );
  }

  return (
    <ThemeProvider>
    <AppShell
      workspace={workspace}
      pathname={pathname}
      grants={grants}
      userLabel={userLabel}
      brandHref={brandHref}
      // ⚠️ STRIPPED WHEN BARE, LIKE EVERY OTHER PIECE OF WORKSPACE CHROME.
      // These were left passing through when `foreignWorkspace` was added, so a
      // customer kept their role chip and organisation switcher in the workshop's
      // top bar while the menu beneath had correctly vanished — half-dressed, and
      // still implying the workspace was theirs. Caught by Codex.
      roleLabel={bare ? undefined : roleLabel}
      roleControl={bare ? undefined : roleControl}
      hideSideNav={bare}
      // ⚠️ THE TOP-BAR COUNTS ARE A SEPARATE PROP, and missing that is why the
      // first attempt still showed "✓ 10 · ✉ 5 · ⌾ 3" to a stranger after the
      // side-nav badges were already gone. Emptying `counters` does not touch
      // these. Stripped rather than zeroed: `Count` renders nothing at 0, but a
      // zero is still a claim, and an anonymous visitor has no tasks to have
      // none of.
      topNavActions={bare ? topNavActions?.map(({ count, ...a }) => a) : topNavActions}
      // The organisation and branch chips on a public shop front read
      // "Not signed in | —", which is true and useless to a stranger looking
      // for a brake disc. The Sign in button beside them is the useful half.
      organizationLabel={bare ? undefined : organizationLabel}
      branchLabel={bare ? undefined : branchLabel}
      // ⚠️ EMPTIED, NOT HIDDEN BY CSS. These are placeholder figures; showing
      // "10 tasks" to a stranger browsing for a brake disc is a claim, and it
      // is false.
      counters={bare ? {} : counters}
      warnings={bare ? {} : warnings}
      organizationSwitcher={bare ? undefined : organizationSwitcher}
      accountControl={
        <AccountControl
          signedIn={signedIn}
          userLabel={userLabel}
          signOutAction={signOutAction}
          switchUserAction={switchUserAction}
          signInHref={signInHref}
        />
      }
      drawer={drawer}
      renderLink={({ href, children: linkChildren, active, title }) => (
        <Link
          href={href}
          title={title}
          aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: primitive.space[2],
            padding: `${primitive.space[2]} ${primitive.space[3]}`,
            borderRadius: primitive.radius.md,
            textDecoration: 'none',
            fontSize: primitive.fontSize.sm,
            color: active ? themeVar.actionPrimary : themeVar.textSecondary,
            background: active ? themeVar.actionPrimarySoft : 'transparent',
            fontWeight: active ? 600 : 400,
          }}
        >
          {linkChildren}
        </Link>
      )}
    >
      {children}
    </AppShell>
    </ThemeProvider>
  );
}
