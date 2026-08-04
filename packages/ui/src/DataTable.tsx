import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * THE PRODUCT'S TABLE.
 *
 * ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * `job-queue-screen.tsx` drew its own table with two hardcoded hex values:
 *
 *     borderBottom: '2px solid #d8dde4'   // header
 *     borderBottom: '1px solid #eef1f5'   // rows
 *
 * Both are LIGHT-THEME GREYS baked into the markup, so in dark mode the table
 * drew pale rules across a dark surface. It was also the only table in the
 * product that had opted out of the token system, which meant every queue screen
 * built from it inherited a look nothing else shared.
 *
 * One table, tokens only, used everywhere.
 *
 * ── WHAT MAKES IT COMMERCIAL RATHER THAN MERELY CORRECT ─────────────────────
 *
 * - **A card, not a bare grid.** The table sits on a raised surface with a
 *   border and a radius, so a screen reads as one object rather than text
 *   floating on the canvas.
 * - **A sticky header** that survives scrolling a long queue — the column you
 *   are reading is the one thing you must not lose.
 * - **Row hover**, so the eye can track across eight columns without a ruler.
 * - **Tabular figures** on numeric cells: a column of job numbers or prices
 *   that shuffles as digits change is the classic tell of an amateur table.
 * - **A caption bar** rather than a floating count above the table.
 * - **Horizontal scroll contained INSIDE the card.** This is load-bearing: the
 *   repo has a standing defect (T-0044) where the whole document scrolls
 *   sideways. A wide table must scroll within its own box, never push the page.
 *
 * ── ACCESSIBILITY IS NOT OPTIONAL HERE ──────────────────────────────────────
 *
 * `<caption>` stays a real caption (screen readers announce it as the table's
 * name), `<th scope="col">` is set so a cell can be related to its column, and
 * the scroll container is focusable with `tabIndex={0}` — a region that scrolls
 * must be reachable by keyboard or its right-hand columns are unreachable
 * without a mouse.
 */

export interface DataTableColumn<Row> {
  /** Stable key, also used as the React key for the cell. */
  key: string;
  /** Column heading. */
  header: React.ReactNode;
  /** Cell renderer. */
  cell: (row: Row) => React.ReactNode;
  /**
   * Right-align and use tabular figures. For money, counts and dates — the
   * columns a reader compares DOWN rather than reads across.
   */
  numeric?: boolean;
  /** Stop this column wrapping (registration plates, job numbers, dates). */
  nowrap?: boolean;
  /**
   * Hide below ~48rem. Use for columns that are useful on a desk and noise on a
   * phone; never for the one column that identifies the row.
   */
  secondary?: boolean;
}

export interface DataTableProps<Row> {
  /** Announced as the table's name. Say what the rows ARE. */
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Stable identity per row. */
  rowKey: (row: Row) => string;
  /**
   * Shown in the caption bar, e.g. "3 job cards". Kept separate from `caption`
   * because the count changes and the name does not.
   */
  summary?: React.ReactNode;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  summary,
}: DataTableProps<Row>) {
  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.xl,
        background: themeVar.surfaceRaised,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      {summary ? (
        <div
          style={{
            padding: `${primitive.space[3]} ${primitive.space[4]}`,
            borderBottom: `1px solid ${themeVar.borderDefault}`,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
            color: themeVar.textSecondary,
          }}
        >
          {summary}
        </div>
      ) : null}

      {/*
        ⚠️ THE SCROLL LIVES HERE, NOT ON THE DOCUMENT. `overflowX: auto` on this
        wrapper is what keeps a wide table from widening the page — T-0044's
        failure mode. `tabIndex={0}` because a scrollable region that cannot be
        focused cannot be scrolled from a keyboard.
      */}
      <div style={{ overflowX: 'auto', maxWidth: '100%' }} tabIndex={0} role="group" aria-label={caption}>
        <table
          className="aw-datatable"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
            }}
          >
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.secondary ? 'aw-col-secondary' : undefined}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    textAlign: c.numeric ? 'right' : 'left',
                    padding: `${primitive.space[3]} ${primitive.space[4]}`,
                    background: themeVar.backgroundSecondary,
                    borderBottom: `1px solid ${themeVar.borderDefault}`,
                    color: themeVar.textSecondary,
                    fontSize: primitive.fontSize.xs,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="aw-datatable-row">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={c.secondary ? 'aw-col-secondary' : undefined}
                    style={{
                      padding: `${primitive.space[3]} ${primitive.space[4]}`,
                      borderTop: `1px solid ${themeVar.borderDefault}`,
                      color: themeVar.textPrimary,
                      textAlign: c.numeric ? 'right' : 'left',
                      fontVariantNumeric: c.numeric ? 'tabular-nums' : undefined,
                      whiteSpace: c.nowrap ? 'nowrap' : undefined,
                      verticalAlign: 'middle',
                    }}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        /* Hover, and ONLY on a device that has a hover-capable pointer. On a
           touch screen :hover sticks after a tap and leaves a row highlighted
           as if it were selected. */
        @media (hover: hover) {
          .aw-datatable-row:hover td { background: var(--aw-background-secondary); }
        }
        /* The first row's top border would double with the header's bottom. */
        .aw-datatable tbody tr:first-child td { border-top: none; }
        @media (max-width: 48rem) {
          .aw-col-secondary { display: none; }
        }
      `}</style>
    </div>
  );
}
