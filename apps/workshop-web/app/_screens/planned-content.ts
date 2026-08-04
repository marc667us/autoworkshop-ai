/**
 * What each not-yet-built workshop screen tells the person who clicked it.
 *
 * ── 🔴 WHY THIS REPLACED THE CATCH-ALL PLACEHOLDER ──────────────────────────
 *
 * Every unbuilt route rendered one generic page: a "Not built yet" badge and a
 * paragraph about navigation and routing working. Truthful, and useless — it
 * answered a question about the BUILD and none of the questions a technician
 * standing at a vehicle actually has. The owner's report was blunt and correct:
 * "still the customer and technician pages say not built yet".
 *
 * So each route owes two things:
 *
 *   `does`  — what the screen will do, in the trade's own terms.
 *   `now`   — WHAT TO DO TODAY, and it must be REACHABLE. A refusal that names
 *             no alternative is a wall, which is the most expensive defect
 *             class recorded in this repository.
 *
 * ⚠️ NOTHING HERE INVENTS DATA. `05.txt` §2 prohibits disconnected mock pages,
 * so there is no sample wiring diagram, no fake course, no empty table implying
 * content will appear — only a description and a route that works today.
 */
export interface PlannedScreen {
  does: string;
  now: string;
  href?: string;
  hrefLabel?: string;
}

export const WORKSHOP_PLANNED: Record<string, PlannedScreen> = {
  // ── §49 Home ──────────────────────────────────────────────────────────────
  '/home/notifications': {
    does: 'Every alert aimed at you — a job assigned, a QC return, a part that has arrived.',
    now: 'Your assigned work is the live list of what is yours, and the queues show what stage each job is at.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/home/calendar': {
    does: 'Your day and week: the jobs booked to you, and when each is expected out.',
    now: 'Each job card carries its own expected completion date; your assigned work lists them all.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },

  // ── §49 Technical Tools — the Phase 9 knowledge libraries ────────────────
  '/technical-tools/fault-and-repair-knowledge-base': {
    does: 'Searchable write-ups of faults this workshop has seen before, and what actually fixed them.',
    now: 'The knowledge base is built from confirmed diagnoses, and those are being recorded now — every diagnosis you complete feeds it.',
    href: '/my-jobs/diagnosis-required',
    hrefLabel: 'Jobs needing diagnosis',
  },
  '/technical-tools/fault-code-search': {
    does: 'Looks a scan-tool fault code up and shows what it means on this make and model.',
    now: 'Record the codes you read on the diagnosis sheet — they are stored against the job and are what this search will read.',
    href: '/record-work/diagnostic-results',
    hrefLabel: 'Record a diagnosis',
  },
  '/technical-tools/diagnostic-trees': {
    does: 'Step-by-step decision trees that narrow a symptom down to a cause.',
    now: 'Work through the inspection checklist, which covers the standard checks in order.',
    href: '/record-work/inspection-results',
    hrefLabel: 'Record an inspection',
  },
  '/technical-tools/wiring-diagrams': {
    does: 'Circuit diagrams for the vehicle in front of you.',
    now: 'Wiring diagrams are licensed content and are not included yet. Use the workshop’s own manuals.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/technical-tools/component-locations': {
    does: 'Where each component physically sits on this make and model.',
    now: 'Licensed content, not included yet. Use the workshop’s own manuals.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/technical-tools/repair-procedures-library': {
    does: 'The approved procedure for a given repair, with torque figures and the order of work.',
    now: 'The repair plan on each job lists the tasks agreed for it, which is the procedure for that vehicle.',
    href: '/plan-work/repair-planning',
    hrefLabel: 'Repair planning',
  },
  '/technical-tools/technical-service-information': {
    does: 'Manufacturer bulletins and recalls affecting the vehicle.',
    now: 'Licensed content, not included yet. Check the manufacturer’s own portal.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/technical-tools/fault-simulation': {
    does: 'Simulates a fault on a model of the vehicle so you can see what it would do before dismantling anything.',
    now: 'Simulation is a later phase and needs confirmed diagnostic data to work from — the diagnoses being recorded now are that data.',
    href: '/record-work/diagnostic-results',
    hrefLabel: 'Record a diagnosis',
  },
  '/technical-tools/repair-solution-simulation': {
    does: 'Shows what a proposed repair would change, before the customer is asked to approve it.',
    now: 'The repair plan and its quotation set out what the work involves and what it costs.',
    href: '/plan-work/repair-planning',
    hrefLabel: 'Repair planning',
  },

  // ── §49 Plan Work ─────────────────────────────────────────────────────────
  '/plan-work/find-parts': {
    does: 'Searches suppliers for a part that fits the vehicle you are working on.',
    now: 'The parts marketplace is live and searchable by make, model and year.',
    href: '/',
    hrefLabel: 'Search the parts marketplace',
  },
  '/plan-work/parts-compatibility': {
    does: 'Confirms a specific part fits a specific vehicle before it is ordered.',
    now: 'Marketplace listings carry their own fitment data — filter by make, model and year when you search.',
    href: '/',
    hrefLabel: 'Search the parts marketplace',
  },
  '/plan-work/tool-reservation': {
    does: 'Books a shared tool so two technicians do not need it at once.',
    now: 'Tool booking is not built yet. Agree it with your supervisor.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/plan-work/equipment-reservation': {
    does: 'Books a ramp, a bay or a diagnostic machine for a job.',
    now: 'Bay and equipment booking is not built yet. Agree it with your supervisor.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/plan-work/request-specialist': {
    does: 'Asks for a specialist — auto electrician, injection, transmission — to look at a job with you.',
    now: 'Raise a variation on the job explaining what is needed; that reaches the people who can approve it.',
    href: '/record-work/variation-requests',
    hrefLabel: 'Raise a variation',
  },

  // ── §49 Learning ──────────────────────────────────────────────────────────
  '/learning/training-courses': {
    does: 'Courses assigned to you, and the ones you can choose.',
    now: 'Training content arrives with the knowledge phase. Your completed work is the record that matters today.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/learning/technical-videos': {
    does: 'Short videos showing a procedure being carried out.',
    now: 'Video content is not included yet. Ask a supervisor to walk a procedure through with you.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/learning/audio-guides': {
    does: 'Audio walkthroughs for procedures you cannot read a screen during.',
    now: 'Not included yet. Ask a supervisor.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
  '/learning/assessments': {
    does: 'Tests that confirm you are signed off on a procedure.',
    now: 'Competency records are a later phase. Quality control on your finished work is the current check.',
    href: '/testing/submit-to-quality-control',
    hrefLabel: 'Submit to quality control',
  },
  '/learning/certifications': {
    does: 'The certifications you hold, and when they expire.',
    now: 'Certifications are not recorded in the app yet. The workshop keeps them.',
    href: '/home/my-assigned-work',
    hrefLabel: 'My assigned work',
  },
};
