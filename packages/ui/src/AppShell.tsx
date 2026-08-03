'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  breadcrumbsFor,
  defaultExpanded,
  visibleGroups,
  type PermissionKey,
  type Workspace,
} from '@autoworkshop/navigation';
import { TopNav, type TopNavAction } from './TopNav';
import { SideNav } from './SideNav';
import { Breadcrumbs } from './Breadcrumbs';
import { ThemeToggle } from './ThemeProvider';
import { Drawer, overlayKeyframes } from './Drawer';
import { AiAssistantPanel, ASSISTANT_ACTIONS, assistantActionsFor } from './AiAssistantPanel';
import { useIsMobile } from './useMediaQuery';

/**
 * The application shell — `autoworkshop 01 (1).txt` §2.
 *
 * Spec layout, top to bottom:
 *   Top Navigation Bar
 *   Side Navigation | Page Header and Breadcrumbs
 *   Side Navigation | Main Page Content
 *   Side Navigation | Contextual Drawers or Panels
 *
 * One shell serves all 7 workspaces. It takes a `Workspace` from
 * `@autoworkshop/navigation` and the viewer's permission grants, and renders
 * the navigation that results. Nothing workspace-specific is hardcoded here —
 * that is what makes a single shell viable across seven apps instead of seven
 * near-identical copies drifting apart.
 *
 * `renderLink` is injected rather than importing `next/link` directly, so the
 * package stays usable from Storybook and from tests without a Next runtime.
 */

export interface AppShellProps {
  workspace: Workspace;
  /** Current route, e.g. `/workshop-floor/repair-staging`. */
  pathname: string;
  /** The viewer's permission grants. Drives §16 permission-aware visibility. */
  grants?: readonly PermissionKey[];
  organizationLabel?: string;
  branchLabel?: string;
  userLabel?: string;
  /** Where the wordmark links. Omit and it stays plain text. */
  brandHref?: string;
  /** The role the viewer is acting as, as a chip in the right-hand cluster. */
  roleLabel?: string;
  /** Replaces that chip with the role switcher when the viewer holds several. */
  roleControl?: React.ReactNode;
  counters?: Record<string, number>;
  warnings?: Record<string, number>;
  topNavActions?: TopNavAction[];
  /**
   * Sign in / sign out (§15). A NODE, not a handler: signing out revokes a
   * token at Keycloak and clears an httpOnly cookie, so it is necessarily a
   * server concern, and this package must stay renderable with no server and no
   * Next runtime. `@autoworkshop/next-shell` supplies the real control.
   */
  accountControl?: React.ReactNode;
  /** §5 organization switcher, passed through to the top bar. */
  organizationSwitcher?: React.ReactNode;
  renderLink: (props: {
    href: string;
    children: React.ReactNode;
    active?: boolean;
    title?: string;
  }) => React.ReactNode;
  children: React.ReactNode;
  /** §2 "Contextual Drawers or Panels" — e.g. the AI assistant (§13). */
  drawer?: React.ReactNode;
}

export function AppShell({
  workspace,
  pathname,
  grants = [],
  organizationLabel,
  branchLabel,
  userLabel,
  brandHref,
  roleLabel,
  roleControl,
  counters,
  warnings,
  topNavActions,
  accountControl,
  organizationSwitcher,
  renderLink,
  children,
  drawer,
}: AppShellProps) {
  const groups = React.useMemo(() => visibleGroups(workspace, grants), [workspace, grants]);

  const [collapsed, setCollapsed] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState<string[]>(() => defaultExpanded(groups, pathname));

  // The AI assistant (§13, `02.txt` §8). Owned here because the top-nav button
  // that opens it and the panel it opens are on opposite sides of the shell.
  const [assistantOpen, setAssistantOpen] = React.useState(false);

  // Below the tablet breakpoint the side nav stops being a column and becomes
  // an overlay drawer — on a 360px phone a persistent 16rem nav leaves nothing
  // for the page. See useMediaQuery for why this is JS and not a media query.
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Close the mobile nav on navigation. Without this the drawer stays open over
  // the page the user just chose, which reads as the tap having failed.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Stable close handlers. The drawers no longer depend on callback identity
  // internally, but a stable reference still avoids pointless work on every
  // shell re-render, and it keeps the dependency arrays below honest.
  const closeAssistant = React.useCallback(() => setAssistantOpen(false), []);
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), []);

  // Re-open the group containing the current page after navigation. Merged
  // with what is already open rather than replacing it: §16 lets the user keep
  // several groups expanded, and stamping over that on every route change
  // would quietly discard their preference.
  React.useEffect(() => {
    setExpanded((prev) => {
      const wanted = defaultExpanded(groups, pathname);
      const next = new Set(prev);
      wanted.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [groups, pathname]);

  const toggleGroup = React.useCallback((groupId: string) => {
    setExpanded((prev) => (prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]));
  }, []);

  const crumbs = React.useMemo(
    () => breadcrumbsFor({ ...workspace, groups }, pathname),
    [workspace, groups, pathname],
  );

  // Give the AI action a real handler. It is the one right-hand control whose
  // feature exists today, so it is the one that renders enabled — the rest stay
  // disabled until their features land (see TopNav's rule on unfinished
  // controls). The caller can still supply its own `onSelect` and win.
  const actions = React.useMemo<TopNavAction[]>(
    () =>
      (topNavActions ?? []).map((a) =>
        a.id === 'ai' && !a.onSelect ? { ...a, onSelect: () => setAssistantOpen((o) => !o) } : a,
      ),
    [topNavActions],
  );

  const sideNav = (
    <SideNav
      groups={groups}
      pathname={pathname}
      // In the mobile drawer the nav is never collapsed to icons: the drawer
      // already gives it full width, and icon-only labels would waste it.
      collapsed={isMobile ? false : collapsed}
      expanded={expanded}
      onToggleGroup={toggleGroup}
      counters={counters}
      warnings={warnings}
      searchQuery={search}
      renderLink={({ href, children: linkChildren, active, title }) => (
        <span style={{ display: 'block' }}>{renderLink({ href, children: linkChildren, active, title })}</span>
      )}
    />
  );

  return (
    <div style={{ minHeight: '100vh', background: themeVar.backgroundPrimary, color: themeVar.textPrimary }}>
      {/* Keyframes for the drawer/dialog animations. Rendered once, here, so
          every overlay in the app shares one definition. */}
      <style dangerouslySetInnerHTML={{ __html: overlayKeyframes }} />

      {/* Skip link — a 14-group side nav is a long tab detour before the
          content on every single page. WCAG 2.4.1. */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          zIndex: 100,
          padding: primitive.space[3],
          background: themeVar.actionPrimary,
          color: primitive.color.grey[0],
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = '0';
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = '-9999px';
        }}
      >
        Skip to main content
      </a>

      <TopNav
        workspaceLabel={workspace.label}
        organizationLabel={organizationLabel}
        branchLabel={branchLabel}
        userLabel={userLabel}
        brandHref={brandHref}
        roleLabel={roleLabel}
        roleControl={roleControl}
        // On mobile the same button opens the overlay drawer instead of
        // collapsing an inline column that is not on screen.
        sideNavCollapsed={isMobile ? !mobileNavOpen : collapsed}
        // On desktop the side nav is always mounted. On mobile it lives inside
        // a Drawer that unmounts when closed, so the id genuinely is not in the
        // document and must not be referenced — this was a real dangling
        // `aria-controls` in the shipped app, not merely a Storybook artefact.
        sideNavId={!isMobile || mobileNavOpen ? 'app-side-nav' : undefined}
        onToggleSideNav={() =>
          isMobile ? setMobileNavOpen((o) => !o) : setCollapsed((c) => !c)
        }
        searchValue={search}
        onSearchChange={setSearch}
        actions={actions}
        themeControl={<ThemeToggle />}
        accountControl={accountControl}
        organizationSwitcher={organizationSwitcher}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {isMobile ? (
          <Drawer
            open={mobileNavOpen}
            onClose={closeMobileNav}
            title={`${workspace.label} navigation`}
            side="left"
            // Modal: on a phone the drawer covers the page, so focus must be
            // trapped and the page behind must not scroll under it.
            modal
            width="18rem"
          >
            {sideNav}
          </Drawer>
        ) : (
          sideNav
        )}

        <main
          id="main-content"
          style={{
            flex: 1,
            minWidth: 0,
            padding: primitive.space[6],
            display: 'flex',
            flexDirection: 'column',
            gap: primitive.space[4],
          }}
        >
          <Breadcrumbs crumbs={crumbs} renderLink={({ href, children: c }) => renderLink({ href, children: c })} />
          {children}
        </main>

        {drawer ? (
          <aside
            aria-label="Contextual panel"
            style={{
              width: '20rem',
              flexShrink: 0,
              borderLeft: `1px solid ${themeVar.borderDefault}`,
              padding: primitive.space[4],
              position: 'sticky',
              top: '3.5rem',
              height: 'calc(100vh - 3.5rem)',
              overflowY: 'auto',
            }}
          >
            {drawer}
          </aside>
        ) : null}

        {/* The AI assistant (`02.txt` §8) — a side panel, never a route, so the
            page it is discussing stays on screen beside it.

            IT MUST BE RENDERED INSIDE THIS FLEX ROW. Its non-modal (desktop)
            form is a sticky <aside> that takes its place as a flex child beside
            <main>. Rendered as a sibling of the row instead, it fell below the
            page content as a full-width block — still visible, so it looked
            fine in a screenshot, but no longer a side panel, which is the one
            thing §8 actually specifies.

            Modal on mobile only: there it necessarily covers the page, so focus
            must be trapped. On a wide viewport the user reads the page and the
            assistant together, and trapping focus would be a keyboard trap
            (WCAG 2.1.2). */}
        <Drawer
          open={assistantOpen}
          onClose={closeAssistant}
          title="AI assistant"
          side="right"
          modal={isMobile}
          width={isMobile ? '100vw' : '22rem'}
        >
          <AiAssistantPanel
            actions={assistantActionsFor(ASSISTANT_ACTIONS, grants as readonly string[])}
            // No agent is connected yet: the ADK host and MCP gateway are Phase 8.
            // Saying so plainly beats an input box that swallows questions.
            unavailableReason="The assistant connects in Phase 8, once the agent host and MCP gateway are in place. Its actions are listed here so the panel it will fill is real, not a surprise."
          />
        </Drawer>
      </div>
    </div>
  );
}
