import { test, expect, type Page } from '@playwright/test';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
  workspaces,
} from '@autoworkshop/navigation';
// ⚠️ IMPORTED FROM THE MODULE, NOT FROM THE PACKAGE BARREL — AND IT MATTERS.
//
// `grantsFor`/`navRoleFor` live in `viewer-contract`, which `next-shell/index.ts`
// describes as "the PURE half of the viewer contract, re-exported so consumers
// that cannot run in a Next server runtime — the Playwright journey, Storybook,
// unit tests — can reason about a viewer without importing `./viewer`".
//
// That intent is correct and re-exporting through the barrel does not achieve
// it: importing `@autoworkshop/next-shell` EVALUATES index.ts, which pulls
// `ModulePage` -> `viewer` -> `@autoworkshop/auth` -> `next-auth`, and next-auth
// cannot resolve `next/server` outside a Next runtime under pnpm's store layout.
//
// The result was not a visible failure. The whole suite died at COLLECTION and
// Playwright still exited 0, so `pnpm e2e` reported success while running ZERO
// tests — undetected from 2026-07-27 (`0b678b5`, T-0005) to 2026-07-29 because
// nothing re-ran it. A green gate that executes nothing is worse than a red one.
import {
  grantsFor,
  navRoleFor,
  type ViewerDescription,
} from '@autoworkshop/next-shell/src/viewer-contract';
import { workspaces as servers } from '../playwright.config';

/**
 * The shell journey (T-0015).
 *
 * EVERY assertion below pins a defect that shipped on 2026-07-26 and survived a
 * green `typecheck`, `lint`, the full unit suite and a nine-target production
 * build. None of them were caught by a gate; all were found by reading the code
 * or curl-ing the running app. So these are not smoke tests — they are the
 * regression net for a specific, evidenced set of failures.
 *
 * Where possible each test asserts the PROPERTY that was violated rather than
 * the symptom that was observed. Pinning the symptom ("/finance-and-warranty/
 * invoices must not 404") passes forever while the same class of bug reappears
 * two routes over.
 */

const WORKSHOP = servers.find((w) => w.name === 'workshop')!;
const base = (port: number) => `http://127.0.0.1:${port}`;

/**
 * THE IDENTITY THIS SUITE'S BROWSER ACTUALLY HAS: none.
 *
 * Since T-0005 the viewer comes from a Keycloak session, and Playwright starts
 * with a clean context and never signs in — so the apps render their signed-out
 * state: no grants, no role, the workspace's own default navigation.
 *
 * DECLARING IT AS A CONSTANT rather than calling `viewerGrants()` is what keeps
 * the suite honest. `viewerGrants()` is now an async server function that reads
 * `next/headers`; it cannot run in a Playwright process at all, and the tempting
 * repair — hardcoding the expected hrefs — would stop the test checking the
 * model and start it checking a copy of the model. `grantsFor`/`navRoleFor` are
 * the same pure functions the apps use, applied to the same identity the browser
 * has, so the expectations are still DERIVED.
 *
 * ⚠️ This means the suite currently exercises the SIGNED-OUT shell only. The
 * §46-§49 role trees are covered by `packages/next-shell/src/viewer.test.ts`
 * against fixture viewers, but no browser test drives a signed-in journey yet —
 * that needs a running Keycloak and API, and is tracked as its own task.
 */
const SUITE_VIEWER: ViewerDescription | null = null;

/**
 * The workspace as the running app resolves it — role tree included (T-0027).
 *
 * This MUST compose `workspaceForRole` + `navRoleFor` exactly as the app's
 * layout and `renderModulePage` do. Reading the raw workspace here would test a
 * tree the app never renders.
 */
function resolvedWorkspace(workspaceId: string) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`);
  return workspaceForRole(workspace, navRoleFor(SUITE_VIEWER?.activeRole));
}

/** Every href the side nav advertises to this viewer, per workspace. */
function advertisedHrefs(workspaceId: string): string[] {
  return visibleGroups(resolvedWorkspace(workspaceId), grantsFor(SUITE_VIEWER)).flatMap((g) =>
    g.items.map((i) => i.href),
  );
}

/**
 * A module that EXISTS in the workspace tree but is gated behind a permission
 * this viewer does not hold. Derived, never hardcoded: hardcoding a route makes
 * the test stop testing the moment that route's permission changes.
 *
 * Returns the required permission alongside the href, because the disclosure
 * assertion below needs to name the exact secret it is checking for.
 */
/** The LABEL of the module `gatedModule` picked — what a leak would print. */
function gatedModuleLabel(workspaceId: string): string | undefined {
  const workspace = resolvedWorkspace(workspaceId);
  const visible = new Set(advertisedHrefs(workspaceId));
  for (const group of workspace.groups) {
    for (const item of group.items) {
      if (!visible.has(item.href)) return item.label;
    }
  }
  return undefined;
}

/**
 * Does this workspace hide EVERY module from the current viewer?
 *
 * True for admin when signed out: §32 gates the whole tree on `platform.admin`,
 * so "advertises nothing" is the correct answer there rather than a regression.
 */
function everyModuleGated(workspaceId: string): boolean {
  return advertisedHrefs(workspaceId).length === 0;
}

function gatedModule(workspaceId: string): { href: string; permission?: string } | undefined {
  const workspace = resolvedWorkspace(workspaceId);
  const visible = new Set(advertisedHrefs(workspaceId));
  for (const group of workspace.groups) {
    for (const item of group.items) {
      if (!visible.has(item.href)) {
        return { href: item.href, permission: item.permission ?? group.permission };
      }
    }
  }
  return undefined;
}

async function gotoShell(page: Page, port: number, path = '/') {
  const res = await page.goto(base(port) + path, { waitUntil: 'domcontentloaded' });
  return res;
}

/**
 * Block until React has actually hydrated the document.
 *
 * ANY responsive assertion about this shell needs this, because the structural
 * mobile/desktop switch is decided by `useIsMobile()`, which is a hook: the
 * server always renders the desktop tree, and the overlay drawer only replaces
 * the inline column once effects have run. Measure before that and you measure
 * the server's tree, which is a layout no user keeps for longer than a frame.
 *
 * WHY NOT `waitForTimeout`. Because a fixed sleep is a race with the machine,
 * not with the app. On a loaded box — seven Next servers plus a nine-target
 * build, which is exactly the state this repo was in on 2026-07-26 — 400ms is
 * not reliably enough, and the test then reports a responsive defect that does
 * not exist. That is not hypothetical: it is how T-0030 was born, and the same
 * class of sleep-race had already produced a false focus-trap failure in the
 * same suite. Wait for the CONDITION, never for a duration.
 *
 * React attaches `__reactFiber$…`/`__reactProps$…` expando keys to the DOM
 * nodes it owns, and only once the client render has run. Their presence on
 * <body> is therefore a direct, positive signal that hydration happened, as
 * opposed to `readyState === 'complete'`, which only says the network went
 * quiet and is equally true of a page whose JavaScript 404'd.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => document.readyState === 'complete', undefined, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    () => Object.keys(document.body).some((k) => k.startsWith('__react')),
    undefined,
    { timeout: 15_000 },
  );
}

test.describe('permission gating — defect 1: the catch-all ignored permissions', () => {
  /**
   * The catch-all resolved against `workspace.groups` instead of the
   * grant-filtered tree, so any gated module rendered by URL — and the
   * placeholder printed the required permission NAME, publishing the
   * authorization taxonomy to anyone who guessed a path.
   */
  for (const server of servers) {
    test(`${server.name}: a gated URL 404s when typed directly`, async ({ page }) => {
      const gated = gatedModule(server.name);
      test.skip(!gated, `no permission-gated module in the ${server.name} tree for this viewer`);

      const res = await gotoShell(page, server.port, gated!.href);

      /*
       * 404 **or** a workspace-level denial that does not name the module.
       *
       * WIDENED 2026-07-29, with evidence — this is not a test being relaxed to
       * go green. The invariant being defended is "a viewer without the grant
       * must not learn this module exists", and 404 was only ever ONE way to
       * satisfy it.
       *
       * The 2026-07-28 finding-4 work added a LAYOUT gate in front of each
       * workspace. For a workspace whose entire tree is gated — admin, §32
       * "visible only to authorized administrative, security and operational
       * users" — a signed-out viewer is stopped by that layout before the
       * catch-all can call `notFound()`, so the response is 200.
       *
       * Measured on admin-web before changing this line:
       *   /home/operations-dashboard -> 200
       *   /home/total-nonsense-xyz   -> 200   <- identical, so no oracle
       *   /directory/users           -> 200
       * and the body of the first contained "Not signed in" and the workspace
       * label "Platform Admin", but NOT "Operations Dashboard".
       *
       * A real regression of the original defect — the catch-all rendering a
       * gated module's placeholder — still fails here, because that placeholder
       * puts `item.label` in the page title. That assertion is below.
       */
      const status = res?.status() ?? 0;
      expect(
        status === 404 || status === 200,
        `${gated!.href} returned ${status}; expected 404, or 200 from the workspace gate`,
      ).toBe(true);

      if (status === 200) {
        // The module must not be NAMED. This is the actual enumeration control,
        // and it is what the original defect violated.
        const label = gatedModuleLabel(server.name);
        if (label) {
          const body = (await page.textContent('body')) ?? '';
          expect(
            body.includes(label),
            `the gate rendered but NAMED the gated module "${label}" — enumeration hole`,
          ).toBe(false);
        }
      }

      // And it must not name the permission IT wanted. Telling a visitor which
      // grant to obtain is the enumeration hole itself.
      //
      // This asserts the absence of that specific permission, not of anything
      // permission-SHAPED. The broader regex it replaced (`/\b(platform|
      // organization|finance)\.[a-z]+\b/`) also matched the viewer's own grants,
      // which Next serialises into the RSC flight payload inside <script> tags
      // in <body> — and `textContent('body')` reads script text. So it failed on
      // `"grants":["organization.admin"]`: the viewer's own grants, which the
      // viewer already holds and which `viewerGrants()` documents as
      // client-visible and not a security control. That is a different fact from
      // the required permission, and conflating them makes the test unfixable
      // without either weakening it or restructuring how a client component
      // receives its props.
      const body = (await page.textContent('body')) ?? '';
      if (gated!.permission) {
        expect(
          body,
          `the 404 for ${gated!.href} disclosed the permission that gates it ` +
            `(${gated!.permission}), which tells a visitor exactly which grant to acquire`,
        ).not.toContain(gated!.permission);
      }
    });
  }

  test('an href that is in no workspace tree 404s', async ({ page }) => {
    const res = await gotoShell(page, WORKSHOP.port, '/definitely/not/a/module');
    expect(res?.status()).toBe(404);
  });

  /**
   * The tests above `test.skip` themselves when a workspace has no gated module
   * for this viewer. That skip is legitimate per workspace — a platform admin
   * really does see everything — but it is NOT legitimate for every workspace at
   * once, because then the fail-closed property is never exercised anywhere and
   * the suite is green over zero assertions.
   *
   * That is not hypothetical. It was the actual state until 2026-07-27: the demo
   * viewer held both of the only two permission keys the nav model gates on, so
   * all seven skipped and the defect-1 regression test had never once run.
   *
   * `a11y-storybook` already guards its equivalent hole (it refuses to pass over
   * an empty story index). This is the same guard for this suite.
   */
  test('at least one workspace must exercise permission gating', () => {
    const exercised = servers.map((s) => s.name).filter((name) => gatedModule(name));
    expect(
      exercised,
      'No workspace has a permission-gated module for this suite’s viewer, so every ' +
        '"a gated URL 404s" test above skipped and the fail-closed behaviour of the ' +
        'catch-all route is completely untested. That is how this assertion silently ' +
        'skipped in all 7 workspaces while the suite reported green. If SUITE_VIEWER ' +
        'is ever given a signed-in identity, make sure it withholds at least one grant.',
    ).not.toEqual([]);
  });
});

test.describe('nav and router agree — defect 3: two literals in two files', () => {
  /**
   * The 7 `layout.tsx` files passed a hardcoded grants array while the
   * catch-all passed none, so the nav advertised `/finance-and-warranty/
   * invoices` and that URL 404'd. `viewer.test.ts` asserts this at unit level;
   * this asserts it in a real browser against the real router, which is where
   * the disagreement actually surfaced.
   */
  for (const server of servers) {
    test(`${server.name}: every advertised module resolves`, async ({ page }) => {
      const hrefs = advertisedHrefs(server.name);

      /*
       * A WHOLLY GATED workspace correctly advertises nothing to this viewer.
       *
       * The suite signs in as nobody (`SUITE_VIEWER = null`), and admin's entire
       * tree is gated on `platform.admin` (§32). So "advertises no modules" is
       * the right answer for admin, not a broken nav — and the blanket
       * `toBeGreaterThan(0)` failed on it the moment the suite was able to run
       * again. Skipped on that precise, derived condition rather than by naming
       * admin, so a workspace that empties out for any OTHER reason still fails.
       */
      test.skip(
        hrefs.length === 0 && everyModuleGated(server.name),
        `${server.name}: every module is permission-gated and this viewer is signed out`,
      );
      expect(hrefs.length, `${server.name} advertises no modules at all`).toBeGreaterThan(0);

      const broken: string[] = [];
      for (const href of hrefs) {
        const res = await page.goto(base(server.port) + href, { waitUntil: 'commit' });
        if (res && res.status() >= 400) broken.push(`${href} -> ${res.status()}`);
      }
      expect(broken, `the nav advertises modules that do not resolve:\n${broken.join('\n')}`)
        .toEqual([]);
    });
  }

  test('workshop: links rendered in the DOM match what the model advertises', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    const domHrefs = await page.locator('nav a[href^="/"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!),
    );
    const model = new Set(advertisedHrefs('workshop'));
    // Every nav link in the DOM must be one the model knows about. A link the
    // model has never heard of cannot have been permission-checked.
    /*
     * `/api/auth/*` is excluded for the same reason `/` is: it is a SHELL
     * affordance, not a navigable module, so the permission-filtered nav model
     * has never heard of it and never should.
     *
     * T-0005 (2026-07-27) put a "Sign in" link inside `<nav>` for signed-out
     * viewers. This test predates authentication existing, so it counted that
     * link as a stray and failed — the only thing it proved was that the suite
     * had not been run since auth landed.
     *
     * Deliberately narrow: only the auth routes Next itself owns. Any other
     * unexpected link is still a failure, which is the point of the assertion.
     */
    const strays = domHrefs.filter(
      (h) => h !== '/' && !h.startsWith('/api/auth/') && !model.has(h),
    );
    expect(strays, `nav rendered links absent from the permission-filtered model: ${strays}`)
      .toEqual([]);
  });
});

test.describe('nothing focusable is inert — defect 2', () => {
  /**
   * Create / Tasks / Messages / Notifications / Help rendered as live buttons
   * with count badges and no handler, while the TopNav docstring claimed "none
   * of them silently no-op without saying so".
   */
  test('an unavailable action is disabled AND says so in its accessible name', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    const header = page.locator('header').first();
    const buttons = header.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      const disabled = await b.isDisabled();
      const name = ((await b.getAttribute('aria-label')) ?? (await b.textContent()) ?? '').trim();

      expect(name, `header button ${i} has no accessible name`).not.toBe('');

      if (disabled) {
        expect(
          name.toLowerCase(),
          `disabled control "${name}" must explain that it is unavailable`,
        ).toContain('not available yet');
      } else {
        // An enabled control must not be one of the known-unbuilt panels.
        expect(name.toLowerCase()).not.toContain('not available yet');
      }
    }
  });

  test('indicators without a switcher are text, not buttons', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    const header = page.locator('header').first();
    // The workspace / org / branch / user indicators are deliberately plain
    // text until T-0016 builds their switchers. A button that does nothing is
    // a worse affordance than a label.
    const orgButton = header.getByRole('button', { name: /Accra Auto Services/i });
    await expect(orgButton).toHaveCount(0);
  });
});

test.describe('theme control — defect 4: radiogroup without the keyboard contract', () => {
  /**
   * `ThemeToggle` declared `role="radiogroup"` over three `role="radio"`
   * buttons with no roving tabindex and no arrow keys — three tab stops where
   * the pattern promises one.
   */
  test('the radiogroup is ONE tab stop', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    const group = page.getByRole('radiogroup').first();
    await expect(group).toBeVisible();

    const radios = group.getByRole('radio');
    const total = await radios.count();
    expect(total).toBe(3);

    // Exactly one radio may be in the tab order at a time.
    const tabbable = await radios.evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).tabIndex >= 0).length,
    );
    expect(tabbable, 'a roving tabindex means exactly one radio is tabbable').toBe(1);
  });

  test('arrow keys move the selection', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    const group = page.getByRole('radiogroup').first();
    const radios = group.getByRole('radio');

    const checkedIndex = async () =>
      radios.evaluateAll((els) =>
        els.findIndex((e) => e.getAttribute('aria-checked') === 'true'),
      );

    const before = await checkedIndex();
    await radios.nth(before).focus();
    await page.keyboard.press('ArrowRight');
    const after = await checkedIndex();

    expect(after, 'ArrowRight must move the selection within the radiogroup').not.toBe(before);

    await page.keyboard.press('Home');
    expect(await checkedIndex(), 'Home must select the first option').toBe(0);
    await page.keyboard.press('End');
    expect(await checkedIndex(), 'End must select the last option').toBe(2);
  });
});

test.describe('responsive — defect 7: the top bar overflowed at 360px', () => {
  /**
   * Only the selector cluster was responsive; brand + search + 6 actions +
   * 3-button theme control + user chip stayed in one non-wrapping header —
   * roughly 30rem of content in a 22.5rem viewport.
   */
  for (const width of [360, 480, 768, 1024]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(base(WORKSHOP.port), { waitUntil: 'networkidle' });
      // The responsive layout is decided by `useIsMobile()`, which resolves
      // AFTER hydration — the server render is the desktop layout. Measuring
      // before hydration measures the wrong tree and reports an overflow that a
      // user would only ever see as a brief flash.
      await waitForHydration(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // 1px of tolerance for sub-pixel rounding; anything more is a real
      // horizontal scrollbar on the page body.
      expect(
        overflow.scrollWidth - overflow.clientWidth,
        `page scrolls horizontally at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test('below 768px the side nav is an overlay, not an inline column', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoShell(page, WORKSHOP.port);
    // Same reason as the overflow tests above: without this the assertion runs
    // against the server-rendered desktop tree and fails on a correct app. This
    // test previously omitted it, which is why it was still red after the real
    // cause of T-0030 (a stale server) had already been fixed.
    await waitForHydration(page);

    // The nav must not be occupying layout width next to the content.
    const main = page.locator('main').first();
    const box = await main.boundingBox();
    expect(box, 'main content must be present').not.toBeNull();
    expect(box!.width, 'main should span the viewport when the nav is an overlay')
      .toBeGreaterThan(300);
  });
});

test.describe('keyboard access', () => {
  test('a skip link is the first tab stop and reaches the main content', async ({ page }) => {
    await gotoShell(page, WORKSHOP.port);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { text: el?.textContent?.trim() ?? '', href: el?.getAttribute('href') ?? '' };
    });
    expect(focused.text.toLowerCase()).toContain('skip');
    expect(focused.href).toContain('#');
  });
});

test.describe('sanity', () => {
  test('the workspace model and the running servers agree', () => {
    // If a workspace is added to the model without a server here, its tests
    // would silently not run at all.
    expect(servers.map((s) => s.name).sort()).toEqual(Object.keys(workspaces).sort());
  });
});
