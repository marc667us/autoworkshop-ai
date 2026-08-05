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
  '/home/notification-inbox': {
    does: 'One place for every alert the workshop raises — a job stalled, a part in, an approval overdue.',
    now: 'Alerts are not collected into an inbox yet. The dashboard carries the live counts, and each queue shows what is actually waiting.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },

  // ── Requests and reception (manager §47) ─────────────────────────────────

  // ── Requests (reception §48) ─────────────────────────────────────────────

  // ── Customer reception (default §34) ─────────────────────────────────────

  // ── Vehicle intake (reception §48) ───────────────────────────────────────

  // ── Workshop operations (owner §46) ──────────────────────────────────────

  // ── Customers and vehicles (owner §46) ───────────────────────────────────

  // ── Customers (reception §48) ────────────────────────────────────────────
  '/customers/customer-messages': {
    does: 'The message thread with each customer — what was promised, and when.',
    now: 'Messaging is a later phase (T-0017). Customer contact details are on their record.',
    href: '/customers/customer-search',
    hrefLabel: 'Find a customer',
  },

  // ── Workshop floor (default §34, manager §47) ────────────────────────────
  '/workshop-floor/tools-and-equipment': {
    does: 'The workshop’s tools and rigs, who has each, and when it is next serviced.',
    now: 'Tool records are a later phase. Tools used on a job are recorded on that job card.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },

  // ── Solution and approval (default §34) ──────────────────────────────────

  // ── Customer approval (reception §48) ────────────────────────────────────

  // ── Parts and supply (default §34) ───────────────────────────────────────
  '/parts-and-supply/parts-depot': {
    does: 'What is on the shelf, where it is, and what is running low.',
    now: 'Stock control is a later phase. Parts used on a job are recorded on that job card.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts-and-supply/reservations': {
    does: 'Parts held for a specific job so they cannot be used on another.',
    now: 'Reservations need stock control first. The job card lists the parts each job needs.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts-and-supply/procurement': {
    does: 'Raising an order with a supplier and tracking it to delivery.',
    now: 'The parts marketplace is live and public — search verified suppliers by vehicle or part number and order with an account.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },
  '/parts-and-supply/goods-receipt': {
    does: 'Booking a delivery in and checking it against what was ordered.',
    now: 'Goods receipt follows procurement. Parts fitted to a job are recorded on the job card today.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts-and-supply/suppliers': {
    does: 'The suppliers this workshop buys from, and the terms agreed with each.',
    now: 'Every verified supplier on the platform is listed in the marketplace, with the parts they stock.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },
  '/parts-and-supply/marketplace': {
    does: 'Sourcing a part from the wider supplier network.',
    now: 'It is live and public: search by make, model, year or part number, at supplier list prices in cedis.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },

  // ── Parts and suppliers (owner §46) ──────────────────────────────────────
  '/parts-and-suppliers/inventory': {
    does: 'Stock on hand, its value, and what needs reordering.',
    now: 'Stock control is a later phase. Parts consumed are recorded per job card.',
    href: '/workshop-operations/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts-and-suppliers/parts-reservations': {
    does: 'Parts committed to a job and unavailable to others.',
    now: 'Reservations need stock control first. Each job card lists the parts that job requires.',
    href: '/workshop-operations/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts-and-suppliers/procurement': {
    does: 'Purchase orders, their approval, and delivery tracking.',
    now: 'Order through the marketplace today — it is live, and one basket becomes one order per supplier.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },
  '/parts-and-suppliers/suppliers': {
    does: 'Your supplier list, with lead times and agreed pricing.',
    now: 'The marketplace lists every verified supplier and what each stocks.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },
  '/parts-and-suppliers/marketplace': {
    does: 'The wider parts network, beyond your own suppliers.',
    now: 'It is live and public — search by vehicle or part number and compare supplier prices in cedis.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },

  // ── Parts (manager §47) ──────────────────────────────────────────────────
  '/parts/parts-status': {
    does: 'Which jobs are waiting on parts, and how long each has waited.',
    now: 'A job held for parts sits at that stage on its job card, which is where the wait is visible today.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts/reservations': {
    does: 'Parts held against a job so they are not used elsewhere.',
    now: 'Reservations need stock control first. The job card lists what each job needs.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/parts/purchase-requisitions': {
    does: 'Requests to buy, and their approval before an order is placed.',
    now: 'The marketplace is live and can be ordered from directly while requisitions are built.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },
  '/parts/supplier-inquiries': {
    does: 'Questions put to suppliers about price, stock or fitment, and their replies.',
    now: 'The marketplace shows each supplier’s stock status and list price without having to ask.',
    href: '/',
    hrefLabel: 'Parts marketplace',
  },

  // ── Communication (T-0017 / C5, across trees) ────────────────────────────
  '/communication/messages': {
    does: 'Every conversation the workshop is having, in one inbox.',
    now: 'Messaging is a later phase (T-0017). Contact details are on each customer record, and job notes are on the job card.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
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
  '/communication/customer-messages': {
    does: 'The thread with each customer — what was agreed, and when.',
    now: 'Messaging is a later phase. Decisions that matter are recorded on the proposal and the job card.',
    href: '/home/my-tasks',
    hrefLabel: 'My tasks',
  },
  '/communication/technician-messages': {
    does: 'Messages to and from the floor, attached to the job they are about.',
    now: 'The staging board shows who is on what, which is how work is currently passed along.',
    href: '/workshop-floor/repair-staging',
    hrefLabel: 'Repair staging board',
  },
  '/communication/supplier-messages': {
    does: 'Correspondence with suppliers about orders and deliveries.',
    now: 'Supplier messaging is a later phase; the marketplace carries stock and price without a conversation.',
    href: '/home/my-tasks',
    hrefLabel: 'My tasks',
  },
  '/communication/specialist-support': {
    does: 'Asking an outside specialist about a fault this workshop has not seen before.',
    now: 'Record what you have found on the diagnosis first — that record is what a specialist would be sent.',
    href: '/repair-services/diagnosis',
    hrefLabel: 'Diagnosis',
  },
  '/communication/specialist-consultations': {
    does: 'Consultations booked with an outside specialist, and what each concluded.',
    now: 'Internal review is the second opinion that exists today, and it is recorded against the job.',
    href: '/repair-control/internal-review',
    hrefLabel: 'Internal review',
  },

  // ── Knowledge and staff ──────────────────────────────────────────────────
  '/knowledge-and-staff/repair-knowledge': {
    does: 'Write-ups of faults this workshop has fixed before, and what actually worked.',
    now: 'The knowledge base is built from confirmed diagnoses — every diagnosis recorded now feeds it.',
    href: '/repair-services/diagnosis',
    hrefLabel: 'Diagnosis',
  },
  '/knowledge-and-staff/fault-and-repair-knowledge-base': {
    does: 'Searchable fault-and-fix history across every job this workshop has done.',
    now: 'It is assembled from confirmed diagnoses, which are being recorded now.',
    href: '/repair-control/diagnosis',
    hrefLabel: 'Diagnosis',
  },
  '/knowledge-and-staff/repair-procedures-library': {
    does: 'Step-by-step procedures for common repairs, with times and tools.',
    now: 'Repair plans carry the steps agreed for each job — the same content, one job at a time.',
    href: '/repair-control/repair-plans',
    hrefLabel: 'Repair plans',
  },
  '/knowledge-and-staff/wiring-diagrams': {
    does: 'Circuit diagrams for the vehicles this workshop sees.',
    now: 'Diagrams are licensed content and are staged deliberately. The diagnosis record holds what has been measured on the vehicle itself.',
    href: '/repair-control/diagnosis',
    hrefLabel: 'Diagnosis',
  },
  '/knowledge-and-staff/training': {
    does: 'Courses assigned to your technicians, and who has completed what.',
    now: 'Training records are a later phase. Quality control is the check that catches a skills gap today.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/knowledge-and-staff/certifications': {
    does: 'The certifications your staff hold, and when each expires.',
    now: 'Certifications are not recorded in the app yet; the workshop keeps them.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },

  // ── Finance and warranty (default §34) ───────────────────────────────────
  '/finance-and-warranty/invoices': {
    does: 'Invoices raised against completed work.',
    now: 'The quotation is the priced document that exists today, and an invoice is raised from it.',
    href: '/solution-and-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/finance-and-warranty/payments': {
    does: 'What has been paid, by whom, and what is still outstanding.',
    now: 'There is no in-app payment yet — deliberately. The quotation carries the agreed amount.',
    href: '/solution-and-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/finance-and-warranty/warranty-records': {
    does: 'What each repair is warranted for, and until when.',
    now: 'Warranty terms are a later phase. The job card records exactly what was done, which is what a claim is judged on.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },
  '/finance-and-warranty/warranty-claims': {
    does: 'Claims made against a previous repair, and how each was settled.',
    now: 'A return under warranty is worked as a job card against the same vehicle.',
    href: '/workshop-floor/job-cards',
    hrefLabel: 'Job cards',
  },

  // ── Finance (owner §46) ──────────────────────────────────────────────────
  '/finance/invoices': {
    does: 'Every invoice this workshop has raised.',
    now: 'Quotations are the priced records that exist, and invoicing is raised from them.',
    href: '/repair-control/quotations',
    hrefLabel: 'Quotations',
  },
  '/finance/payments': {
    does: 'Money received, against which job, and by what method.',
    now: 'In-app payment is deliberately not built. Quotations carry the agreed amounts.',
    href: '/repair-control/quotations',
    hrefLabel: 'Quotations',
  },
  '/finance/outstanding-balances': {
    does: 'Who owes what, and for how long.',
    now: 'Ledgers follow invoicing. Approved quotations are the amounts committed to today.',
    href: '/repair-control/quotations',
    hrefLabel: 'Quotations',
  },
  '/finance/refunds': {
    does: 'Refunds issued, and the reason recorded for each.',
    now: 'A refund follows a complaint, and complaints are recorded against the job they concern.',
    href: '/workshop-operations/customer-complaints',
    hrefLabel: 'Customer complaints',
  },
  '/finance/workshop-revenue': {
    does: 'What the workshop earned, by period, service and technician.',
    now: 'Revenue reporting needs invoicing first. Approved quotations are the closest measure available now.',
    href: '/repair-control/quotations',
    hrefLabel: 'Quotations',
  },

  // ── Collection and payment (reception §48) ───────────────────────────────
  '/collection-and-payment/ready-for-collection': {
    does: 'Vehicles finished and waiting for their owner.',
    now: 'A job reaching the collection stage appears on your task list.',
    href: '/home/my-tasks',
    hrefLabel: 'My tasks',
  },
  '/collection-and-payment/invoices': {
    does: 'The invoice for a completed job, ready to hand over.',
    now: 'The approved quotation is the priced document today, and it states what the customer agreed to pay.',
    href: '/customer-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/collection-and-payment/receive-payment': {
    does: 'Recording a payment against a job at the counter.',
    now: 'In-app payment is deliberately not built. Take payment as the workshop normally does; the quotation is the amount.',
    href: '/customer-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/collection-and-payment/receipts': {
    does: 'The receipt issued for a payment taken.',
    now: 'Printed documents are a later phase. The quotation records what was agreed.',
    href: '/customer-approval/quotations',
    hrefLabel: 'Quotations',
  },
  '/collection-and-payment/vehicle-release': {
    does: 'Handing the vehicle back — keys, signature, and the release record.',
    now: 'Find the vehicle to confirm its job is complete before releasing it.',
    href: '/vehicles/vehicle-search',
    hrefLabel: 'Find a vehicle',
  },

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
  '/workshop-management/tools-and-equipment': {
    does: 'The workshop’s equipment register and its service schedule.',
    now: 'Equipment records are a later phase. Tools used on a job are noted on the job card.',
    href: '/workshop-operations/job-cards',
    hrefLabel: 'Job cards',
  },
  '/workshop-management/service-categories': {
    does: 'The services this workshop offers, and the standard time for each.',
    now: 'Pricing rules are where the money side of a service is set today.',
    href: '/workshop-management/pricing-rules',
    hrefLabel: 'Pricing rules',
  },
  '/workshop-management/opening-hours': {
    does: 'When the workshop is open, and its holiday closures.',
    now: 'Opening hours are part of the public workshop profile, which is editable now.',
    href: '/workshop-management/workshop-profile',
    hrefLabel: 'Workshop profile',
  },
  '/workshop-management/branches': {
    does: 'Your branches, and which staff and jobs belong to each.',
    now: 'Multi-branch is a later phase. The workshop profile describes the one branch that exists.',
    href: '/workshop-management/workshop-profile',
    hrefLabel: 'Workshop profile',
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  '/settings/branches': {
    does: 'Branch records and what each one covers.',
    now: 'Multi-branch is a later phase. The workshop profile holds the current details.',
    href: '/settings/workshop-profile',
    hrefLabel: 'Workshop profile',
  },
  '/settings/approval-limits': {
    does: 'How much each role may approve before it escalates.',
    now: 'Approval authority follows the role today, and roles are set per staff member.',
    href: '/workshop-management/staff',
    hrefLabel: 'Staff',
  },
  '/settings/templates': {
    does: 'Reusable wording for quotations, job cards and customer messages.',
    now: 'Templates are a later phase. The workshop profile carries the details that would fill them.',
    href: '/workshop-management/workshop-profile',
    hrefLabel: 'Workshop profile',
  },
  '/settings/notifications': {
    does: 'Which events raise an alert, and who receives it.',
    now: 'Notification routing is a later phase. Contact details live on the workshop profile.',
    href: '/workshop-management/workshop-profile',
    hrefLabel: 'Workshop profile',
  },
  '/settings/security': {
    does: 'Sign-in policy, sessions, and the audit trail.',
    now: 'Sign-in is handled by Keycloak, and who may do what follows the roles set per staff member.',
    href: '/workshop-management/staff',
    hrefLabel: 'Staff',
  },
  '/settings/integrations': {
    does: 'Connecting outside systems — accounting, scan tools, messaging.',
    now: 'Integrations are tenant-configurable by design and none is mandatory. Nothing is connected yet.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
  '/settings/workflow-rules': {
    does: 'Rules that move a job on automatically, and who they notify.',
    now: 'Stage transitions are driven by the people doing the work, and each is recorded on the job card.',
    href: '/home/dashboard',
    hrefLabel: 'Dashboard',
  },
};
