/**
 * What each not-yet-built customer screen actually tells its visitor.
 *
 * ── 🔴 WHY THIS REPLACED THE CATCH-ALL PLACEHOLDER ──────────────────────────
 *
 * Every unbuilt route used to render one generic page: a "Not built yet" badge
 * and a paragraph about navigation and routing working. Truthful, and useless —
 * it answered a question about the BUILD and none of the questions the person
 * clicking actually had. The owner's report was blunt and correct: "still the
 * customer and technician pages say not built yet".
 *
 * A screen that cannot do the job yet still owes the visitor two things, and
 * this file is those two things for every route:
 *
 *   `does`  — what this screen will do, in the customer's own terms, so they
 *             know whether to wait for it or to stop looking.
 *   `now`   — WHAT TO DO TODAY, and it must be REACHABLE. Not "coming soon".
 *             A refusal that names no alternative is a wall, which is the most
 *             expensive defect class recorded in this repository.
 *
 * ⚠️ NOTHING HERE INVENTS DATA. `05.txt` §2 prohibits disconnected mock pages,
 * so these screens show no fabricated invoices, messages or appointments — only
 * a description and a route that genuinely works today.
 *
 * ⚠️ `href` MUST BE A ROUTE THIS WORKSPACE REALLY HAS. A link to another
 * unbuilt screen would send someone in a circle. `planned-content.spec.ts`
 * asserts every one of them resolves to a real page.
 */
export interface PlannedScreen {
  /** What it will do. */
  does: string;
  /** What to do instead, today. */
  now: string;
  /** A route that works right now, if there is a useful one. */
  href?: string;
  hrefLabel?: string;
}

export const CUSTOMER_PLANNED: Record<string, PlannedScreen> = {
  '/home/my-tasks': {
    does: 'Collects everything waiting on you across all your vehicles in one list — approvals, deposits, questions and collections.',
    now: 'Repair Tracking already shows every job that needs you, marked and explained.',
    href: '/service-and-repairs/repair-proposals',
    hrefLabel: 'See what needs you',
  },
  '/service-and-repairs/appointments': {
    does: 'Books a time to bring the vehicle in, and shows what you have booked.',
    now: 'Report the problem and the workshop will contact you to arrange a time.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a problem',
  },
  '/parts-and-warranty/installed-parts': {
    does: 'Lists every part fitted to each of your vehicles, with the date and the job it was fitted on.',
    now: 'Parts fitted appear on the job they belong to; ask the workshop for the detail of a finished repair.',
    href: '/my-vehicles/service-history',
    hrefLabel: 'Read your service history',
  },
  '/parts-and-warranty/product-recommendations': {
    does: 'Suggests parts and servicing for your vehicles based on what has been fitted and how far they have run.',
    now: 'You can search the parts marketplace for anything that fits your vehicle.',
    href: '/marketplace',
    hrefLabel: 'Browse parts',
  },
  '/support/towing': {
    does: 'Requests recovery when a vehicle cannot be driven, and tracks the truck.',
    now: 'Towing partners are not connected yet. Call the workshop — they can arrange recovery for you.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a problem',
  },
  '/support/knowledge': {
    does: 'Plain-language articles about common faults, what they cost and how urgent they are.',
    now: 'The knowledge library arrives with the workshop knowledge base. Ask the workshop directly for now.',
    href: '/home/dashboard',
    hrefLabel: 'Back to your dashboard',
  },
  '/support/help-center': {
    does: 'How to use this app, and answers to the questions people ask most.',
    now: 'Everything you can do today is in the menu: your garage, reporting a problem, and tracking a repair.',
    href: '/home/dashboard',
    hrefLabel: 'Back to your dashboard',
  },
  '/settings/security': {
    does: 'Your password, sessions and sign-in history.',
    now: 'Your password is managed by the sign-in service, not by this app — use "Forgot password" on the sign-in screen to change it.',
    href: '/settings/profile',
    hrefLabel: 'Your profile',
  },
};
