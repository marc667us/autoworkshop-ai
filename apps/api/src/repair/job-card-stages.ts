/**
 * Job card stage transition rules — Phase 5, slice 2.
 *
 * `02.txt` §29: "Drag-and-drop movement shall not bypass business rules. THE
 * BACKEND SHALL VALIDATE EVERY STAGE CHANGE."
 * `1.txt` §394: "The repair staging board shall enforce transition rules. A
 * technician must not manually bypass required approval, payment, parts or
 * quality-control states without an authorized, logged override."
 *
 * Two INDEPENDENT rules, and they are independent on purpose:
 *
 *   1. WHERE may this card go next?  → `STAGE_TRANSITIONS` (the lifecycle)
 *   2. WHO may put it there?         → `ROLE_TARGET_STAGES` (07 pt2 §50)
 *
 * Collapsing them into one table would be smaller and wrong. A technician is
 * allowed to reach `testing`, but not from `complaint_received` — and a manager
 * may reach `quality_control`, but not from `vehicle_received`. Either rule
 * alone permits a bypass the other catches, so both are checked, and the tests
 * assert each one with the other satisfied.
 *
 * ⚠️ THIS FILE IS NOT THE AUTHORITY ON WHICH STAGES EXIST. The CHECK constraint
 * in migration 006 is. `STAGES` below is a transcription of it, and
 * `stagesMatchDatabase` in the spec asserts they have not drifted.
 */

/**
 * The 19 stages of `1.txt` §322-§360 plus `on_hold` from `02.txt` §29's board,
 * in the order the specification lists them.
 */
export const STAGES = [
  'complaint_received',
  'appointment_confirmed',
  'vehicle_received',
  'initial_inspection',
  'diagnosis_in_progress',
  'further_information_required',
  'solution_preparation',
  'quotation_preparation',
  'awaiting_customer_approval',
  'awaiting_deposit',
  'awaiting_parts',
  'authorized_to_start',
  'repair_in_progress',
  'specialist_consultation',
  'testing',
  'quality_control',
  'ready_for_collection',
  'completed',
  'warranty_follow_up',
  'on_hold',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * The lifecycle, as an adjacency map: from a stage, which stages may follow.
 *
 * ── HOW THE BYPASS IS PREVENTED ────────────────────────────────────────────
 *
 * §394 names four things that must not be skipped — approval, payment, parts,
 * quality control. This map is what makes skipping them structurally
 * impossible rather than a matter of policy:
 *
 *   · `quotation_preparation` leads ONLY to `awaiting_customer_approval`, so a
 *     priced job cannot start without being put to the customer.
 *   · nothing reaches `repair_in_progress` except `authorized_to_start`, and
 *     `authorized_to_start` is reachable only after approval / deposit / parts.
 *   · `testing` leads ONLY to `quality_control` (or back into repair), and
 *     `ready_for_collection` is reachable ONLY from `quality_control`. A car
 *     cannot be handed back without passing QC.
 *
 * A workshop that genuinely needs to skip one — a warranty job with no deposit,
 * a customer approving verbally — uses the override, which is authorized and
 * recorded. That is §394's own escape hatch, not a hole in this map.
 *
 * ⚠️ `on_hold` is deliberately ABSENT as a source. A held card resumes to the
 * stage it was holding at, which is read from `repair.job_card_stage_events` —
 * see `resumeTargetFor` in the service. A static list here would have to allow
 * every stage, which is precisely the bypass this map exists to prevent.
 */
export const STAGE_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  // Intake. `1.txt` §322 — the lifecycle opens here, from reception or from a
  // customer's own complaint.
  complaint_received: ['appointment_confirmed', 'vehicle_received', 'on_hold'],
  appointment_confirmed: ['vehicle_received', 'on_hold'],
  vehicle_received: ['initial_inspection', 'on_hold'],

  // Inspection and diagnosis.
  initial_inspection: [
    'diagnosis_in_progress',
    'further_information_required',
    'solution_preparation',
    'on_hold',
  ],
  diagnosis_in_progress: [
    'further_information_required',
    'specialist_consultation',
    'solution_preparation',
    'on_hold',
  ],
  // Back to the bench, or onward once the missing information arrives.
  further_information_required: [
    'initial_inspection',
    'diagnosis_in_progress',
    'solution_preparation',
    'on_hold',
  ],

  // Solution and price.
  solution_preparation: ['quotation_preparation', 'specialist_consultation', 'on_hold'],
  // THE APPROVAL GATE: the only way out is to ask the customer.
  quotation_preparation: ['awaiting_customer_approval', 'on_hold'],
  // The customer may approve (onward), or ask for changes (back to solution).
  awaiting_customer_approval: [
    'awaiting_deposit',
    'awaiting_parts',
    'authorized_to_start',
    'solution_preparation',
    'on_hold',
  ],
  awaiting_deposit: ['awaiting_parts', 'authorized_to_start', 'on_hold'],
  awaiting_parts: ['authorized_to_start', 'on_hold'],

  // Execution. `authorized_to_start` is the single door into repair work.
  authorized_to_start: ['repair_in_progress', 'on_hold'],
  repair_in_progress: [
    'testing',
    'specialist_consultation',
    // A part can fail mid-repair; that is a return to a waiting state, not a
    // bypass of one.
    'awaiting_parts',
    'on_hold',
  ],
  specialist_consultation: [
    'diagnosis_in_progress',
    'solution_preparation',
    'repair_in_progress',
    'on_hold',
  ],

  // THE QUALITY GATE.
  testing: ['quality_control', 'repair_in_progress', 'on_hold'],
  // §50 gives the QC inspector "rejection and approval": rejection sends the
  // job back to the bench or to re-test, approval releases it.
  quality_control: ['ready_for_collection', 'repair_in_progress', 'testing', 'on_hold'],

  ready_for_collection: ['completed', 'on_hold'],
  completed: ['warranty_follow_up'],
  // Terminal. A warranty claim on a closed job opens a NEW card — `1.txt`
  // §322's lifecycle is per-visit, and reopening this one would overwrite the
  // history of the original repair.
  warranty_follow_up: [],

  // See the note above: resolved from history, never from this list.
  on_hold: [],
};

/**
 * Which stages each role may move a card INTO — `07.txt` pt2 §50, the
 * "ROLE-BASED CONTROL SUMMARY", which closes with: "No user shall receive
 * functions outside the user's approved role and branch."
 *
 * Read as: the verbs §50 gives a role, expressed as the stages those verbs
 * produce. A role absent from this map may not change a stage at all — which is
 * the case for `customer`, who opens a complaint (`2.txt` §537) and does not
 * drive the workshop's internal workflow.
 */
export const ROLE_TARGET_STAGES: Record<string, readonly Stage[]> = {
  // "Full workshop governance" — and the role that carries the override.
  workshop_owner: STAGES,
  // "Daily operational control, assignment, workflow and performance access."
  workshop_manager: STAGES,
  // Present for the same reason it is present everywhere else: it is the role
  // the platform's own administrators hold, and every other service admits it.
  platform_administrator: STAGES,

  // "Customer, vehicle, complaint, appointment, intake, invoice and RELEASE
  // functions." Reception books the car in and hands it back; it does not
  // diagnose, price, or pass quality control.
  reception_staff: [
    'complaint_received',
    'appointment_confirmed',
    'vehicle_received',
    'completed',
    'on_hold',
  ],

  // "Technical review, repair-plan approval, testing and quality oversight."
  workshop_supervisor: [
    'initial_inspection',
    'diagnosis_in_progress',
    'further_information_required',
    'solution_preparation',
    'quotation_preparation',
    'specialist_consultation',
    'authorized_to_start',
    'repair_in_progress',
    'testing',
    'quality_control',
    'on_hold',
  ],

  /**
   * "ASSIGNED-JOB inspection, diagnosis, repair planning, execution and
   * testing."
   *
   * ⚠️ THE ABSENCES ARE THE REQUIREMENT. §394 forbids a technician bypassing
   * "approval, payment, parts or quality-control states", so this list excludes
   * every one of them: no `awaiting_customer_approval`, no `awaiting_deposit`,
   * no `awaiting_parts`, no `authorized_to_start` (authorising their own work is
   * the bypass), no `quality_control`, no `ready_for_collection`, no
   * `completed`. A technician does the work and hands it on.
   *
   * "Assigned-job" is enforced separately and structurally: `findById` already
   * narrows a technician to cards assigned to them, so a technician cannot
   * even READ a card they are not on, let alone move it.
   */
  technician: [
    'initial_inspection',
    'diagnosis_in_progress',
    'further_information_required',
    'solution_preparation',
    'specialist_consultation',
    'repair_in_progress',
    'testing',
    'on_hold',
  ],

  // "Independent testing, quality review, REJECTION AND APPROVAL." Rejection is
  // `repair_in_progress`/`testing`; approval is `ready_for_collection`.
  quality_control_inspector: [
    'testing',
    'quality_control',
    'repair_in_progress',
    'ready_for_collection',
    'on_hold',
  ],

  // "Parts catalogue, inventory, reservation, issue, return and procurement
  // support." The storekeeper is who knows a part has arrived.
  storekeeper: ['awaiting_parts', 'authorized_to_start', 'on_hold'],

  // "Invoice review, payment collection and receipt generation." The cashier is
  // who knows a deposit has been paid.
  cashier: ['awaiting_deposit', 'authorized_to_start', 'on_hold'],
};

/**
 * Who may make a transition the lifecycle does not allow.
 *
 * §394 permits a bypass only via "an AUTHORIZED, logged override", so the
 * authority is named rather than assumed. Deliberately governance roles only —
 * a supervisor may run the technical workflow but cannot declare that quality
 * control did not need to happen.
 *
 * The override relaxes rule 1 (the lifecycle) and NEVER rule 2 (the role's own
 * stages) — those are the same set for all three roles here, so the point is
 * theoretical today, but the service enforces it in that order so it stays true
 * if this list ever grows.
 */
export const CAN_OVERRIDE_STAGE = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
]);

/**
 * Where a card at `fromStage` may go next — THE SINGLE AUTHORITY, used by both
 * the write path (`changeStage`, which validates) and the read path (which tells
 * the board which options to offer).
 *
 * Pure on purpose. The two callers get the answer from different places —
 * `changeStage` reads the resume stage inside its locked transaction, the list
 * gets it from a LATERAL join — and if they each did their own reasoning the
 * board would eventually offer a move the service refuses, which reads to the
 * user as the app being broken.
 *
 * `resumeStage` is the stage a HELD card was at before the hold, from
 * `repair.job_card_stage_events`. Null/absent means no history, and the safe
 * answer is then "nowhere without an override" rather than "anywhere" — see the
 * note on `on_hold` in `STAGE_TRANSITIONS`.
 */
export function permittedTargetsFrom(
  fromStage: Stage,
  resumeStage?: Stage | null,
): Stage[] {
  if (fromStage !== 'on_hold') return [...STAGE_TRANSITIONS[fromStage]];
  if (!resumeStage) return [];

  // ⚠️ A STAGE VALUE FROM THE DATABASE IS NOT AUTOMATICALLY A KEY OF THIS MAP
  // (Codex review of this slice, MEDIUM, accepted). `resumeStage` is read from
  // `repair.job_card_stage_events`, and until migration 009 that column was
  // plain TEXT with no CHECK. One unrecognised value made the spread below
  // `...undefined`, which THROWS — a 500 on the staging board caused by a single
  // bad history row, for every viewer, until the row was found.
  //
  // 009 constrains the column so such a row cannot be written. This guard
  // handles a row that predates it, and returns the safe answer — nowhere
  // without an override — rather than crashing or, worse, guessing.
  if (!(resumeStage in STAGE_TRANSITIONS)) return [];
  // Resuming, plus wherever that stage could itself go: a job held during
  // diagnosis may come back to diagnosis or move on to solution preparation.
  // The hold cost time, it did not undo the work.
  return [resumeStage, ...STAGE_TRANSITIONS[resumeStage]].filter((s) => s !== 'on_hold');
}

/**
 * What THIS viewer may actually choose: the lifecycle's options narrowed to the
 * stages their role may produce.
 *
 * ⚠️ THIS IS A CONVENIENCE FOR THE UI, NEVER A CONTROL. It exists so the board
 * does not offer a move that will be refused. `changeStage` re-derives both
 * halves server-side on every call, because a `<select>` is a suggestion and
 * anyone can POST whatever they like (CLAUDE.md §8 — hidden is not secure).
 */
export function stageOptionsFor(
  role: string,
  fromStage: Stage,
  resumeStage?: Stage | null,
): Stage[] {
  const roleStages = ROLE_TARGET_STAGES[role];
  if (!roleStages) return [];
  return permittedTargetsFrom(fromStage, resumeStage).filter((s) => roleStages.includes(s));
}

/** Stages that mean the workshop is waiting on someone outside it. */
export function isWaitingStage(stage: string): boolean {
  return stage.startsWith('awaiting_') || stage === 'further_information_required';
}

/**
 * `02.txt` §29's recommended board columns, in its order.
 *
 * NOT every stage: §29 lists 14 columns while the lifecycle has 20 stages, so
 * some stages share a column and some (`warranty_follow_up`) do not appear at
 * all. Exported from here so the board and the rules cannot disagree about
 * where a card belongs.
 */
export const BOARD_COLUMNS: ReadonlyArray<{ key: string; label: string; stages: readonly Stage[] }> = [
  { key: 'received', label: 'Received', stages: ['complaint_received', 'appointment_confirmed', 'vehicle_received'] },
  { key: 'initial_inspection', label: 'Initial Inspection', stages: ['initial_inspection'] },
  { key: 'diagnosis', label: 'Diagnosis', stages: ['diagnosis_in_progress', 'further_information_required'] },
  { key: 'solution_preparation', label: 'Solution Preparation', stages: ['solution_preparation', 'quotation_preparation'] },
  // §29 lists "Awaiting Internal Review" as a column. The lifecycle's nearest
  // stage is `specialist_consultation` (`1.txt` §322-§360) — a job parked with
  // someone senior before it goes further. Named as §29 names it.
  { key: 'awaiting_internal_review', label: 'Awaiting Internal Review', stages: ['specialist_consultation'] },
  { key: 'awaiting_customer_approval', label: 'Awaiting Customer Approval', stages: ['awaiting_customer_approval'] },
  { key: 'awaiting_deposit', label: 'Awaiting Deposit', stages: ['awaiting_deposit'] },
  { key: 'awaiting_parts', label: 'Awaiting Parts', stages: ['awaiting_parts'] },
  { key: 'authorized_to_start', label: 'Authorized to Start', stages: ['authorized_to_start'] },
  { key: 'repair_in_progress', label: 'Repair in Progress', stages: ['repair_in_progress'] },
  { key: 'testing', label: 'Testing', stages: ['testing'] },
  { key: 'quality_control', label: 'Quality Control', stages: ['quality_control'] },
  { key: 'ready_for_collection', label: 'Ready for Collection', stages: ['ready_for_collection'] },
  { key: 'completed', label: 'Completed', stages: ['completed', 'warranty_follow_up'] },
  { key: 'on_hold', label: 'On Hold', stages: ['on_hold'] },
];
