'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Top navigation bar — `autoworkshop 01 (1).txt` §3-§15.
 *
 * The spec's arrangement (§3) is implemented literally:
 *   [Menu] [AutoWorkshop AI] [Workspace v] [Organization v] [Branch v]
 *   [Search Vehicles, Jobs, Parts, Customers...]
 *   [+ Create v] [Tasks] [Messages] [Notifications] [AI Assistant] [Help] [Profile v]
 *
 * §2 requires it to stay visible while the page scrolls, hence `position:
 * sticky` rather than a plain block.
 *
 * SCOPE, STATED PLAINLY: this is the navigation CHROME. The switchers and
 * panels behind each control (§5 workspace, §6 organisation, §7 branch, §8
 * search, §9 quick-create, §10-15 the right-hand cluster) are their own spec
 * sections and their own tasks.
 *
 * HOW UNFINISHED CONTROLS BEHAVE — this is a rule, not a temporary state. A
 * control whose feature does not exist yet is rendered `disabled`, with ", not
 * available yet" in its accessible name (actions), or as plain text with no
 * button role at all (the workspace/org/branch/user indicators). Nothing in
 * this bar is focusable-but-inert. An earlier revision of this file claimed
 * exactly that property while every right-hand button silently no-opped; the
 * Codex review caught it. If you add a control here before its feature lands,
 * follow the same rule.
 */

export interface TopNavAction {
  id: string;
  label: string;
  icon: string;
  /** Unread/pending count. §10-§12 require counters on these controls. */
  count?: number;
  onSelect?: () => void;
  /**
   * Keep this action in the bar on a phone. Default is decided by
   * `MOBILE_PRIMARY_ACTIONS` below; set it explicitly to override.
   */
  showOnMobile?: boolean;
}

/**
 * Which global actions survive on a 360px phone.
 *
 * The bar cannot hold all of them: brand + menu + search + six actions + a
 * three-way theme control + the user chip is roughly 30rem of content in a
 * 22.5rem viewport, and the header does not wrap. Something has to go, so the
 * choice is made deliberately here rather than left to overflow to decide.
 *
 * Kept: the two that are time-sensitive and that the user cannot reach any
 * other way while moving around the app. Everything else is reachable from the
 * page it belongs to, so hiding it costs a tap, not a capability.
 *
 * NOTE: this is a stopgap until §9-§14 land. When those panels exist, the right
 * treatment is a single "More" button opening a sheet containing the overflow —
 * hidden-with-no-alternative is acceptable only while the alternatives do not
 * exist yet.
 */
const MOBILE_PRIMARY_ACTIONS = new Set(['ai', 'notifications']);

export interface TopNavProps {
  workspaceLabel: string;
  organizationLabel?: string;
  branchLabel?: string;
  /** Collapse toggle (§4). Controlled by AppShell so both navs stay in step. */
  sideNavCollapsed: boolean;
  /**
   * DOM id of the side nav, when one is actually rendered. Omitted when there
   * is no side nav in the document (standalone use, or the mobile overlay
   * while it is closed) so that `aria-controls` never dangles.
   */
  sideNavId?: string;
  onToggleSideNav: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /**
   * Where the wordmark goes when clicked. Omit and it stays plain text.
   *
   * Owner request 2026-08-03: "user must be able [to] access the landing even
   * when logged in by clicking [the] autoworkshop logo". In `customer-web` the
   * public marketplace is a REAL DESTINATION for a signed-in person — it is the
   * parts store — but `/` redirects them to their dashboard, so once you have an
   * account the shop becomes unreachable. A wordmark that goes home is the
   * convention every storefront already uses.
   *
   * A NODE-free prop rather than a `renderLink` callback: the brand is one
   * anchor, and `TopNav` must stay renderable in Storybook with no router.
   */
  brandHref?: string;
  /** Right-hand cluster (§10-§15). */
  actions?: TopNavAction[];
  userLabel?: string;
  /**
   * The role the viewer is ACTING AS, as a read-only chip beside the user chip.
   *
   * Owner request 2026-08-03. Before it, the active role was rendered nowhere a
   * single-role viewer could see: the only mention was the `<option>` text
   * inside the role switcher, which does not render below two roles. "Who am I
   * and what may I do here" is the question this strip exists to answer and it
   * answered only half of it.
   *
   * Superseded by `roleControl` when one is supplied — see below.
   */
  roleLabel?: string;
  /**
   * Replaces the read-only Role chip with the real switcher, for a viewer who
   * holds more than one role.
   *
   * REPLACES, never sits beside — same rule as `organizationSwitcher`. Two
   * controls naming the same role is how a user ends up unsure which is
   * authoritative, and this one is worse than the organisation case because the
   * role decides which navigation tree they are looking at.
   *
   * A ReactNode slot rather than data-plus-callback because switching role is a
   * SERVER action, and this package must stay renderable with no server, no
   * session and no Next runtime.
   */
  roleControl?: React.ReactNode;
  /**
   * Theme switcher (§15 sits beside the user profile in the right-hand
   * cluster). Injected rather than imported so TopNav keeps no dependency on
   * the theme context and stays renderable in isolation in Storybook.
   */
  themeControl?: React.ReactNode;
  /**
   * Sign in / sign out (§15). Injected for the same reason as `themeControl`:
   * signing out is a SERVER action bound to this app's Keycloak client, and
   * TopNav must stay renderable with no server, no session and no Next runtime.
   */
  accountControl?: React.ReactNode;
  /**
   * Replaces the read-only Organization chip with a real control (§5, T-0016).
   *
   * A ReactNode slot rather than data-plus-callback, mirroring `accountControl`:
   * switching organizations needs a server action, and a server action cannot be
   * created inside this client component — it has to be handed down from a
   * server layout.
   */
  organizationSwitcher?: React.ReactNode;
}

const ICONS: Record<string, string> = {
  menu: '☰',
  search: '⌕',
  create: '+',
  tasks: '✓',
  messages: '✉',
  notifications: '⌾',
  ai: '✦',
  help: '?',
  profile: '◍',
};

function Glyph({ name }: { name: string }) {
  // aria-hidden: the glyph is decorative — the accessible name comes from the
  // button's aria-label. A screen reader announcing "black star" helps nobody.
  return (
    <span aria-hidden="true" style={{ fontSize: primitive.fontSize.base, lineHeight: 1 }}>
      {ICONS[name] ?? '•'}
    </span>
  );
}

/** Count bubble. Capped at 99+ so a runaway number cannot break the layout. */
function Count({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span
      style={{
        marginLeft: primitive.space[1],
        minWidth: '1.25rem',
        padding: '0 0.25rem',
        borderRadius: primitive.radius.full,
        background: themeVar.statusDanger,
        color: primitive.color.grey[0],
        fontSize: primitive.fontSize.xs,
        lineHeight: '1.25rem',
        textAlign: 'center',
        display: 'inline-block',
      }}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * Workspace / organisation / branch / user indicator.
 *
 * Renders as a MENU BUTTON only when it has somewhere to go (`onSelect`), and
 * as plain text otherwise.
 *
 * WHY THE SPLIT. Switching organisation or branch depends on the membership
 * data that Phase 2 (T-0003/T-0005) is still building. Until then there is
 * nothing to switch to, and a `<button>` with a dropdown caret is a promise the
 * UI cannot keep: a keyboard or screen-reader user reaches a control, activates
 * it, and nothing happens — with no way to tell whether they mis-pressed it or
 * the app is broken. Showing the current context as text is honest and still
 * conveys the whole point of §5-§7, which is knowing where you are.
 *
 * When the switcher lands, pass `onSelect` and it becomes a real menu button
 * with the `aria-haspopup`/`aria-expanded` a menu requires.
 */
function Selector({
  label,
  value,
  onSelect,
  expanded,
}: {
  label: string;
  value?: string;
  onSelect?: () => void;
  expanded?: boolean;
}) {
  if (!value) return null;

  if (!onSelect) {
    return (
      <span
        // Not a button: no role, not focusable, no caret. It is a status
        // readout, and it says so to assistive technology.
        aria-label={`${label}: ${value}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: `${primitive.space[1]} ${primitive.space[2]}`,
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          background: themeVar.backgroundSecondary,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label}: ${value}`}
      aria-haspopup="menu"
      aria-expanded={expanded ?? false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: primitive.space[1],
        padding: `${primitive.space[1]} ${primitive.space[2]}`,
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        background: themeVar.backgroundPrimary,
        color: themeVar.textPrimary,
        fontSize: primitive.fontSize.sm,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
      <span aria-hidden="true" style={{ color: themeVar.textSecondary }}>
        ▾
      </span>
    </button>
  );
}

export function TopNav({
  workspaceLabel,
  organizationLabel,
  branchLabel,
  sideNavCollapsed,
  sideNavId,
  onToggleSideNav,
  searchValue,
  onSearchChange,
  brandHref,
  actions = [],
  userLabel,
  roleLabel,
  roleControl,
  themeControl,
  accountControl,
  organizationSwitcher,
}: TopNavProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: primitive.space[3],
        padding: `${primitive.space[2]} ${primitive.space[4]}`,
        background: themeVar.backgroundPrimary,
        borderBottom: `1px solid ${themeVar.borderDefault}`,
        minHeight: '3.5rem',
      }}
    >
      {/* ---- Left section (§3) ---- */}
      <button
        type="button"
        onClick={onToggleSideNav}
        // §4: the same control expands and collapses, so its accessible name
        // must describe the ACTION, and aria-expanded must report the state.
        aria-label={sideNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!sideNavCollapsed}
        // Only reference the side nav when it is genuinely mounted. TopNav is
        // used standalone (Storybook, and any surface without a side nav), and
        // below 768px the nav is an overlay that is absent while closed — in
        // both cases a hardcoded `aria-controls` named an element that did not
        // exist, which axe rates CRITICAL. The caller knows; this component
        // cannot.
        aria-controls={sideNavId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2.25rem',
          height: '2.25rem',
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          background: themeVar.backgroundPrimary,
          color: themeVar.textPrimary,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Glyph name="menu" />
      </button>

      {/* A plain <a>, not the injected renderLink: this is one anchor to a
          fixed address, and a full page load is CORRECT here — the destination
          is a different part of the product with its own shell. */}
      {brandHref ? (
        <a
          className="aw-topnav-brand"
          href={brandHref}
          title="Go to the parts marketplace"
          style={{
            fontWeight: 600,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.base,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
        >
          AutoWorkshop AI
        </a>
      ) : (
        <span
          className="aw-topnav-brand"
          style={{
            fontWeight: 600,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.base,
            whiteSpace: 'nowrap',
          }}
        >
          AutoWorkshop AI
        </span>
      )}

      {/* Workspace / organisation / branch selectors (§5, §6, §7).
          Hidden below the tablet breakpoint: on a 360px phone these three
          would consume the entire bar and leave no room for search. */}
      <div className="aw-topnav-selectors" style={{ display: 'flex', gap: primitive.space[2] }}>
        <Selector label="Workspace" value={workspaceLabel} />
        {/* The switcher REPLACES the chip when one is supplied, rather than
            sitting beside it — two controls naming the same organisation is how
            a user ends up unsure which one is authoritative. */}
        {organizationSwitcher ?? <Selector label="Organization" value={organizationLabel} />}
        <Selector label="Branch" value={branchLabel} />
      </div>

      {/* ---- Center section (§8 search, §9 quick-create) ---- */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <label
          className="aw-topnav-search"
          style={{ position: 'relative', width: '100%', maxWidth: '32rem', minWidth: '6rem' }}
        >
          {/* Visually hidden but present for screen readers — a placeholder is
              not an accessible name. */}
          <span
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}
          >
            Search vehicles, jobs, parts, customers
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search vehicles, jobs, parts, customers…"
            style={{
              width: '100%',
              padding: `${primitive.space[2]} ${primitive.space[3]}`,
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              background: themeVar.backgroundSecondary,
              color: themeVar.textPrimary,
              fontSize: primitive.fontSize.sm,
            }}
          />
        </label>
      </div>

      {/* ---- Right section (§9-§15) ---- */}
      <nav aria-label="Global actions" style={{ display: 'flex', alignItems: 'center', gap: primitive.space[1] }}>
        {actions.map((a) => {
          // An action with no handler is not yet built. It renders DISABLED and
          // says so in its accessible name, rather than presenting as live and
          // doing nothing when pressed. §70 requires the user never be left
          // uncertain whether an action succeeded — a silent no-op is the purest
          // form of that uncertainty.
          const unavailable = !a.onSelect;
          const countPart = typeof a.count === 'number' ? `, ${a.count} pending` : '';
          const onMobile = a.showOnMobile ?? MOBILE_PRIMARY_ACTIONS.has(a.id);
          return (
            <button
              key={a.id}
              className={onMobile ? undefined : 'aw-topnav-secondary'}
              type="button"
              onClick={a.onSelect}
              disabled={unavailable}
              aria-label={`${a.label}${countPart}${unavailable ? ', not available yet' : ''}`}
              title={unavailable ? `${a.label} — not available yet` : a.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '2.25rem',
                height: '2.25rem',
                padding: `0 ${primitive.space[2]}`,
                border: `1px solid transparent`,
                borderRadius: primitive.radius.md,
                background: 'transparent',
                color: themeVar.textSecondary,
                cursor: unavailable ? 'not-allowed' : 'pointer',
                opacity: unavailable ? 0.45 : 1,
              }}
            >
              <Glyph name={a.icon} />
              {typeof a.count === 'number' ? <Count value={a.count} /> : null}
            </button>
          );
        })}
        <span className="aw-topnav-secondary" style={{ display: 'inline-flex' }}>
          {themeControl}
        </span>
        {userLabel ? (
          <span className="aw-topnav-secondary" style={{ display: 'inline-flex' }}>
            <Selector label="User" value={userLabel} />
          </span>
        ) : null}
        {/* WHO, then AS WHAT — in that order, reading toward the sign-out
            button (owner request 2026-08-03).

            The switcher REPLACES the chip rather than joining it, for the same
            reason the organisation one does: two controls naming the same role
            leaves the user unsure which is authoritative — and here that role
            is what decides the navigation tree they are looking at.

            ⚠️ The parentheses are load-bearing. `roleControl ?? roleLabel ? x : y`
            is legal and parses as `(roleControl ?? roleLabel) ? x : y`, which is
            the intent — but relying on that is how the next edit reads it the
            other way round.

            `.aw-topnav-secondary` matches the user chip beside it, so the pair
            steps aside together below 767px rather than collapsing to a name
            with no role. */}
        {(roleControl ?? roleLabel) ? (
          <span className="aw-topnav-secondary" style={{ display: 'inline-flex' }}>
            {roleControl ?? <Selector label="Acting as" value={roleLabel} />}
          </span>
        ) : null}
        {/* Deliberately NOT in `.aw-topnav-secondary`, unlike the user chip it
            sits beside. Ending a session on a shared workshop terminal is the
            one control that must survive on a phone — and §68's overflow rule
            allows hiding a control only while an alternative exists, which for
            sign-out there is not. It is a fixed ~5.5rem; the search field is
            already allowed to shrink to 8rem below 480px to make room. */}
        {accountControl}
      </nav>

      {/* Responsive rule (§68 breakpoints). Inline styles cannot express media
          queries, and adding a CSS-in-JS runtime for three rules would be a
          dependency this project does not need. */}
      <style>{`
        @media (max-width: 1024px) {
          .aw-topnav-selectors { display: none !important; }
        }
        /* Phone. The bar cannot hold everything and does not wrap, so the
           secondary cluster and the wordmark step aside. The menu button,
           search and the primary actions survive — see MOBILE_PRIMARY_ACTIONS
           for why those and not others. */
        @media (max-width: 767px) {
          .aw-topnav-secondary { display: none !important; }
          .aw-topnav-brand { display: none !important; }
        }
        /* Below this the search field would be squeezed to a few characters,
           which is worse than a narrower but usable field. */
        @media (max-width: 480px) {
          .aw-topnav-search { min-width: 8rem; }
        }
      `}</style>
    </header>
  );
}
