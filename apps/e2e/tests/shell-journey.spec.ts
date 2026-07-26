import { test, expect, type Page } from '@playwright/test';
import { getWorkspace, visibleGroups, workspaces } from '@autoworkshop/navigation';
import { viewerGrants } from '@autoworkshop/next-shell';
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

/** Every href the side nav advertises to this viewer, per workspace. */
function advertisedHrefs(workspaceId: string): string[] {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`);
  return visibleGroups(workspace, viewerGrants(workspaceId)).flatMap((g) =>
    g.items.map((i) => i.href),
  );
}

/**
 * An href that EXISTS in the workspace tree but is gated behind a permission
 * this viewer does not hold. Derived, never hardcoded: hardcoding a route makes
 * the test stop testing the moment that route's permission changes.
 */
function gatedHref(workspaceId: string): string | undefined {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return undefined;
  const visible = new Set(advertisedHrefs(workspaceId));
  for (const group of workspace.groups) {
    for (const item of group.items) {
      if (!visible.has(item.href)) return item.href;
    }
  }
  return undefined;
}

async function gotoShell(page: Page, port: number, path = '/') {
  const res = await page.goto(base(port) + path, { waitUntil: 'domcontentloaded' });
  return res;
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
      const href = gatedHref(server.name);
      test.skip(!href, `no permission-gated module in the ${server.name} tree for this viewer`);

      const res = await gotoShell(page, server.port, href!);
      expect(res?.status(), `${href} must not render for a viewer without the grant`).toBe(404);

      // And it must not name the permission it wanted. Telling an anonymous
      // visitor which grant to obtain is the enumeration hole itself.
      const body = (await page.textContent('body')) ?? '';
      expect(body).not.toMatch(/\b(platform|organization|finance)\.[a-z]+\b/);
    });
  }

  test('an href that is in no workspace tree 404s', async ({ page }) => {
    const res = await gotoShell(page, WORKSHOP.port, '/definitely/not/a/module');
    expect(res?.status()).toBe(404);
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
      await gotoShell(page, WORKSHOP.port);
      await page.waitForTimeout(150); // let layout settle

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
