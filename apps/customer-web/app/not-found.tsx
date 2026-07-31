import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * 404 for the customer workspace.
 *
 * ⚠️ DELIBERATELY A PURE SERVER COMPONENT WITH NO SHELL. It renders under the
 * ROOT layout, which is reached by signed-out visitors — so pulling the
 * application shell in here would put the signed-in navigation in front of
 * somebody who mistyped a URL, which is the same leak the root layout was split
 * to prevent.
 *
 * ⚠️ AND WHY THE HOME LINK IS AN <a> RATHER THAN next/link. This route is
 * STATICALLY PRERENDERED at build time. next/link reads the App Router context
 * with useContext, and during static export of `/_not-found` that context is
 * null under this workspace's React 18.3.1 / Next 15 pairing — the build fails
 * with "Cannot read properties of null (reading 'useContext')". A 404 sending
 * somebody back to the front page is a full document navigation anyway, so
 * there is nothing to gain from a client-side transition here.
 *
 * It names no route the viewer cannot already reach. A 404 that lists the
 * pages you are missing is a site map handed to someone who was guessing.
 */
export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: '40rem',
        margin: '0 auto',
        padding: primitive.space[8],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[3],
      }}
    >
      <h1 style={{ margin: 0, fontSize: primitive.fontSize.xl, color: themeVar.textPrimary }}>
        That page does not exist
      </h1>
      <p style={{ margin: 0, color: themeVar.textSecondary }}>
        The address may have been mistyped, or the page may have moved. The marketplace is free to
        browse without an account.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        style={{
          alignSelf: 'flex-start',
          padding: `${primitive.space[2]} ${primitive.space[4]}`,
          borderRadius: primitive.radius.md,
          background: primitive.color.blue[600],
          color: '#ffffff',
          fontWeight: 700,
          fontSize: primitive.fontSize.sm,
          textDecoration: 'none',
        }}
      >
        Go to the marketplace
      </a>
    </main>
  );
}
