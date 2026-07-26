'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Tabs — `01 (1).txt` §2 (shell) and §70 (component states).
 *
 * Implements the WAI-ARIA Tabs pattern properly, which means more than putting
 * `role="tab"` on a button:
 *
 *   - exactly ONE tab is in the tab order (roving `tabIndex`). A tab strip
 *     where every tab is tabbable forces a keyboard user through all of them to
 *     reach the panel — the pattern exists specifically to avoid that.
 *   - Arrow keys move between tabs, Home/End jump to the ends.
 *   - `aria-controls` / `aria-labelledby` tie each tab to its panel.
 *   - Disabled tabs are skipped by arrow navigation rather than trapping focus.
 *
 * ACTIVATION IS MANUAL, NOT AUTOMATIC. Arrow keys move focus; Enter/Space (or a
 * click) selects. Automatic activation — selecting on focus — is allowed by the
 * spec only for cheap panels. Tabs here front job cards, diagnostics and parts
 * lists that each cost a fetch, so arrowing across five tabs would fire five
 * requests and the user would land on data they never asked for.
 *
 * Controlled or uncontrolled: pass `value` + `onChange` to drive it from a URL
 * (deep-linkable tabs), or omit both and let it manage its own state.
 */

/**
 * Which tab a key press should move focus to, or `undefined` for keys the tab
 * strip does not handle.
 *
 * Extracted as a pure function so the keyboard contract is unit-testable
 * without a DOM. Keyboard navigation is the part of an ARIA pattern that
 * silently rots — it is invisible to a mouse user, invisible to a snapshot test
 * and invisible to typecheck, so it needs assertions of its own.
 *
 * `order` must contain only ENABLED tab ids: arrow keys skip disabled tabs
 * rather than landing on them.
 */
export function nextTabId(
  order: readonly string[],
  currentId: string,
  key: string,
): string | undefined {
  const i = order.indexOf(currentId);
  if (i === -1 || order.length === 0) return undefined;

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return order[(i + 1) % order.length];
    case 'ArrowLeft':
    case 'ArrowUp':
      return order[(i - 1 + order.length) % order.length];
    case 'Home':
      return order[0];
    case 'End':
      return order[order.length - 1];
    default:
      return undefined;
  }
}

export interface TabItem {
  id: string;
  label: string;
  /** §70 disabled state — e.g. a tab whose permission the viewer lacks. */
  disabled?: boolean;
  /** Count badge, e.g. "Complaints 3". */
  count?: number;
  content: React.ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  /** Controlled selection. Omit for uncontrolled. */
  value?: string;
  onChange?: (id: string) => void;
  defaultValue?: string;
  /** Labels the tab strip for screen readers, e.g. "Job card sections". */
  ariaLabel: string;
}

export function Tabs({ items, value, onChange, defaultValue, ariaLabel }: TabsProps) {
  const enabled = items.filter((t) => !t.disabled);
  const firstSelectable = defaultValue ?? enabled[0]?.id ?? items[0]?.id ?? '';

  const [internal, setInternal] = React.useState(firstSelectable);
  const selected = value ?? internal;

  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const select = React.useCallback(
    (id: string) => {
      if (value === undefined) setInternal(id);
      onChange?.(id);
    },
    [value, onChange],
  );

  // Arrow-key navigation across the enabled tabs only. Wraps at both ends,
  // which is what the pattern specifies and what users expect from a strip.
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentId: string) => {
    const nextId = nextTabId(
      enabled.map((t) => t.id),
      currentId,
      e.key,
    );
    if (!nextId) return;
    e.preventDefault();
    // Move focus only. Selection follows an explicit Enter/Space or click —
    // see the manual-activation note above.
    tabRefs.current[nextId]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        style={{
          display: 'flex',
          gap: primitive.space[1],
          borderBottom: `1px solid ${themeVar.borderDefault}`,
          overflowX: 'auto',
        }}
      >
        {items.map((tab) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`tabpanel-${tab.id}`}
              aria-selected={isSelected}
              aria-disabled={tab.disabled || undefined}
              // Roving tabindex: only the selected tab is reachable by Tab.
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, tab.id)}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                // The selected tab is marked by an underline AND a colour
                // change. Colour alone would fail WCAG 1.4.1 (use of colour).
                borderBottom: `2px solid ${isSelected ? themeVar.actionPrimary : 'transparent'}`,
                marginBottom: '-1px',
                padding: `${primitive.space[2]} ${primitive.space[3]}`,
                cursor: tab.disabled ? 'not-allowed' : 'pointer',
                color: tab.disabled
                  ? themeVar.textSecondary
                  : isSelected
                    ? themeVar.actionPrimary
                    : themeVar.textPrimary,
                opacity: tab.disabled ? 0.5 : 1,
                fontSize: primitive.fontSize.sm,
                fontWeight: isSelected ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span
                  style={{
                    marginLeft: primitive.space[2],
                    padding: `0 ${primitive.space[2]}`,
                    borderRadius: primitive.radius.full,
                    background: themeVar.backgroundSecondary,
                    color: themeVar.textSecondary,
                    fontSize: primitive.fontSize.xs,
                  }}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {items.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== selected}
          // The panel itself is focusable so that Tab from the selected tab
          // lands on the content, per the ARIA pattern.
          tabIndex={0}
          style={{ paddingTop: primitive.space[4] }}
        >
          {tab.id === selected ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
