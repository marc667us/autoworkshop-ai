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
   * A "web app" here means a Next app with an `app/` directory. That excludes
   * `api` (NestJS), `mobile` (Expo), `e2e` (Playwright) and `storybook`, none of
   * which serve `/api/auth/*` and none of which can receive this redirect.
   */
  const webApps = readdirSync(appsDir).filter((name) => {
    const appRouter = join(appsDir, name, 'app');
    return existsSync(appRouter) && statSync(appRouter).isDirectory();
  });

  it('found the web apps to check', () => {
    // Guards the discovery itself. Without this, a wrong path would produce an
    // EMPTY list and every assertion below would pass while proving nothing.
    expect(webApps.length, 'no Next apps found under apps/').toBeGreaterThanOrEqual(7);
    expect(webApps).toContain('workshop-web');
    expect(webApps).toContain('customer-web');
  });

  it.each(webApps)('%s mounts /auth/error', (app) => {
    const page = join(appsDir, app, 'app/auth/error/page.tsx');
    expect(
      existsSync(page),
      `${app} has no app/auth/error/page.tsx — a failed sign-in there 404s, because ` +
        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
    ).toBe(true);
  });

  it('still has pages.error pointing where these routes are', () => {
    // The other direction: if somebody removes or renames the override, these
    // seven pages become dead code and this suite would happily keep passing.
    // `readFileSync` imported at the top, not `require()`d inline: the lint
    // rule forbidding require() is not cosmetic here — it is what kept CI red
    // for this file, and CI red is what nobody reads.
    const config = readdirSync(__dirname).includes('workspace-auth.ts')
      ? readFileSync(join(__dirname, 'workspace-auth.ts'), 'utf8')
      : '';
    expect(config).toContain("pages: { error: '/auth/error' }");
  });
});
