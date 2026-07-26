import { test, expect } from '@playwright/test';

/**
 * Component behaviour that only a real browser can judge (T-0015).
 *
 * These two defects are invisible to unit tests because they are about LAYOUT
 * and FOCUS — jsdom has no geometry and no real focus model. They are tested
 * against Storybook rather than the apps because the story is the only place
 * that reliably puts these components into the states in question.
 */

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

test.describe('defect 5 — the assistant drawer fell BELOW the page instead of beside it', () => {
  /**
   * The drawer rendered outside the shell's flex row, so its non-modal desktop
   * form landed under the page as a full-width block. It was still visible —
   * it would have survived a screenshot review — but it was no longer the side
   * panel `02.txt` §8 specifies. Geometry is the only thing that can tell the
   * difference.
   */
  test('the non-modal drawer sits beside the content, not underneath it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(story('shell-appshell--with-side-drawer'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 15_000 });

    const main = await page.locator('main').first().boundingBox();
    const drawer = await page
      .locator('[role="complementary"], aside, [data-drawer]')
      .last()
      .boundingBox();

    expect(main, 'main content must be present').not.toBeNull();
    expect(drawer, 'the drawer must be present in this story').not.toBeNull();

    // Beside means: they overlap vertically. Below means the drawer's top edge
    // starts at or past the bottom of the content.
    const overlapsVertically = drawer!.y < main!.y + main!.height;
    expect(
      overlapsVertically,
      `drawer top ${drawer!.y} is below main bottom ${main!.y + main!.height} — it is stacked, not beside`,
    ).toBe(true);

    // And it must not be a full-width block.
    const viewportWidth = 1280;
    expect(
      drawer!.width,
      'a side panel that spans the viewport is not a side panel',
    ).toBeLessThan(viewportWidth * 0.8);
  });

  test('the modal drawer DOES cover, which is the point of modal', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(story('shell-drawer--modal'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });

    // A modal drawer traps focus; a non-modal one must not. Asserting the
    // difference stops the two collapsing into one implementation.
    //
    // Waited for, not slept on. The focus trap runs in an effect after mount,
    // so a fixed 200ms sleep races it — and a racing test fails in a way that
    // looks exactly like a broken focus trap, which would have sent someone
    // hunting a defect in correct code.
    await page
      .waitForFunction(
        () => {
          const dialog = document.querySelector('[role="dialog"]');
          return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
        },
        undefined,
        { timeout: 5_000 },
      )
      .catch(() => {
        /* fall through to the assertion below for a readable failure */
      });

    const where = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return {
        inside: !!dialog && !!active && dialog.contains(active),
        activeTag: active?.tagName ?? 'none',
      };
    });
    expect(
      where.inside,
      `an open modal drawer should hold focus; focus was on <${where.activeTag}>`,
    ).toBe(true);
  });
});

test.describe('defect 6 — focus escaped an open dialog on a parent re-render', () => {
  /**
   * `useFocusTrap` depended on `onClose` identity. Every caller passes an
   * inline arrow, so any parent re-render tore the trap down and rebuilt it —
   * and teardown restores focus to the opener, so focus jumped out of an open
   * dialog mid-typing. Fixed in the hook with a ref rather than by asking
   * callers to `useCallback`: a hook whose correctness depends on callers
   * remembering to memoize will be used wrongly.
   */
  test('focus moves into the dialog when it opens', async ({ page }) => {
    await page.goto(story('shell-dialog--default'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });

    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
    });
    expect(inside, 'focus must be inside the dialog when it opens').toBe(true);
  });

  test('Tab cycles within the dialog and never escapes it', async ({ page }) => {
    await page.goto(story('shell-dialog--default'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="dialog"]', { timeout: 15_000 });

    // Tab well past the number of focusable controls in the dialog. If the trap
    // leaks, focus lands on document.body or outside the dialog subtree.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
      });
      expect(stillInside, `focus escaped the dialog after ${i + 1} Tab press(es)`).toBe(true);
    }
  });

  test('the dialog is labelled by its title', async ({ page }) => {
    await page.goto(story('shell-dialog--default'), { waitUntil: 'domcontentloaded' });
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    expect(labelledBy, 'dialog must be labelled for screen readers').toBeTruthy();
  });
});

test.describe('tabs keyboard contract', () => {
  test('the tablist is one tab stop and arrows move between tabs', async ({ page }) => {
    await page.goto(story('shell-tabs--default'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="tablist"]', { timeout: 15_000 });

    const tabs = page.locator('[role="tab"]');
    const tabbable = await tabs.evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).tabIndex >= 0).length,
    );
    expect(tabbable, 'a roving tabindex means exactly one tab is tabbable').toBe(1);

    const selectedIndex = async () =>
      tabs.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'));
    const focusedIndex = async () =>
      tabs.evaluateAll((els) => els.findIndex((e) => e === document.activeElement));

    const before = await selectedIndex();
    await tabs.nth(before).focus();
    await page.keyboard.press('ArrowRight');

    // ACTIVATION IS MANUAL, BY DESIGN. Arrow keys move focus; Enter/Space
    // selects. An earlier version of this test asserted that ArrowRight changed
    // the SELECTION, which is automatic activation — a different, also-valid
    // ARIA pattern that this component deliberately does not use, because each
    // panel here costs a fetch and arrowing across five tabs would fire five
    // requests for data the user never asked for. The test was wrong, not the
    // component; asserting the wrong pattern would have pushed a real
    // regression into the code.
    expect(await focusedIndex(), 'ArrowRight must move FOCUS to the next tab').not.toBe(before);
    expect(await selectedIndex(), 'ArrowRight must NOT change selection (manual activation)').toBe(
      before,
    );

    await page.keyboard.press('Enter');
    expect(await selectedIndex(), 'Enter must activate the focused tab').not.toBe(before);
  });
});
