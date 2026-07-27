import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workspaces as servers } from '../playwright.config';

/**
 * Build-freshness guard — runs before every other project (see `projects` in
 * `playwright.config.ts`).
 *
 * WHAT IT PREVENTS, CONCRETELY
 * ----------------------------
 * T-0030 was reported as a live responsive defect: at 360px the side nav
 * rendered inline, `main` was squeezed to 103px and the page scrolled
 * horizontally by 161px. It survived a session boundary as an open red defect.
 *
 * It was not a defect in the shell. Seven `next start` servers were running
 * from an earlier build; the apps were then rebuilt underneath them, and
 * `reuseExistingServer: !CI` handed those stale servers to the suite. `next
 * start` reads its chunk manifest once, at boot, so the stale servers kept
 * emitting HTML that referenced chunk hashes the rebuild had already deleted.
 * Every script 404'd, React never hydrated, and `useIsMobile()` was therefore
 * stuck on the `false` it deliberately starts with for SSR safety.
 *
 * WHY THIS IS WORTH A GATE RATHER THAN A README LINE
 * --------------------------------------------------
 * The failure presents as a *product* bug, not a tooling one. The server still
 * answers 200. The server-rendered markup is correct. TopNav's mobile rules are
 * plain CSS inside that markup, so they keep working — which makes the page
 * look selectively broken rather than completely inert, and that is exactly
 * what a real responsive bug looks like. Nothing in the failure names its own
 * cause.
 *
 * "Stop the servers before rebuilding" was already documented in
 * SESSION_HANDOVER.md when this happened. Documentation did not prevent it.
 *
 * WHAT IT CHECKS
 * --------------
 * For each app: fetch the page the journeys actually load, collect every
 * `/_next/static/**` asset the served HTML references, and assert that each one
 * exists in that app's `.next` directory. A reference to a file that is not on
 * disk is proof the server's in-memory build and the build on disk have
 * diverged — which is the precise condition that produced T-0030.
 *
 * This asserts the EFFECT (the app the browser will actually receive is
 * coherent), not a setting. A check that merely confirmed `reuseExistingServer`
 * was configured would have passed happily throughout the original incident.
 */

/**
 * `/_next/static/chunks/x.js` -> `<app>/.next/static/chunks/x.js`
 *
 * The URL must be percent-DECODED first. Next's catch-all route ships as
 * `chunks/app/%5B...slug%5D/page-<hash>.js` in the HTML but sits on disk under
 * a literal `[...slug]` directory. Comparing the encoded form against the
 * filesystem reports that file as missing on a perfectly fresh build — a guard
 * that fails when nothing is wrong is worse than no guard, because the next
 * person learns to ignore it.
 */
function assetToDiskPath(appDir: string, assetPath: string): string {
  const relative = decodeURIComponent(assetPath.replace(/^\/_next\//, '').split('?')[0]);
  return join(appDir, '.next', relative);
}

for (const server of servers) {
  test(`${server.name}-web serves a build that exists on disk`, async ({ page }) => {
    const appDir = join(__dirname, '..', '..', `${server.name}-web`);

    const response = await page.goto(`http://127.0.0.1:${server.port}/`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response, `${server.name}-web did not respond`).not.toBeNull();

    const html = await page.content();

    // Every static asset the document references, in BOTH forms Next emits:
    //
    //   1. `<script src="/_next/static/chunks/….js">` — the tags the browser
    //      actually fetches, and what killed hydration in the T-0030 incident.
    //   2. `\"static/chunks/….js\"` inside the RSC flight payload — the same
    //      files, listed without the `/_next/` prefix and with escaped quotes.
    //
    // Scanning only form 1 leaves a false-pass path: a route whose stale chunk
    // is named only in the flight payload would be reported fresh. Cheap to
    // close, so closed. Stylesheets and fonts fail identically and are caught by
    // form 1 as well.
    const prefixed = html.match(/\/_next\/static\/[^"'\\\s>)]+/g) ?? [];
    const bare = (html.match(/(?<!\/_next\/)\bstatic\/(?:chunks|css|media)\/[^"'\\\s>)]+/g) ?? []).map(
      (a) => `/_next/${a}`,
    );
    const referenced = [...new Set([...prefixed, ...bare])];

    expect(
      referenced.length,
      `${server.name}-web referenced no /_next/static assets at all, which means this ` +
        `check is not actually checking anything — investigate before trusting a green run`,
    ).toBeGreaterThan(0);

    const missing = referenced.filter((asset) => !existsSync(assetToDiskPath(appDir, asset)));

    expect(
      missing,
      `${server.name}-web is serving a STALE BUILD.\n\n` +
        `It references ${missing.length} asset(s) that no longer exist in ` +
        `apps/${server.name}-web/.next:\n` +
        missing.map((m) => `  ${m}`).join('\n') +
        `\n\nThe server on port ${server.port} booted from an earlier build and the app was ` +
        `rebuilt underneath it. Every one of those assets 404s in the browser, React never ` +
        `hydrates, and the tests below will report plausible-looking product defects that do ` +
        `not exist (this is exactly what happened with T-0030).\n\n` +
        `Fix: stop the server on port ${server.port} and let Playwright start a fresh one, ` +
        `or restart it yourself after the build.`,
    ).toEqual([]);
  });
}
