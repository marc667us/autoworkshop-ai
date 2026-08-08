import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * SIGNING OUT MUST FORGET WHICH ROLE YOU WERE ACTING AS.
 *
 * ── 🔴 THE DEFECT ─────────────────────────────────────────────────────────
 *
 * Owner, 2026-08-07: signed in as a customer from the landing page, signed out,
 * signed back in as admin — "the dash board still and menu items still showed
 * that a customer".
 *
 * `performSignOut` revoked the refresh token, called Auth.js `signOut()` and
 * ended the Keycloak SSO session. `signOut()` clears **Auth.js's own session
 * cookie and nothing else**, so `aw.activeRole` and `aw.activeOrganization` —
 * written by the role and organisation switchers — survived every sign-out this
 * product has ever performed. The next sign-in on that browser inherited them.
 *
 * ── ⚠️ WHY THE TEST IS AT THIS LEVEL ──────────────────────────────────────
 *
 * The failure was NOT in any single app; it was in the one shared sequence all
 * seven apps delegate to. Testing it in an app would prove one app and leave
 * six, and this repository has a standing lesson about a rule enforced in one
 * place and nowhere else.
 *
 * ⚠️ It asserts the cookie is DELETED, not that a function was called with
 * plausible arguments — "config reads correct while the mechanism is inert" is
 * this repository's most-repeated defect, recorded five times.
 */

interface DeleteArg {
  name: string;
  path?: string;
}
const deletedCalls: DeleteArg[] = [];
const deleted: string[] = [];
const store = {
  delete: (arg: DeleteArg) => {
    deletedCalls.push(arg);
    deleted.push(arg.name);
  },
};

vi.mock('next/headers', () => ({
  cookies: async () => store,
}));

beforeEach(() => {
  deleted.length = 0;
  deletedCalls.length = 0;
});

describe('clearWorkspacePreferences', () => {
  it('deletes EVERY switcher cookie, named from the shared list', async () => {
    const { clearWorkspacePreferences, WORKSPACE_PREFERENCE_COOKIES } = await import(
      './workspace-preferences'
    );

    await clearWorkspacePreferences();

    // Compared against the exported list rather than a second literal, so
    // adding a switcher and forgetting the cookie fails HERE rather than
    // presenting months later as "the menu is wrong after signing in".
    expect(deleted).toEqual([...WORKSPACE_PREFERENCE_COOKIES]);
  });

  it('clears the two cookies that caused the reported fault', async () => {
    const { clearWorkspacePreferences } = await import('./workspace-preferences');

    await clearWorkspacePreferences();

    // Named explicitly as well: the list-equality above would still pass if the
    // list itself were emptied, which is precisely the regression that would
    // reintroduce the bug while every test stayed green.
    expect(deleted).toContain('aw.activeRole');
    expect(deleted).toContain('aw.activeOrganization');
  });

  it("deletes with path '/', matching how the switchers SET them", async () => {
    const { clearWorkspacePreferences } = await import('./workspace-preferences');
    await clearWorkspacePreferences();

    // 🔴 A cookie is identified by (name, domain, path). Both switchers write
    // these with an explicit `path: '/'`, and a delete on a different path
    // expires a cookie that does not exist — leaving the original in place and
    // this entire fix inert while the suite stayed green. Asserted, not assumed.
    expect(deletedCalls.length).toBeGreaterThan(0);
    for (const call of deletedCalls) {
      expect(call.path).toBe('/');
    }
  });

  it('🔴 is actually CALLED by performSignOut, before the redirect', async () => {
    // A helper that clears cookies perfectly and is invoked by nobody is this
    // repository's most-recorded defect — a complete feature with no reachable
    // caller, five instances. The three tests above would all pass with the
    // call site deleted, so the wiring is asserted separately.
    //
    // Read as SOURCE rather than executed: `performSignOut` ends in
    // `redirect()`, which throws NEXT_REDIRECT, and driving it would mean
    // mocking Auth.js, Keycloak and Next's navigation to observe one line.
    // The ORDER is the part that matters and it is visible in the text.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./sign-out.ts', import.meta.url), 'utf8');

    expect(source).toContain('clearWorkspacePreferences()');

    // 🔴 BEFORE `redirect(...)`, or it never runs at all. `redirect()` throws,
    // so a call sequenced after it is dead code that looks correct.
    const cleared = source.indexOf('await clearWorkspacePreferences()');
    const redirected = source.indexOf('redirect(keycloakSignOutUrl)');
    expect(cleared).toBeGreaterThan(-1);
    expect(redirected).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(redirected);
  });

  it('FAILS SOFT — a broken cookie store must not strand a live session', async () => {
    const { clearWorkspacePreferences } = await import('./workspace-preferences');
    const boom = vi.spyOn(store, 'delete').mockImplementation(() => {
      throw new Error('cookie store unavailable');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // 🔴 MUST NOT THROW. This runs midway through sign-out, AFTER the refresh
    // token has been revoked and BEFORE the redirect to Keycloak's end-session
    // endpoint. Throwing here would abandon the sequence at its most dangerous
    // point — local session gone, SSO session still alive — to protect a
    // preference. A wrong menu is worth less than a terminated session.
    await expect(clearWorkspacePreferences()).resolves.toBeUndefined();
    // …and it is not silent, because a preference that outlived its session is
    // the exact thing that made this bug invisible for weeks.
    expect(warn).toHaveBeenCalled();

    boom.mockRestore();
    warn.mockRestore();
  });
});
