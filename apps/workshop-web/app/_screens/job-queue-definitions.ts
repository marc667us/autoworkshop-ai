import type { JobQueue } from './job-queue-screen';

/**
 * The queues, in one place.
 *
 * Each route is a REAL view of real job cards narrowed to a point in the
 * lifecycle — not a placeholder, and not a new copy of the job-cards screen.
 *
 * 🔴 EVERY STAGE KEY HERE MUST EXIST IN THE DATABASE'S VOCABULARY. A typo does
 * not throw: `['inspection_required']` simply matches no row and the screen
 * says "nothing is waiting", which is indistinguishable from a quiet workshop.
 * `job-queue-definitions.spec.ts` checks all of them against
 * `apps/api/src/repair/job-card-stages.ts`, which is itself a transcription of
 * migration 006's CHECK constraint.
 */
// `satisfies`, not a `Record<string, JobQueue>` ANNOTATION. The annotation
// widens the keys to `string`, so `JOB_QUEUES['/home/tasks']` types as
// `JobQueue | undefined` and every page needs a non-null assertion — which is
// exactly the assertion that would hide a route whose queue was deleted.
// `satisfies` keeps the literal keys, so a page referencing a route that is not
// defined here fails to COMPILE.
export const JOB_QUEUES = {
  '/my-jobs/inspection-required': {
    stages: ['initial_inspection'],
    description: 'Jobs waiting for an initial inspection.',
    emptyTitle: 'No inspections waiting',
    emptyBody: 'Nothing is at the inspection stage. New jobs appear here once the vehicle is received.',
  },
  '/my-jobs/diagnosis-required': {
    stages: ['diagnosis_in_progress', 'further_information_required'],
    description: 'Jobs being diagnosed, and those held for more information.',
    emptyTitle: 'No diagnoses in progress',
    emptyBody: 'Nothing is at the diagnosis stage. A job arrives here after its inspection.',
  },
  '/my-jobs/repair-approved': {
    stages: ['authorized_to_start'],
    description: 'Jobs the customer has approved and which are cleared to start.',
    emptyTitle: 'Nothing approved and waiting',
    emptyBody: 'No job is authorised to start. Approval happens on the proposal, after a quotation.',
  },
  '/my-jobs/repair-in-progress': {
    stages: ['repair_in_progress', 'specialist_consultation'],
    description: 'Repairs under way, including those out with a specialist.',
    emptyTitle: 'No repairs under way',
    emptyBody: 'Nothing is being worked on. An approved job moves here when work starts.',
  },
  '/my-jobs/testing-required': {
    stages: ['testing'],
    description: 'Repairs finished and waiting to be tested.',
    emptyTitle: 'Nothing waiting to be tested',
    emptyBody: 'No job is at the testing stage. A repair arrives here once work is complete.',
  },
  '/my-jobs/quality-control-returns': {
    stages: ['quality_control'],
    description: 'Jobs in independent quality control.',
    emptyTitle: 'Nothing in quality control',
    emptyBody:
      'No job is awaiting a quality check. A check must be done by somebody who did not do the work.',
  },
  '/my-jobs/awaiting-parts': {
    stages: ['awaiting_parts'],
    description: 'Jobs stopped because a part has not arrived.',
    emptyTitle: 'Nothing is waiting on parts',
    emptyBody: 'No job is held for a part. A job moves here when work cannot continue without one.',
  },
  '/repair-control/ready-for-collection': {
    stages: ['ready_for_collection'],
    description: 'Vehicles finished and ready for their owner to collect.',
    emptyTitle: 'Nothing ready for collection',
    emptyBody: 'No vehicle is ready yet. A job arrives here after it passes quality control.',
  },
  '/repair-control/customer-approvals': {
    stages: ['awaiting_customer_approval', 'awaiting_deposit'],
    description: 'Jobs waiting on the customer — an approval or a deposit.',
    emptyTitle: 'Nothing waiting on a customer',
    emptyBody: 'No job is held for a customer decision or deposit.',
  },
  '/repair-control/internal-review': {
    // ⚠️ `specialist_consultation`, NOT `awaiting_internal_review`.
    //
    // 🔴 THE FIRST VERSION OF THIS LINE NAMED A STAGE THAT DOES NOT EXIST, and
    // the drift test caught it on its very first run. `awaiting_internal_review`
    // is a BOARD COLUMN key in `job-card-stages.ts` (`BOARD_COLUMNS`), not a
    // value the `stage` column can hold — and that column maps to
    // `specialist_consultation`. Nothing would have failed: the queue would
    // have matched no row and told a manager, every day, that nothing was
    // awaiting review.
    //
    // The mapping is taken from the board rather than invented here, so the two
    // cannot come to mean different things.
    stages: ['specialist_consultation'],
    description: 'Work referred for a second opinion before it reaches the customer.',
    emptyTitle: 'Nothing awaiting internal review',
    emptyBody: 'No job has been referred. A review must be done by somebody other than the author.',
  },
  '/home/tasks': {
    // 🔴 THE WORDING IS ROLE-NEUTRAL ON PURPOSE. Raised by Codex: this said
    // "every job on your plate" and "nothing assigned to you", which is true
    // for a technician — the service narrows them to their own cards — and
    // FALSE for the owner and manager who also reach this route, where the
    // same request returns the whole workshop. One sentence, two roles, and it
    // was a confident lie to one of them. It now describes what the reader is
    // actually looking at without claiming whose it is.
    stages: [],
    description: 'Every job you can see, whatever stage it is at.',
    emptyTitle: 'No open jobs',
    emptyBody:
      'There is nothing to show. A technician sees the jobs assigned to them; a manager or owner sees the whole workshop.',
  },
  '/home/my-tasks': {
    stages: [],
    description: 'Every job you can see, whatever stage it is at.',
    emptyTitle: 'No open jobs',
    emptyBody:
      'There is nothing to show. A technician sees the jobs assigned to them; a manager or owner sees the whole workshop.',
  },
  '/workshop-operations/repair-requests': {
    stages: ['complaint_received', 'appointment_confirmed', 'vehicle_received'],
    description: 'Requests that have arrived and not yet reached inspection.',
    emptyTitle: 'No new requests',
    emptyBody: 'Nothing new has come in. A request appears here when a complaint is recorded.',
  },
  '/workshop-operations/customer-complaints': {
    stages: ['complaint_received'],
    description: 'Complaints recorded and not yet turned into a booking.',
    emptyTitle: 'No complaints waiting',
    emptyBody: 'Nothing has been recorded yet. Reception records a complaint when a customer calls.',
  },
} satisfies Record<string, JobQueue>;
