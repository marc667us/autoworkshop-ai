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
  '/home/notifications': {
    does: 'A record of every update the workshop has sent you, so nothing is only in a text message.',
    now: 'Your repair list shows the current stage of each job, updated as the workshop moves it on.',
    href: '/service-and-repairs/repair-tracking',
    hrefLabel: 'Track your repairs',
  },
  '/my-vehicles/documents': {
    does: 'Stores your registration, insurance and inspection certificates against each vehicle.',
    now: 'File storage is not connected yet, so keep documents yourself. Your vehicle details are in your garage.',
    href: '/my-vehicles/garage',
    hrefLabel: 'Open your garage',
  },
  '/my-vehicles/maintenance-schedule': {
    does: 'Tells you when each vehicle is next due for a service, based on its mileage and the manufacturer’s intervals.',
    now: 'Service intervals are not configured yet. Your completed work, with mileage, is in your service history.',
    href: '/my-vehicles/service-history',
    hrefLabel: 'Read your service history',
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
  '/parts-and-warranty/warranty': {
    does: 'Shows the warranty covering each completed repair, and when it expires.',
    now: 'Warranty terms are stated on the repair proposal you approved. Ask the workshop for a copy of a past one.',
    href: '/service-and-repairs/completed-repairs',
    hrefLabel: 'See completed repairs',
  },
  '/parts-and-warranty/warranty-claims': {
    does: 'Raises a claim when something covered by warranty fails again, and tracks the workshop’s response.',
    now: 'Report the problem as a new request and say it is a repeat of an earlier repair — the workshop can see the history.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a problem',
  },
  '/communication/messages': {
    does: 'A written conversation with the workshop, kept against the job it is about.',
    now: 'Messaging is not connected yet. Contact the workshop directly; every job shows its current stage here.',
    href: '/service-and-repairs/repair-tracking',
    hrefLabel: 'Track your repairs',
  },
  '/communication/voice-calls': {
    does: 'Calls the workshop from inside the app, with the call logged against the job.',
    now: 'Call the workshop on their own number. The job number is on your repair list if they ask for it.',
    href: '/service-and-repairs/service-requests',
    hrefLabel: 'Find your job number',
  },
  '/communication/video-consultations': {
    does: 'A video call so a technician can see the fault before the vehicle comes in.',
    now: 'Describe the problem in as much detail as you can when you report it.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a problem',
  },
  '/communication/shared-files': {
    does: 'Photographs, videos and scan results shared between you and the workshop.',
    now: 'File sharing is not connected yet. Describe what you have seen or heard when you report the problem.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a problem',
  },
  '/payments/quotations': {
    does: 'Every price the workshop has quoted you, including ones you have not answered yet.',
    now: 'A quotation reaches you as a repair proposal, with the price and the options to choose between.',
    href: '/service-and-repairs/repair-proposals',
    hrefLabel: 'See your proposals',
  },
  '/payments/invoices': {
    does: 'Your invoices, what they cover and what is still outstanding.',
    now: 'Invoicing is not connected yet — ask the workshop for an invoice for a completed repair.',
    href: '/service-and-repairs/completed-repairs',
    hrefLabel: 'See completed repairs',
  },
  '/payments/payments': {
    does: 'Pays the workshop from inside the app and records what you have paid.',
    now: 'Payments are not connected yet. Pay the workshop directly, however you normally do.',
    href: '/service-and-repairs/repair-tracking',
    hrefLabel: 'Track your repairs',
  },
  '/payments/receipts': {
    does: 'A receipt for every payment, downloadable.',
    now: 'Ask the workshop for a receipt. Keep it with the job number from your request list.',
    href: '/service-and-repairs/service-requests',
    hrefLabel: 'Find your job number',
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
  '/support/support-cases': {
    does: 'Raises a problem with the SERVICE itself — not with a vehicle — and tracks the answer.',
    now: 'Contact the workshop directly. A fault with a vehicle belongs on Report a Problem instead.',
    href: '/service-and-repairs/report-a-problem',
    hrefLabel: 'Report a vehicle problem',
  },
  '/settings/authorized-drivers': {
    does: 'Lets somebody else — a spouse, a driver, an employee — deal with the workshop about your vehicle.',
    now: 'Only your own account can act on your vehicles. Tell the workshop directly if somebody else will bring it in.',
    href: '/settings/profile',
    hrefLabel: 'Your profile',
  },
  '/settings/communication-preferences': {
    does: 'Chooses how the workshop reaches you, and about what.',
    now: 'The workshop uses the phone number and email on your profile.',
    href: '/settings/profile',
    hrefLabel: 'Check your details',
  },
  '/settings/security': {
    does: 'Your password, sessions and sign-in history.',
    now: 'Your password is managed by the sign-in service, not by this app — use "Forgot password" on the sign-in screen to change it.',
    href: '/settings/profile',
    hrefLabel: 'Your profile',
  },
};
