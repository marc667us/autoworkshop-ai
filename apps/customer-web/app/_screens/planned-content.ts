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
};
