import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workspaces as servers } from '../playwright.config';

/**
 * axe-core against each of the seven workspaces' shell (T-0015).
 *
 * Storybook covers components in isolation; this covers them ASSEMBLED, which
 * is where a different class of violation lives — duplicate landmarks, heading
 * order across composed regions, a nav and a main that both claim the same
 * role, contrast that only fails once real theme variables are applied.
 *
 * All seven, not a representative sample: the shell is shared, but each
 * workspace feeds it a different navigation tree, and it is the tree that
 * generates most of the markup.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 360, height: 800 },
] as const;

for (const server of servers) {
  for (const vp of VIEWPORTS) {
    test(`${server.name} shell has no axe violations (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main', { timeout: 15_000 });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
      }));

      expect(
        violations,
        `axe violations in the ${server.name} shell at ${vp.name}:\n` +
          JSON.stringify(violations, null, 2),
      ).toEqual([]);
    });
  }
}

test.describe('landmark structure', () => {
  for (const server of servers) {
    test(`${server.name}: exactly one main landmark`, async ({ page }) => {
      await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'domcontentloaded' });
      // Two <main> elements is invalid and confuses the skip link, but it does
      // not always surface as an axe violation.
      await expect(page.locator('main')).toHaveCount(1);
    });
  }
});
