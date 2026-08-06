/**
 * MEASURES the mobile layout on the DEPLOYED site. It does not reason about it.
 *
 * Why this file exists: `89ce7d2` fixed the shell so layout no longer waits for
 * hydration, and the session note that shipped it says in terms
 * "REASONED, NOT MEASURED — measure `main` at 390px on the deployed site before
 * closing this." This repo also has a recorded defect (T-0044) for claiming a
 * responsive fix without measuring: it asserted 51px of sideways scroll at
 * 768px and later measured 0.
 *
 * The failure being hunted: on a 390px phone the desktop branch rendered the
 * side nav as a ~16rem column and the contextual panel as `width:20rem;
 * flex-shrink:0` with NO mobile branch at all — 320px stolen from 390px
 * permanently, which no JavaScript could fix because it was CSS.
 *
 * So the numbers that matter are:
 *   * `main` width as a FRACTION of the viewport — "half the page" is this.
 *   * `documentElement.scrollWidth` vs `innerWidth` — sideways scroll.
 *   * whether a side nav / contextual panel is occupying inline space.
 *
 * Run: node apps/e2e/verify/measure-mobile-width.mjs [url]
 */
import { chromium, devices } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://autoworkshop.aiappinvent.com';

/** 390px is an iPhone 12/13/14. 360 is the common cheap Android. 768 is the
 *  width T-0044 was raised at, kept so a regression there is visible too. */
const VIEWPORTS = [
  { label: 'iPhone 12  390x844', width: 390, height: 844 },
  { label: 'Android    360x800', width: 360, height: 800 },
  { label: 'Tablet     768x1024', width: 768, height: 1024 },
];

const ROUTES = ['/', '/marketplace'];

const browser = await chromium.launch();
let failures = 0;

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      ...devices['iPhone 12'],
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const url = `${BASE}${route}`;

    try {
      // The API and Keycloak are on a free tier and cold-start for up to 136s.
      // A short timeout here would measure a half-rendered page and call it a
      // layout defect — the exact class of phantom this repo has burned hours on.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      // Settle after hydration. The ORIGINAL defect was that layout was correct
      // only AFTER hydration, so measuring too early would report the bug as
      // present when it is fixed, and too late would hide a regression. Both
      // numbers are taken, pre- and post-hydration.
      const pre = await measure(page);
      await page.waitForTimeout(2500);
      const post = await measure(page);

      const frac = (post.mainWidth / vp.width) * 100;
      const overflow = post.scrollWidth - post.innerWidth;

      // "Half the page" is the report being checked. Anything under 70% of the
      // viewport means something is still holding inline space.
      const bad = post.mainWidth > 0 && frac < 70;
      const scrolls = overflow > 1;
      if (bad || scrolls) failures += 1;

      console.log(
        `${bad || scrolls ? 'FAIL' : ' ok '} ${vp.label}  ${route}\n` +
          `        main ${post.mainWidth}px of ${vp.width}px (${frac.toFixed(1)}%)` +
          `   pre-hydration ${pre.mainWidth}px\n` +
          `        scrollWidth ${post.scrollWidth} vs innerWidth ${post.innerWidth}` +
          `  -> sideways ${overflow}px\n` +
          `        nav ${post.navWidth}px  panel ${post.panelWidth}px  body ${post.bodyWidth}px`,
      );
      if (post.widest) {
        console.log(`        widest element: ${post.widest}`);
      }
    } catch (err) {
      failures += 1;
      console.log(`FAIL ${vp.label}  ${route}\n        ${err.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL MEASUREMENTS CLEAN' : `${failures} measurement(s) flagged`}`);
process.exit(failures === 0 ? 0 : 1);

async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => (el ? Math.round(el.getBoundingClientRect().width) : 0);
    const main = document.querySelector('main');
    // The side nav and contextual panel are the two elements that stole the
    // width. Selected structurally rather than by class, because the class
    // names are generated and a wrong selector would silently measure 0 and
    // read as "no panel present" — a check walking through its own gap.
    const nav = document.querySelector('nav');
    const aside = document.querySelector('aside');

    // Name whatever is actually wider than the viewport, so a failure points at
    // a node instead of leaving the next person to hunt for it.
    let widest = null;
    let widestW = window.innerWidth + 1;
    for (const el of document.querySelectorAll('body *')) {
      const w = el.getBoundingClientRect().width;
      if (w > widestW) {
        widestW = w;
        const id = el.id ? `#${el.id}` : '';
        const cls =
          typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : '';
        widest = `<${el.tagName.toLowerCase()}${id}${cls}> ${Math.round(w)}px`;
      }
    }

    return {
      mainWidth: rect(main),
      navWidth: rect(nav),
      panelWidth: rect(aside),
      bodyWidth: rect(document.body),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      widest,
    };
  });
}
