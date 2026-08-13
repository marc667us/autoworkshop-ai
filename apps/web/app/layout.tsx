import type { Metadata } from 'next';
import { ThemeProvider, themeBootScript } from '@autoworkshop/ui';
import { prewarmKeycloak } from '@autoworkshop/auth';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI',
  description:
    'Vehicle repair, parts and fleet management — workshops, suppliers, customers, '
    + 'fleets, insurers and recovery operators in one place.',
};

/**
 * `main` — THE ROOT LAYOUT OF THE WHOLE ARTIFACT (ADR-021).
 *
 * There used to be seven of these, one per deployed app, and each owned an
 * `<html>` and a `<body>`. Exactly one may now, because there is one Next.js
 * process serving all seven packs. The pack layouts beneath this one were
 * demoted to ordinary nested layouts: they keep their own `metadata` and their
 * own shell, and they no longer open a document.
 *
 * ⚠️ THIS IS DELIBERATELY THE THINNEST LAYOUT IN THE APPLICATION. It renders no
 * navigation and no `WorkspaceShell`, because it wraps EVERY route including
 * the public marketplace at `/`. The seven packs each mount their own shell one
 * level down, which is the same split `customer-web` arrived at on 2026-08-03
 * after a signed-out visitor to the storefront was shown the signed-in
 * application's navigation before they had an account.
 *
 * ⚠️ `ThemeProvider` IS LOAD-BEARING, AND THE SECOND REASON IS NOT COSMETIC.
 * First, the public pages should honour a visitor's light/dark preference like
 * every other screen. Second, it is this layout's CLIENT BOUNDARY: with a root
 * layout containing no client component at all, Next 15.1.3 fails to prerender
 * `/_not-found` with "Cannot read properties of null (reading 'useContext')",
 * then falls back to the pages-router error page and dies with "<Html> should
 * not be imported outside of pages/_document". Both symptoms, one cause — both
 * measured by removing and restoring this component in `customer-web`. If it is
 * ever taken out, the app router needs another client boundary here, not a
 * workaround on the 404 route.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Start Keycloak waking NOW, not when somebody presses "Sign in".
  //
  // Free-tier Keycloak has been measured here at 126-137s from cold, and the
  // visitor most exposed to it is whoever arrives first after a quiet period —
  // on one merged artifact that is now literally anybody, rather than only the
  // customer pack's traffic. Fire-and-forget and throttled to one ping per five
  // minutes per process; see `prewarm.ts`. Safe in a synchronous component
  // precisely because nothing is awaited.
  prewarmKeycloak();

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
