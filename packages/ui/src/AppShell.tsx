'use client';

import * as React from 'react';
import { breakpoint, themeVar, primitive } from '@autoworkshop/design-tokens';
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
import {
  AiAssistantPanel,
  ASSISTANT_ACTIONS,
  assistantActionsFor,
  DEFAULT_ASSISTANT_UNAVAILABLE_REASON,
  type AgentProposal,
} from './AiAssistantPanel';
import { useIsTabletOrBelow } from './useMediaQuery';

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
  /**
   * Render the shell WITHOUT its side navigation and without the menu toggle.
   *
   * For a page that is genuinely public. The apex landing showed an anonymous
   * visitor the entire WORKSHOP menu — Workshop Floor, Finance and Warranty,
   * Reports — with badges reading 10, 12, 5 and 2. Nothing there was reachable
   * (every route is gated server-side) and none of those numbers were real, so
   * the product's shop front opened with a menu of doors that do not open and
   * counters that count nothing.
   *
   * ⚠️ NOT A SECURITY CONTROL, like every other visibility decision in this
   * package — it is an honesty one. The API and RLS deny independently.
   */
  hideSideNav?: boolean;
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

  /**
   * 🔴 WHY THE ASSISTANT'S UNAVAILABLE MESSAGE IS A PROP.
   *
   * It used to be a string literal in this file: "The assistant connects in
   * Phase 8, once the agent host and MCP gateway are in place." That was true
   * for all seven apps when it was written, and it is now FALSE for
   * workshop-web — `apps/api/src/agents` serves real proposals there. A shell
   * that tells a workshop its assistant is not connected, while the API is
   * writing proposals about their own service requests, is the "green deploy is
   * not a visible feature" failure with the shell as the thing hiding it.
   *
   * ⚠️ THE DEFAULT IS THE OLD STRING, AND THAT IS THE POINT. Six apps have no
   * agent host, so leaving them untouched must keep the honest message rather
   * than silently promoting them to "connected". Only an app that passes `null`
   * — an explicit statement, not an omission — gets the live panel.
   */
  assistantUnavailableReason?: string | null;
  /**
   * What the agent has proposed, already mapped to the panel's shape by the
   * app. Read on the SERVER (the token is in an httpOnly cookie) and passed
   * down, because this component cannot fetch and must not hold a credential.
   */
  assistantProposals?: readonly AgentProposal[];
  /**
   * Record a human decision on a Class C/D proposal.
   *
   * ⚠️ A SERVER ACTION, supplied by the app, for the same reason `accountControl`
   * is a node: the decision is an authenticated POST and this package must stay
   * renderable with no server and no Next runtime.
   *
   * ⚠️ AND IT IS NOT THE AUTHORIZATION POINT. `AgentProposalService.decide`
   * re-checks staff membership, refuses a second decision on the same row, and
   * RLS refuses again beneath it. What comes back here is the OUTCOME, so the
   * panel can show the API's own sentence — never a judgement made locally.
   */
  onAssistantDecision?: (
    proposalId: string,
    decision: 'approved' | 'rejected',
  ) => Promise<{ ok: boolean; error?: string }>;
  /** True while the app is still loading proposals — §70 loading state. */
  assistantLoading?: boolean;
}

/**
 * 🔴 THE SHELL MUST BE RIGHT BEFORE JAVASCRIPT RUNS.
 *
 * `useIsTabletOrBelow()` is deliberately `false` on the server and on the first client
 * render, to avoid a hydration mismatch — see `useMediaQuery.ts`, which states
 * the trade honestly: "the first paint is always the desktop layout, corrected
 * within a frame."
 *
 * On a PHONE that trade is not one frame of cosmetic difference. The desktop
 * branch renders the side navigation as a persistent ~16rem FLEX CHILD, so on a
 * 390px screen `main` is left with about 130px and the page looks cut in half.
 * Owner, 2026-08-06: "app interfaces do[n't a]lign with phone screen, half of
 * page is missing." If hydration is slow — a cold API, a bad connection — or
 * fails, it NEVER corrects.
 *
 * 🔴 AND THE CONTEXTUAL PANEL WAS WORSE: `width: 20rem; flex-shrink: 0` with NO
 * mobile branch at all. That stole 320px of a 390px screen permanently,
 * hydrated or not. No amount of JavaScript was ever going to fix it.
 *
 * CSS fixes both because it applies at PARSE time, with no JavaScript at all.
 * The JS branch stays — the drawer genuinely needs a focus trap and aria-modal,
 * which CSS cannot express — but layout no longer depends on it.
 *
 * ⚠️ THE BREAKPOINT MATCHES `useIsTabletOrBelow()`. If these two disagree there
 * is a band of widths where CSS hides the column and JS still renders it
 * inline, or the reverse — which is the nav/router divergence this shell has
 * paid for before, one layer down. They are kept in step by BOTH deriving from
 * `breakpoint.tabletLandscape`; change one and you must change the other.
 *
 * 🔴 1024, NOT 768 — AND THAT BOUNDARY WAS ITSELF A DEFECT.
 *
 * This block used to key off `breakpoint.tabletPortrait`, i.e. `max-width:
 * 767px`. At EXACTLY 768px — iPad portrait, and the single most common tablet
 * width there is — the mobile branch therefore did not apply, and the desktop
 * branch rendered the side nav as a persistent 16rem column. MEASURED on the
 * deployed site: `main` was 511px of 768px, 66.5%. 768 − 256 = 512, so the
 * arithmetic names the cause exactly.
 *
 * That is the same "half the page is missing" failure the phone had, one
 * breakpoint up, and it survived the phone fix because the phone fix only moved
 * the boundary's IMPLEMENTATION from JS to CSS — it never questioned where the
 * boundary was. Giving a third of a tablet to navigation is not a layout, so
 * the drawer now covers everything below 1024px and the persistent column
 * starts where there is room for it.
 *
 * Found by `apps/e2e/verify/measure-mobile-width.mjs`, which measures the
 * deployed site. It was written to CONFIRM the phone fix, and the tablet
 * regression is the thing it caught that nobody was looking for.
 */
const SHELL_RESPONSIVE_CSS = `
@media (max-width: ${parseInt(breakpoint.tabletLandscape, 10) - 1}px) {
  [data-aw-shell-nav] { display: none !important; }
  [data-aw-shell-panel] {
    width: 100% !important;
    flex-shrink: 1 !important;
    border-left: 0 !important;
    position: static !important;
    height: auto !important;
  }
  [data-aw-shell-row] { flex-wrap: wrap !important; }
  [data-aw-shell-main] { flex-basis: 100% !important; }
}
`;

export function AppShell({
  workspace,
  pathname,
  grants = [],
  organizationLabel,
  branchLabel,
  userLabel,
  brandHref,
  hideSideNav = false,
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
  assistantUnavailableReason = DEFAULT_ASSISTANT_UNAVAILABLE_REASON,
  assistantProposals,
  onAssistantDecision,
  assistantLoading = false,
}: AppShellProps) {
  const groups = React.useMemo(() => visibleGroups(workspace, grants), [workspace, grants]);

  const [collapsed, setCollapsed] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState<string[]>(() => defaultExpanded(groups, pathname));

  // The AI assistant (§13, `02.txt` §8). Owned here because the top-nav button
  // that opens it and the panel it opens are on opposite sides of the shell.
  const [assistantOpen, setAssistantOpen] = React.useState(false);

  // Below 1024px the side nav stops being a column and becomes an overlay
  // drawer — a persistent 16rem nav leaves nothing for the page on a 360px
  // phone, and only 511px of 768px on an iPad in portrait (measured).
  //
  // ⚠️ MUST STAY THE SAME BOUNDARY AS `SHELL_RESPONSIVE_CSS` ABOVE — both derive
  // from `breakpoint.tabletLandscape`. This was `useIsMobile()` (max-width
  // 767px) while the CSS is now 1023px; leaving it would have opened a 768–1023
  // band where CSS hid the column and JS still rendered it inline, which is
  // precisely the divergence the CSS block's header warns about.
  //
  // See useMediaQuery for why the JS branch exists at all: the drawer needs a
  // focus trap and aria-modal, which CSS cannot express. Layout no longer
  // depends on it.
  const isMobile = useIsTabletOrBelow();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Close the mobile nav on navigation. Without this the drawer stays open over
  // the page the user just chose, which reads as the tap having failed.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // ── THE DECISION ROUND TRIP ────────────────────────────────────────────────
  //
  // Three pieces of state, and each earns its place:
  //
  //  · `assistantBusy`  — §70 requires a loading state, and a decision that
  //                       takes a cold-started API 20 seconds with no feedback
  //                       gets pressed again. The second press is the one that
  //                       produces "this proposal was already approved".
  //  · `assistantError` — the API's own sentence. Swallowing it is how a
  //                       refused decision reads as a broken button.
  //  · `decided`        — 🔴 THE OPTIMISM PROBLEM, SOLVED HONESTLY. `proposals`
  //                       is server data; this component cannot refetch it (no
  //                       router in this package, by design) and the server
  //                       action's `revalidatePath` only takes effect on the
  //                       NEXT navigation. Without this the card sits unchanged
  //                       after a successful approval and the reviewer presses
  //                       again.
  //
  // ⚠️ `decided` IS WRITTEN ONLY AFTER THE SERVER SAYS `ok`. It mirrors a
  // decision that has already happened; it never predicts one. An optimistic
  // version — flipping the card on click and reverting on failure — would show
  // "approved" for a proposal the server refused, which is exactly the
  // "config reads correct while the mechanism is inert" class this repository
  // keeps paying for.
  const [assistantBusy, setAssistantBusy] = React.useState(false);
  const [assistantError, setAssistantError] = React.useState<string | null>(null);
  const [decided, setDecided] = React.useState<Record<string, 'approved' | 'rejected'>>({});

  const decideProposal = React.useCallback(
    async (proposalId: string, decision: 'approved' | 'rejected') => {
      if (!onAssistantDecision) return;
      setAssistantBusy(true);
      setAssistantError(null);
      try {
        const outcome = await onAssistantDecision(proposalId, decision);
        if (outcome.ok) setDecided((prev) => ({ ...prev, [proposalId]: decision }));
        else setAssistantError(outcome.error ?? 'The decision was not recorded.');
      } catch {
        // A server action can reject — a dropped connection mid-POST. The panel
        // must say so rather than leave the button looking merely slow.
        setAssistantError('The decision could not be sent. Nothing has been changed.');
      } finally {
        setAssistantBusy(false);
      }
    },
    [onAssistantDecision],
  );

  // The proposals as they now stand: server truth, with confirmed decisions
  // from this session applied over the top.
  const shownProposals = React.useMemo(
    () =>
      (assistantProposals ?? []).map((p) => {
        const d = decided[p.id];
        if (!d) return p;
        return { ...p, status: d === 'approved' ? ('approved' as const) : ('rejected' as const) };
      }),
    [assistantProposals, decided],
  );

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
      <style dangerouslySetInnerHTML={{ __html: overlayKeyframes + SHELL_RESPONSIVE_CSS }} />

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
        // A toggle for a navigation that is not rendered is a control that
        // does nothing — the exact thing TopNav's own header forbids.
        hideMenuButton={hideSideNav}
        sideNavCollapsed={isMobile ? !mobileNavOpen : collapsed}
        // On desktop the side nav is always mounted. On mobile it lives inside
        // a Drawer that unmounts when closed, so the id genuinely is not in the
        // document and must not be referenced — this was a real dangling
        // `aria-controls` in the shipped app, not merely a Storybook artefact.
        sideNavId={hideSideNav ? undefined : !isMobile || mobileNavOpen ? 'app-side-nav' : undefined}
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

      <div data-aw-shell-row style={{ display: 'flex', alignItems: 'flex-start' }}>
        {hideSideNav ? null : isMobile ? (
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
          // 🔴 WRAPPED, so the CSS above can hide this column on a narrow
          // viewport BEFORE any JavaScript runs. Without the wrapper there is
          // no element to select: `sideNav` is a component, and the server
          // renders this branch on every device because `useIsTabletOrBelow()`
          // is false until hydration.
          <div data-aw-shell-nav>{sideNav}</div>
        )}

        <main
          id="main-content"
          data-aw-shell-main
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
            data-aw-shell-panel
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
            // 🔴 THE UNAVAILABLE STATE IS NOT DELETED, it is now decided by the
            // app. Six of the seven workspaces still have no agent host, and
            // for them this prop is absent and the honest default renders. Only
            // an app that passes `null` claims a connection.
            unavailableReason={assistantUnavailableReason}
            proposals={shownProposals}
            loading={assistantLoading}
            error={assistantError}
            busy={assistantBusy}
            // ⚠️ Handed over ONLY when the app supplied a way to decide. Without
            // it the panel renders no buttons at all — better than buttons that
            // silently do nothing, which is a control that lies.
            onApprove={onAssistantDecision ? (id) => void decideProposal(id, 'approved') : undefined}
            onReject={onAssistantDecision ? (id) => void decideProposal(id, 'rejected') : undefined}
          />
        </Drawer>
      </div>
    </div>
  );
}
