import type { PlannedScreen } from './planned-content';

/**
 * §34 / §46 / §47 / §48 — THE FOUR WORKSHOP TREES (default, owner, manager,
 * reception).
 *
 * ── 🔴 WHY 104 ENTRIES ARRIVED AT ONCE ──────────────────────────────────────
 *
 * The technician (§49) and customer (§33) trees were given honest, signposted
 * screens on 2026-08-04 and reached ZERO dead ends. The four workshop trees were
 * not. Measured 2026-08-05 with `audit-menu-coverage.mjs`:
 *
 *     OWNER      64 menu entries · 22 working · 41 dead ends
 *     DEFAULT    56 menu entries · 20 working · 35 dead ends
 *     MANAGER    36 menu entries · 15 working · 21 dead ends
 *     RECEPTION  29 menu entries · 8 working  · 20 dead ends
 *
 * 104 distinct routes rendering the generic "Not built yet" badge — the exact
 * complaint the owner made about the other two trees ("still the customer and
 * technician pages say not built yet"), left standing on the three roles that
 * actually run the business.
 *
 * ── ⚠️ EVERY `href` IS REACHABLE BY EVERY ROLE THAT SEES THAT ROUTE ─────────
 *
 * Checked mechanically, not promised — see `planned-workshop.spec.ts`. A route
 * that appears in two trees may only point at a screen present in BOTH, which is
 * why several fall back to `/home/dashboard`: it is the one screen in every
 * tree. A refusal that names an unreachable alternative is a wall, and it is the
 * most expensive defect class recorded in this repository.
 *
 * ── ⚠️ `/` IS THE PUBLIC PARTS MARKETPLACE ──────────────────────────────────
 *
 * Used deliberately as the target for every parts-sourcing entry. It is in no
 * nav tree because it is not a workspace screen — it is the product's public
 * front door, reachable from the wordmark in every app, and it is genuinely
 * built: catalogue, supplier filter and mechanic directory all work signed out.
 *
 * ── ⚠️ AND THIS IS NOT A LICENCE TO STOP BUILDING ───────────────────────────
 *
 * `audit-menu-coverage.mjs` counts these apart from WORKING screens precisely so
 * mounting them cannot be mistaken for shipping them.
 */
export const WORKSHOP_TREES_PLANNED: Record<string, PlannedScreen> = {
  // ── Home ──────────────────────────────────────────────────────────────────

  // ── Requests and reception (manager §47) ─────────────────────────────────

  // ── Requests (reception §48) ─────────────────────────────────────────────

  // ── Customer reception (default §34) ─────────────────────────────────────

  // ── Vehicle intake (reception §48) ───────────────────────────────────────

  // ── Workshop operations (owner §46) ──────────────────────────────────────

  // ── Customers and vehicles (owner §46) ───────────────────────────────────

  // ── Customers (reception §48) ────────────────────────────────────────────

  // ── Workshop floor (default §34, manager §47) ────────────────────────────

  // ── Solution and approval (default §34) ──────────────────────────────────

  // ── Customer approval (reception §48) ────────────────────────────────────

  // ── Parts and supply (default §34) ───────────────────────────────────────

  // ── Parts and suppliers (owner §46) ──────────────────────────────────────

  // ── Parts (manager §47) ──────────────────────────────────────────────────

  // ── Communication (T-0017 / C5, across trees) ────────────────────────────

  // ── Knowledge and staff ──────────────────────────────────────────────────

  // ── Finance and warranty (default §34) ───────────────────────────────────

  // ── Finance (owner §46) ──────────────────────────────────────────────────

  // ── Collection and payment (reception §48) ───────────────────────────────

  // ── Reports ──────────────────────────────────────────────────────────────

  // ── Workshop management (owner §46) ──────────────────────────────────────

  // ── Settings ─────────────────────────────────────────────────────────────
};
