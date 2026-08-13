import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abossey Okai Auto Parts Marketplace — AutoWorkshop AI',
  description:
    'Browse car parts from verified suppliers and find a mechanic near you. Free to search — no account needed.',
};

/**
 * THE CUSTOMER PACK'S LAYOUT — and it is deliberately almost nothing.
 *
 * ⚠️ IT DOES NOT RENDER `WorkspaceShell`, AND THAT IS THE POINT, not an
 * omission. This layout wraps EVERY route in the pack, including the public
 * marketplace. When it rendered the shell directly (before 2026-08-03), a
 * signed-out visitor arriving to browse parts was shown the signed-in
 * application's navigation — the home and dashboard tree — before they had an
 * account. The shell lives one level down in `(app)/layout.tsx`, which wraps
 * the authenticated routes and nothing else. Route groups do not appear in the
 * URL, so the paths are unchanged by that split.
 *
 * WHAT IT USED TO DO AND NO LONGER DOES (ADR-021). It owned `<html>`, `<body>`,
 * the theme boot script, `ThemeProvider` and the Keycloak prewarm, because it
 * was the ROOT layout of a separately deployed application. There is one
 * artifact now and exactly one layout may open a document: `main`'s, at
 * `apps/web/app/layout.tsx`, which carries all five.
 *
 * So what is left is the pack's own `metadata` and a pass-through. That looks
 * like a file worth deleting and it is not — remove it and this pack inherits
 * the artifact's generic title, losing the marketplace's own description on the
 * one surface in this product that strangers reach from a search engine.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
