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
 * ⚠️ A PLAIN `<a>`, NOT `next/link`, AND THAT IS A CONSEQUENCE OF LIVING HERE.
 * `packages/ui` is deliberately framework-free — `react` is its only peer
 * dependency and nothing else in it imports `next`. This component moved here
 * from workshop-web on 2026-08-11 so customer-web could use it too, and adding
 * `next` to the design-system package for one component would be a far bigger
 * change than the one being made.
 *
 * What is lost is `next/link`'s prefetch and client-side transition. What is
 * kept is everything the paragraph above argues for, which was always the
 * reason it is a link: it works from the first byte of HTML, middle-clicks into
 * a new tab, and is announced as a link. A create action loads a form; a full
 * navigation there is not a regression worth a framework dependency.
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
    <a
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
    </a>
  );
}
