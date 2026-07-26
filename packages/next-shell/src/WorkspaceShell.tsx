'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, ThemeProvider, type TopNavAction } from '@autoworkshop/ui';
import { getWorkspace, type PermissionKey } from '@autoworkshop/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

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

  organizationLabel?: string;
  branchLabel?: string;
  userLabel?: string;
  counters?: Record<string, number>;
  warnings?: Record<string, number>;
  topNavActions?: TopNavAction[];
  drawer?: React.ReactNode;
}

export function WorkspaceShell({
  workspaceId,
  children,
  grants = [],
  organizationLabel,
  branchLabel,
  userLabel,
  counters,
  warnings,
  topNavActions,
  drawer,
}: WorkspaceShellProps) {
  const pathname = usePathname() || '/';
  const workspace = getWorkspace(workspaceId);

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
      counters={counters}
      warnings={warnings}
      topNavActions={topNavActions}
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
