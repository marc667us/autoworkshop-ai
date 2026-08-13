import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `pages.error` IS SET ONCE AND HONOURED BY SEVEN APPS.
 *
 * `workspace-auth.ts` points every workspace's failed sign-in at `/auth/error`.
 * That is a promise made on behalf of apps this file cannot see. An app without
 * the route does not warn, does not fail to build and does not fail to start —
 * it 404s the one visitor who already could not sign in, which is strictly worse
 * than the default Auth.js screen the override replaced.
 *
 * The failure is invisible from inside `packages/auth`, invisible to typecheck,
 * and only reachable by a real cold start against a sleeping Keycloak. So it is
 * asserted here, structurally, against the filesystem.
 *
 * ⚠️ THE APP LIST IS DISCOVERED, NOT LISTED. A hardcoded list of seven would
 * pass forever after somebody adds an eighth app — the exact shape of "a check
 * that walks through its own gap" this repo keeps paying for. `apps/` is read at
 * test time, so a new web app is in scope the moment it exists.
 */
describe('the auth error route Auth.js is configured to redirect to', () => {
  const appsDir = join(__dirname, '../../../apps');

  /**
   * 🔴 REWRITTEN FOR ADR-021, AND THE OLD VERSION EARNED ITS KEEP ON THE WAY OUT.
   *
   * It asserted that at least SEVEN Next apps existed under `apps/` and that each
   * one mounted `app/auth/error/page.tsx`, because there were seven deployed
   * applications and `pages.error` is set once for all of them. That is now one
   * artifact with one such route, so the count assertion had to go.
   *
   * ⚠️ WHAT MUST NOT GO IS THE PROPERTY. During the consolidation all seven
   * copies moved with their packs to `/<pack>/auth/error`, while
   * `workspace-auth.ts` still pointed `pages.error` at the ARTIFACT path
   * `/auth/error` — seven mounted routes covering a path nothing referenced, and
   * the referenced path missing. A failed sign-in would have hit a bare 404
   * instead of the "Keycloak is starting up" screen, at exactly the moment people
   * meet it: Keycloak is 126–137s from cold here.
   *
   * So this no longer counts apps. It READS the configured path out of
   * `workspace-auth.ts` and requires a route file to exist for whatever it says.
   * Change the config and this test follows it; move the route and this fails.
   * The previous version could only have caught a route that moved, not a config
   * that did — and it is the pair that has to agree.
   */
  const config = readFileSync(join(__dirname, 'workspace-auth.ts'), 'utf8');
  const configured = /pages:\s*\{\s*error:\s*'([^']+)'/.exec(config)?.[1];

  it('pages.error declares a path at all', () => {
    expect(
      configured,
      'no `pages: { error: ... }` found in workspace-auth.ts — either it was ' +
        'removed (Auth.js then renders its own error page) or its shape changed ' +
        'and this test can no longer see it',
    ).toBeTruthy();
  });

  it('a route file exists for the path Auth.js redirects to', () => {
    const page = join(appsDir, 'web', 'app', ...configured!.split('/').filter(Boolean), 'page.tsx');
    expect(
      existsSync(page),
      `apps/web has no route for ${configured} (looked for ${page}) — a failed ` +
        'sign-in 404s, which is the worst possible moment to lose an explanation',
    ).toBe(true);
  });

  it('the packs do NOT each carry their own copy', () => {
    // Seven copies at /<pack>/auth/error is precisely the state that made the
    // real route missing look harmless: plenty of files, none of them reachable.
    const packsWithOwnCopy = readdirSync(join(appsDir, 'web', 'app'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('('))
      .filter((e) => existsSync(join(appsDir, 'web', 'app', e.name, 'auth/error/page.tsx')));

    expect(
      packsWithOwnCopy.map((e) => e.name),
      'a pack carries its own auth/error — Auth.js will never redirect there',
    ).toEqual([]);
  });
});
