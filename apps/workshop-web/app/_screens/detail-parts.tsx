import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Shared building blocks for the detail screens.
 *
 * Extracted because the customer and vehicle detail pages present the same
 * shape — a back link, then sections of labelled facts — and two near-identical
 * copies is how one of them quietly stops matching the other.
 */

/** `12,345 km`, or an em dash when the odometer was never recorded. */
export function mileage(km: number | null): string {
  // `0` is a real reading on a new vehicle, so the null check is explicit —
  // `km ? … : '—'` would print a dash for a genuine zero.
  return km === null ? '—' : `${km.toLocaleString('en-GB')} km`;
}

/**
 * A real `<a>`, not a button with an onClick.
 *
 * It is a navigation, so it must be middle-clickable, openable in a new tab and
 * announced as a link. A div with a click handler is none of those things.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        marginBottom: primitive.space[4],
        color: themeVar.textSecondary,
        fontSize: primitive.fontSize.sm }}
    >
      ← {label}
    </a>
  );
}

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      // Named for screen-reader navigation: a page of unlabelled sections is
      // one long undifferentiated region to anyone not looking at it.
      aria-label={title}
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.backgroundSecondary,
        marginBottom: primitive.space[4],
      }}
    >
      <h2
        style={{
          margin: `0 0 ${primitive.space[4]} 0`,
          fontSize: primitive.fontSize.lg,
          color: themeVar.textPrimary,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Labelled facts as a real `<dl>`.
 *
 * A two-column table would look the same and mean something different: these
 * are term/definition pairs, not tabular data, and the right element is what
 * lets assistive technology pair each value with its own label.
 */
export function DefinitionList({
  items,
}: {
  items: Array<{ term: string; value: React.ReactNode; mono?: boolean }>;
}) {
  return (
    <dl
      style={{
        display: 'grid',
        // Two columns on a wide screen, one on a narrow one, without a media
        // query — the layout collapses when there is no room for 2 tracks.
        gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        gap: primitive.space[4],
        margin: 0,
      }}
    >
      {items.map((i) => (
        <div key={i.term}>
          <dt
            style={{
              fontSize: primitive.fontSize.sm,
              color: themeVar.textSecondary,
              marginBottom: primitive.space[1],
            }}
          >
            {i.term}
          </dt>
          <dd
            style={{
              margin: 0,
              color: themeVar.textPrimary,
              // Monospaced for VINs and part numbers — `01 (1).txt` §2845.
              fontFamily: i.mono ? primitive.fontFamily.mono : undefined,
              // A VIN is 17 characters with no spaces and will otherwise push
              // the page sideways on a phone.
              overflowWrap: 'anywhere',
            }}
          >
            {i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
