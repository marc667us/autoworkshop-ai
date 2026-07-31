import type { Metadata } from 'next';
import { ThemeProvider, themeBootScript } from '@autoworkshop/ui';

export const metadata: Metadata = {
  title: 'Abossey Okai Auto Parts Marketplace — AutoWorkshop AI',
  description:
    'Browse car parts from verified suppliers and find a mechanic near you. Free to search — no account needed.',
};

/**
 * ROOT LAYOUT — html, body, the theme boot script and the theme provider.
 * No application shell.
 *
 * ⚠️ WHY THE APPLICATION SHELL IS NO LONGER HERE. This layout wraps EVERY route
 * in the workspace, including the public landing page at `/`. When it rendered
 * `WorkspaceShell` directly, a signed-out visitor arriving at the marketplace
 * got the signed-in application's navigation — the home and dashboard tree —
 * before they had an account. That contradicts the requirement directly: a
 * visitor may only VIEW, and sees home and the dashboard once signed in.
 *
 * The shell therefore moved down one level into the `(app)` route group, which
 * wraps the authenticated routes and nothing else. Route groups do not appear
 * in the URL, so `/home/dashboard` is still `/home/dashboard`; the only thing
 * that changed is which layouts wrap it.
 *
 * ⚠️ `ThemeProvider` IS RENDERED HERE FOR TWO REASONS, AND THE SECOND IS NOT
 * COSMETIC. First, the public landing page should honour the visitor's
 * light/dark preference like every other screen — it used to inherit that from
 * the shell, and the split would otherwise have taken it away.
 *
 * Second, it is the root layout's CLIENT BOUNDARY, and removing it breaks the
 * build. With a root layout containing no client component at all, Next 15.1.3
 * fails to prerender `/_not-found` with "Cannot read properties of null
 * (reading 'useContext')" and then falls back to generating the pages-router
 * error page, which dies with "<Html> should not be imported outside of
 * pages/_document". Both symptoms have this one cause; both were measured by
 * removing and restoring this component. If it is ever taken out, the app
 * router needs another client boundary at the root, not a workaround on the
 * 404 route.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — prevents the flash of
            incorrect theme. Must be inline and synchronous: a React effect runs
            after paint, which is exactly too late. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        style={{
          margin: 0,
          background: 'var(--aw-background-primary)',
          color: 'var(--aw-text-primary)',
        }}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
