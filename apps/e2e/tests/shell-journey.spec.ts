import { test, expect, type Page } from '@playwright/test';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
  workspaces,
} from '@autoworkshop/navigation';
import { viewerGrants, viewerRole } from '@autoworkshop/next-shell';
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
 * The workspace as the running app resolves it — role tree included (T-0027).
 *
 * This MUST compose `workspaceForRole` + `viewerRole` exactly as
 * `WorkspaceShell` and `renderModulePage` do. Reading the raw workspace here
 * would test a tree the app never renders: every assertion would be about
 * `01 (1).txt` §34 while the browser showed `07.txt` pt2 §49.
 */
function resolvedWorkspace(workspaceId: string) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`);
  return workspaceForRole(workspace, viewerRole(workspaceId));
}

/** Every href the side nav advertises to this viewer, per workspace. */
function advertisedHrefs(workspaceId: string): string[] {
  return visibleGroups(resolvedWorkspace(workspaceId), viewerGrants(workspaceId)).flatMap((g) =>
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
      expect(res?.status(), `${gated!.href} must not render for a viewer without the grant`).toBe(404);

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
      'No workspace has a permission-gated module for the demo viewer, so every ' +
        '"a gated URL 404s" test above skipped and the fail-closed behaviour of the ' +
        'catch-all route is completely untested. Withhold a grant in ' +
        'packages/next-shell/src/viewer.ts so gating is actually exercised.',
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
    const strays = domHrefs.filter((h) => h !== '/' && !model.has(h));
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
