import Link from 'next/link';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The primary "Add new …" action on a list screen.
 *
 * A LINK, NOT A BUTTON, and deliberately so: it navigates. A `<button>` with an
 * onClick would need JavaScript to have loaded before it did anything, and on a
 * workshop connection that is exactly when someone taps twice and gives up. An
 * anchor works from the first byte of HTML, opens in a new tab on middle-click,
 * and is announced as a link by a screen reader — which is what it is.
 *
 * It renders NOTHING when `href` is null. `quickCreateHref` returns null when
 * the action is not in this viewer's navigation, so the absent button and the
 * route's own `requireNavRoute` gate are two expressions of one fact rather
 * than two places to keep in step.
 */
export function QuickCreateButton({
  href,
  label,
}: {
  href: string | null;
  /** Written out in full — "Add customer", not "Add" or "+". */
  label: string;
}) {
  if (!href) return null;
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        padding: `${primitive.space[2]} ${primitive.space[4]}`,
        borderRadius: primitive.radius.md,
        background: primitive.color.blue[600],
        color: primitive.color.grey[0],
        fontWeight: 600,
        fontSize: primitive.fontSize.sm,
        textDecoration: 'none',
        // A visible edge in forced-colours mode, where background colour is
        // discarded and a solid block would otherwise vanish entirely.
        border: `1px solid ${themeVar.borderDefault}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Link>
  );
}
