import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * axe-core over EVERY story (T-0015, `01 (1).txt` §71).
 *
 * Storybook already has `@storybook/addon-a11y`, but that only reports in the
 * browser to whoever happens to be looking at that story. This turns the same
 * engine into a gate: every story, every run, failing the build.
 *
 * Stories are enumerated from the built `index.json` rather than hardcoded, so
 * a new story is covered the moment it exists. A test list that has to be
 * updated by hand is a test list that silently stops covering things.
 */

interface StorybookIndex {
  entries: Record<string, { id: string; title: string; name: string; type: string }>;
}

const indexPath = resolve(__dirname, '../../storybook/storybook-static/index.json');

function loadStories() {
  let raw: string;
  try {
    raw = readFileSync(indexPath, 'utf-8');
  } catch {
    throw new Error(
      `Storybook build not found at ${indexPath}.\n` +
        `Run: pnpm --filter @autoworkshop/storybook build`,
    );
  }
  const index = JSON.parse(raw) as StorybookIndex;
  return Object.values(index.entries).filter((e) => e.type === 'story');
}

const stories = loadStories();

test('the storybook index actually contains stories', () => {
  // Guards against the whole suite passing vacuously because the index was
  // empty or the shape changed — 77 green tests over zero stories looks
  // identical to 77 green tests over 77 stories in the summary line.
  expect(stories.length).toBeGreaterThan(20);
});

test.describe('accessibility', () => {
  for (const story of stories) {
    test(`${story.title} / ${story.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(`/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      // NOT `#storybook-root > *`. ThemeProvider injects its CSS custom
      // properties as a <style> element, which becomes the first child and is
      // never "visible" — so waiting on the first child timed out on 74 of 77
      // stories that were rendering perfectly well. Wait for the first child
      // that can actually be seen.
      await page.waitForSelector('#storybook-root > *:not(style):not(script)', {
        state: 'visible',
        timeout: 15_000,
      });

      // A story that throws while rendering would otherwise be scanned as a
      // blank page and pass axe cleanly.
      expect(errors, `story threw while rendering: ${errors.join('; ')}`).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.target.join(' ')),
      }));

      expect(
        violations,
        `axe violations in ${story.title} / ${story.name}:\n` +
          JSON.stringify(violations, null, 2),
      ).toEqual([]);
    });
  }
});
