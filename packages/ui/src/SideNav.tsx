'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  isActive,
  isGroupActive,
  searchItems,
  type NavGroup,
} from '@autoworkshop/navigation';

/**
 * Side navigation — `autoworkshop 01 (1).txt` §16-§17.
 *
 * §16 requires: expandable groups · collapsed icon mode · unread counters ·
 * warning badges · menu search · permission-aware visibility. Permission
 * filtering happens upstream in `visibleGroups()`; this component renders
 * whatever tree it is given and never decides visibility itself — one place to
 * get authorisation right, not two.
 *
 * §4: "The selected module shall remain visibly highlighted in both modes" —
 * so the active state is styled for expanded AND collapsed rendering.
 */

export interface SideNavProps {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  /** Group ids currently open. Controlled so the shell owns the preference. */
  expanded: string[];
  onToggleGroup: (groupId: string) => void;
  /** Counter/warning values by key, resolved by the host app. */
  counters?: Record<string, number>;
  warnings?: Record<string, number>;
  /** Menu search (§16). Empty string disables the filtered view. */
  searchQuery?: string;
  /** Rendered for each link. Next.js passes `next/link`; Storybook passes `a`. */
  renderLink: (props: {
    href: string;
    children: React.ReactNode;
    active: boolean;
    title?: string;
  }) => React.ReactNode;
}

const GROUP_ICONS: Record<string, string> = {
  home: '⌂',
  car: '⛃',
  wrench: '⚒',
  cog: '⚙',
  chat: '✉',
  card: '▤',
  lifebuoy: '◎',
  settings: '⚙',
  users: '⚇',
  factory: '⌸',
  sparkles: '✦',
  box: '▣',
  book: '▦',
  chart: '▥',
  building: '⌂',
  layers: '≡',
  truck: '⛟',
  store: '⌗',
};

function Badge({ value, tone }: { value: number; tone: 'count' | 'warning' }) {
  if (!value || value <= 0) return null;
  return (
    <span
      // Not aria-hidden: the number is real information. It is announced as
      // part of the link's accessible name via the `title`/label composition
      // in the item below.
      style={{
        marginLeft: 'auto',
        minWidth: '1.25rem',
        padding: '0 0.25rem',
        borderRadius: primitive.radius.full,
        background: tone === 'warning' ? themeVar.statusWarning : themeVar.actionPrimary,
        color: primitive.color.grey[0],
        fontSize: primitive.fontSize.xs,
        lineHeight: '1.25rem',
        textAlign: 'center',
      }}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

export function SideNav({
  groups,
  pathname,
  collapsed,
  expanded,
  onToggleGroup,
  counters = {},
  warnings = {},
  searchQuery = '',
  renderLink,
}: SideNavProps) {
  const width = collapsed ? '3.5rem' : '16rem';

  // §16 "Menu search". When searching, the grouped tree is replaced by a flat
  // result list: keeping groups collapsed around matches would hide the very
  // thing the user just searched for.
  const results = searchQuery.trim() ? searchItems(groups, searchQuery) : null;

  return (
    <nav
      id="app-side-nav"
      aria-label="Main navigation"
      style={{
        width,
        flexShrink: 0,
        borderRight: `1px solid ${themeVar.borderDefault}`,
        background: themeVar.backgroundSecondary,
        // §2: "The side navigation may remain fixed or independently scroll
        // when the menu exceeds the screen height." 14 groups x ~6 items does
        // exceed it, so it scrolls independently under a sticky top bar.
        position: 'sticky',
        top: '3.5rem',
        height: 'calc(100vh - 3.5rem)',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 120ms ease',
        padding: `${primitive.space[2]} 0`,
      }}
    >
      {results ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: `0 ${primitive.space[2]}` }}>
          {results.length === 0 ? (
            // Empty state — required per CLAUDE.md "Required per module".
            <li
              style={{
                padding: primitive.space[3],
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              No menu items match “{searchQuery}”.
            </li>
          ) : (
            results.map((r) => (
              <li key={`${r.groupId}/${r.id}`}>
                {renderLink({
                  href: r.href,
                  active: isActive(r.href, pathname),
                  title: `${r.groupLabel} › ${r.label}`,
                  children: (
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{r.label}</span>
                      <span
                        style={{
                          fontSize: primitive.fontSize.xs,
                          color: themeVar.textSecondary,
                        }}
                      >
                        {r.groupLabel}
                      </span>
                    </span>
                  ),
                })}
              </li>
            ))
          )}
        </ul>
      ) : (
        groups.map((g) => {
          const open = expanded.includes(g.id);
          const active = isGroupActive(g, pathname);
          const groupCount = g.items.reduce((n, i) => n + (i.counterKey ? counters[i.counterKey] ?? 0 : 0), 0);
          const groupWarn = g.items.reduce((n, i) => n + (i.warningKey ? warnings[i.warningKey] ?? 0 : 0), 0);

          return (
            <div key={g.id} style={{ marginBottom: primitive.space[1] }}>
              <button
                type="button"
                onClick={() => onToggleGroup(g.id)}
                aria-expanded={open}
                aria-controls={`navgroup-${g.id}`}
                title={collapsed ? g.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: primitive.space[2],
                  width: `calc(100% - ${primitive.space[4]})`,
                  margin: `0 ${primitive.space[2]}`,
                  padding: `${primitive.space[2]} ${primitive.space[2]}`,
                  border: 'none',
                  borderRadius: primitive.radius.md,
                  // §4: selected module stays highlighted in BOTH modes.
                  background: active ? themeVar.actionPrimarySoft : 'transparent',
                  color: active ? themeVar.actionPrimary : themeVar.textPrimary,
                  fontSize: primitive.fontSize.sm,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span aria-hidden="true" style={{ width: '1rem', flexShrink: 0 }}>
                  {GROUP_ICONS[g.icon] ?? '•'}
                </span>
                {!collapsed && <span style={{ flex: 1 }}>{g.label}</span>}
                {!collapsed && groupWarn > 0 && <Badge value={groupWarn} tone="warning" />}
                {!collapsed && groupWarn === 0 && groupCount > 0 && <Badge value={groupCount} tone="count" />}
                {!collapsed && (
                  <span aria-hidden="true" style={{ color: themeVar.textSecondary, marginLeft: primitive.space[1] }}>
                    {open ? '▾' : '▸'}
                  </span>
                )}
              </button>

              {/* In collapsed mode the submenu is not rendered at all. §4 says
                  collapsed shows group icons plus tooltips — rendering hidden
                  items would still expose them to screen readers and to
                  keyboard tabbing, which is a worse experience than absence. */}
              {open && !collapsed && (
                <ul
                  id={`navgroup-${g.id}`}
                  style={{
                    listStyle: 'none',
                    margin: `${primitive.space[1]} 0 0`,
                    padding: `0 ${primitive.space[2]}`,
                  }}
                >
                  {g.items.map((i) => {
                    const count = i.counterKey ? counters[i.counterKey] ?? 0 : 0;
                    const warn = i.warningKey ? warnings[i.warningKey] ?? 0 : 0;
                    const label =
                      count > 0 ? `${i.label}, ${count} pending` : warn > 0 ? `${i.label}, ${warn} needing attention` : i.label;
                    return (
                      <li key={i.id}>
                        {renderLink({
                          href: i.href,
                          active: isActive(i.href, pathname),
                          title: label,
                          children: (
                            <>
                              <span>{i.label}</span>
                              {warn > 0 ? <Badge value={warn} tone="warning" /> : <Badge value={count} tone="count" />}
                            </>
                          ),
                        })}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
      )}
    </nav>
  );
}
