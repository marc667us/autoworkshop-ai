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
  drawer,
}: WorkspaceShellProps) {
  const pathname = usePathname() || '/';
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
      organizationLabel={organizationLabel}
      branchLabel={branchLabel}
      userLabel={userLabel}
      brandHref={brandHref}
      roleLabel={roleLabel}
      roleControl={roleControl}
      counters={counters}
      warnings={warnings}
      topNavActions={topNavActions}
      organizationSwitcher={organizationSwitcher}
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
