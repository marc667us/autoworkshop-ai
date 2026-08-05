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
  '/communication/calls': {
    does: 'Calls made and received, logged against the job they concern.',
    now: 'Call logging is a later phase. Customer phone numbers are on their record.',
    href: '/customer-reception/customers',
    hrefLabel: 'Customers',
  },
  '/communication/voice-calls': {
    does: 'Calling a customer from the app, with the call logged against their job.',
    now: 'Calling is a later phase. Find the customer to get their number.',
    href: '/customers/customer-search',
    hrefLabel: 'Find a customer',
  },
  '/communication/video-consultations': {
    does: 'A video call with a customer or a specialist, recorded against the job.',
    now: 'Video is a later phase. A fault is communicated today through the diagnosis record on the job card.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/communication/specialist-consultations': {
    does: 'Consultations booked with an outside specialist, and what each concluded.',
    now: 'Internal review is the second opinion that exists today, and it is recorded against the job.',
    href: '/repair-control/internal-review',
    hrefLabel: 'Internal review',
  },

  // ── Knowledge and staff ──────────────────────────────────────────────────

  // ── Finance and warranty (default §34) ───────────────────────────────────

  // ── Finance (owner §46) ──────────────────────────────────────────────────

  // ── Collection and payment (reception §48) ───────────────────────────────

  // ── Reports ──────────────────────────────────────────────────────────────
  '/reports/operations': {
    does: 'Throughput, stage times and where work is piling up.',
    now: 'The staging board is the live version of this — every job and the stage it sits at.',
    href: '/workshop-floor/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/reports/technicians': {
    does: 'Work completed per technician, and how long each job took.',
    now: 'Time is recorded per job by the technician who did it. The staging board shows every open job with the technician assigned to it.',
    // 🔴 RETARGETED 2026-08-05. The obvious target was permission-GATED and this
    // tree's viewers do not hold the permission, so the signpost 404'd for the
    // very people it was written for. Found by driving it in a browser, not by
    // reading the nav — `planned-workshop.spec.ts` now checks the gate too.
    href: '/workshop-floor/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/reports/inventory': {
    does: 'Stock movement, value and turnover.',
    now: 'Stock control is a later phase, so there is nothing to report on yet.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/reports/financial': {
    does: 'Revenue, cost and margin by period.',
    now: 'Financial reporting needs invoicing first. Quotations are the priced records that exist.',
    href: '/solution-and-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/reports/customer-service': {
    does: 'Complaint rate, response time and repeat visits.',
    now: 'Complaints are recorded per job; the aggregate report is a later phase.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/reports/job-progress': {
    does: 'Where every open job is, and how long it has been there.',
    now: 'Repair progress is the live view of exactly that.',
    href: '/repair-control/repair-progress',
    hrefLabel: 'Repair progress',
  },
  '/reports/technician-workload': {
    does: 'How much work each technician is carrying right now.',
    now: 'The staging board shows every job with its assigned technician.',
    href: '/workshop-floor/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/reports/delayed-jobs': {
    does: 'Jobs past their expected completion date, and why.',
    now: 'Repair progress lists every open job with the stage it is stuck at.',
    href: '/repair-control/repair-progress',
    hrefLabel: 'Repair progress',
  },
  '/reports/workshop-utilization': {
    does: 'How fully the bays and the team are being used.',
    now: 'The staging board is the live picture the utilisation figure would be computed from.',
    href: '/workshop-floor/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/reports/workshop-performance': {
    does: 'The workshop’s headline numbers over time.',
    now: 'Aggregate reporting is a later phase. The dashboard carries the live counts.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/reports/technician-productivity': {
    does: 'Jobs completed and hours booked per technician.',
    now: 'Technicians record their time per job. Staff lists the team those records belong to.',
    href: '/workshop-management/staff',
    hrefLabel: 'Staff',
  },
  '/reports/service-bay-utilization': {
    does: 'How long each bay is occupied, and how often it sits empty.',
    now: 'Bays are not modelled yet. The staging board shows what is actually on the floor.',
    href: '/workshop-operations/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/reports/finance': {
    does: 'Revenue, outstanding balances and margin.',
    now: 'Invoicing comes first. Approved quotations are the committed amounts today.',
    href: '/repair-control/quotations',
    hrefLabel: 'Quotations',
  },
  '/reports/warranty': {
    does: 'Warranty returns, what they cost, and which repairs cause them.',
    now: 'Warranty terms are a later phase. A return is worked as a job card against the same vehicle.',
    href: '/workshop-operations/job-cards',
    hrefLabel: 'Job cards',
  },

  // ── Workshop management (owner §46) ──────────────────────────────────────

  // ── Settings ─────────────────────────────────────────────────────────────
};
