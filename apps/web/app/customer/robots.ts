import type { MetadataRoute } from 'next';
import { REQUEST_SERVICE_PATH } from '@autoworkshop/marketplace-ui';

/**
 * WHAT CRAWLERS MAY DO ON THE CUSTOMER HOST.
 *
 * ── 🔴 WHY THIS APPEARED ──────────────────────────────────────────────────
 *
 * The last traffic `autoworkshop-customer` served before it was oomKilled on
 * 2026-08-07 was a bingbot burst — roughly fifteen requests inside a single
 * second, several of them 18–53KB server-rendered responses, against a 512Mi
 * free instance running `WEB_CONCURRENCY=1`.
 *
 * ⚠️ THAT IS A CORRELATION AND IT IS WRITTEN DOWN AS ONE. The kill came twelve
 * minutes later with no traffic in between, so no single request did it.
 *
 * ── 🔴 THE FIRST VERSION OF THIS FILE WAS WRONG, AND WOULD HAVE COST TRAFFIC ─
 *
 * It said `disallow: '/'` for everything, on the premise that this host is "a
 * signed-in customer portal". IT IS NOT. Codex checked and this host serves the
 * PUBLIC parts marketplace at `/` (`app/page.tsx` renders `MarketplaceLanding`),
 * `middleware.ts` gates nothing, and the request-for-service page is
 * DELIBERATELY reachable while signed out — it shows sign-in rather than
 * refusing, because it is the last step of the owner's funnel and the visitor
 * arrives from a different host with no session.
 *
 * Blocking all of that would have quietly deleted the storefront's search
 * presence to address a memory problem that was never shown to be caused by
 * crawling. The premise was checked only after the file was written; it should
 * have been checked first.
 *
 * ── WHAT IS ACTUALLY BLOCKED, AND WHY ─────────────────────────────────────
 *
 * Only a signed-in person's OWN pages: their vehicles, payments, settings,
 * messages and repair history. A crawler cannot reach them (there is no
 * session), so every fetch is a redirect or a refusal — pure cost on the
 * smallest instance in the estate, and nothing indexable at the end of it.
 *
 * The public storefront, the VIN lookup and the request form stay crawlable.
 *
 * ⚠️ `/service-and-repairs/` is blocked but the request form UNDER it is
 * allowed, because a more specific `Allow` wins over a broader `Disallow` in
 * both Google's and Bing's matching rules. The path is imported rather than
 * typed so it cannot drift from the route the funnel actually links to.
 *
 * ── ⚠️ `Crawl-delay` IS A COURTESY, NOT A CONTROL ─────────────────────────
 *
 * Bingbot honours it; Googlebot ignores it entirely. It is set because the
 * burst that prompted this WAS bingbot. Nothing here defends against a crawler
 * that ignores robots.txt, and none of it should be read as protection.
 */

/** A signed-in person's own pages. Nothing here is useful to a search engine. */
const PRIVATE_AREAS = [
  '/home',
  '/my-vehicles',
  '/payments',
  '/settings/',
  '/communication/',
  '/support/',
  '/parts-and-warranty/',
  '/service-and-repairs/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // The funnel's entry point, kept crawlable INSIDE an otherwise blocked
        // branch. Listed before the disallows for readability; precedence comes
        // from specificity, not order.
        allow: [REQUEST_SERVICE_PATH],
        disallow: PRIVATE_AREAS,
      },
      {
        // Named separately so the one directive it actually honours reaches it.
        userAgent: 'bingbot',
        allow: [REQUEST_SERVICE_PATH],
        disallow: PRIVATE_AREAS,
        crawlDelay: 10,
      },
    ],
  };
}
