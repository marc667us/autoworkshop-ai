/**
 * The initial-inspection checklist — Phase 5, slice 3a.
 *
 * `07.txt` §2920-§2978 is the INITIAL INSPECTION FLOW. §2926 says "the
 * application loads the relevant inspection checklist" and §2928 then lists the
 * checkpoints; §2968 lists the four answers. Both are transcribed here in the
 * order the specification gives them, not paraphrased, because this list is what
 * a technician signs their name to and what a customer is later shown.
 *
 * `2.txt` §555 calls the checklists CONFIGURABLE ("engine systems, transmission,
 * suspension, braking, tires, electrical systems, electronics, body condition,
 * paint condition, interior condition, air conditioning and safety systems").
 * Per-organisation templates are a later slice — they need a template table, an
 * editor, and a rule for what happens to inspections already in progress when a
 * template changes. What is built now is the §2928 default, and the schema is
 * ready for it: `repair.inspection_items` stores the checkpoint code AND its
 * position as asked, so a future template cannot rewrite the meaning of a
 * historical inspection.
 */

/**
 * §2968-§2976 — "The technician records: Pass. Fail. Requires testing. Not
 * applicable."
 *
 * ⚠️ `not_applicable` IS ONE OF THE FOUR ANSWERS, and that is why an unanswered
 * checkpoint is a genuine incompleteness rather than a shrug. A technician who
 * cannot assess the air conditioning on a stripped car says so, attributably.
 * Without it, the only way past an irrelevant checkpoint would be to record a
 * `pass` that never happened.
 */
export const INSPECTION_RESULTS = ['pass', 'fail', 'requires_testing', 'not_applicable'] as const;

export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/** The two results that mean the inspection FOUND something (`2.txt` §557). */
export const FINDING_RESULTS: readonly InspectionResult[] = ['fail', 'requires_testing'];

export interface Checkpoint {
  /** Stored in `repair.inspection_items.checkpoint_code`. */
  code: string;
  /** What the technician reads on the sheet — §2928's own wording. */
  label: string;
}

/**
 * §2930-§2966 — the 19 checkpoints, in specification order.
 *
 * ⚠️ THE ORDER IS PART OF THE TRANSCRIPTION. It is the order a technician works
 * around a vehicle — identification and mileage at the door, then under the
 * bonnet, then the road-safety systems, then the body — and re-sorting it
 * alphabetically for tidiness would make the sheet slower to complete and
 * disagree with the paper process every workshop already runs.
 */
export const INSPECTION_CHECKPOINTS: readonly Checkpoint[] = [
  { code: 'vehicle_identification', label: 'Vehicle identification' },
  { code: 'mileage', label: 'Mileage' },
  { code: 'engine_condition', label: 'Engine condition' },
  { code: 'fluid_levels', label: 'Fluid levels' },
  { code: 'leaks', label: 'Leaks' },
  { code: 'battery_condition', label: 'Battery condition' },
  { code: 'charging_condition', label: 'Charging condition' },
  { code: 'starting_condition', label: 'Starting condition' },
  { code: 'warning_lights', label: 'Warning lights' },
  { code: 'brakes', label: 'Brakes' },
  { code: 'steering', label: 'Steering' },
  { code: 'suspension', label: 'Suspension' },
  { code: 'tyres', label: 'Tyres' },
  { code: 'lighting', label: 'Lighting' },
  { code: 'electrical_accessories', label: 'Electrical accessories' },
  { code: 'air_conditioning', label: 'Air conditioning' },
  { code: 'exhaust', label: 'Exhaust' },
  { code: 'body_condition', label: 'Body condition' },
  { code: 'roadworthiness_concerns', label: 'Roadworthiness concerns' },
];

const CHECKPOINT_CODES = new Set(INSPECTION_CHECKPOINTS.map((c) => c.code));

/** Whether a code names a checkpoint on the current template. */
export function isCheckpointCode(code: string): boolean {
  return CHECKPOINT_CODES.has(code);
}

/**
 * The label for a stored code — including one no longer on the template.
 *
 * A submitted inspection keeps rows for the checkpoints it actually asked, so a
 * retired code must still render. Falling back to the code itself is deliberate:
 * it is ugly and truthful, where inventing a label or dropping the row would
 * quietly shorten a historical inspection sheet.
 */
export function checkpointLabel(code: string): string {
  return INSPECTION_CHECKPOINTS.find((c) => c.code === code)?.label ?? code;
}

/**
 * Roles that may RECORD an inspection — `07.txt` pt2 §50.
 *
 * `technician`: "ASSIGNED-JOB inspection, diagnosis, repair planning, execution
 * and testing." Assignment is enforced separately and structurally — the service
 * reaches the job card through `JobCardService`'s scoping, which already narrows
 * a technician to cards assigned to them, so a technician cannot open an
 * inspection on a card they cannot even read.
 *
 * `workshop_supervisor`: "technical review, repair-plan approval, testing and
 * quality oversight" — §390's "supervisor inspection" is a later slice, but a
 * supervisor covering a bench is ordinary workshop reality and §50 puts the
 * technical workflow under them.
 *
 * ⚠️ THE ABSENCES:
 *   · `reception_staff` — §50 scopes them to "customer, vehicle, complaint,
 *     appointment, intake, invoice and release". Reception books the car in; the
 *     mileage they copy at the door is `mileage_at_intake` on the card, NOT an
 *     inspection finding.
 *   · `quality_control_inspector` — §50 gives them INDEPENDENT testing and
 *     quality review. Letting them record the initial inspection would put the
 *     same person on both sides of the check §563 requires to be independent.
 *     They read inspections; they do not write them.
 *   · `customer` — reports a complaint (`2.txt` §537) and is never a party to the
 *     workshop's technical record.
 */
export const CAN_RECORD_INSPECTION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'technician',
]);

/**
 * Roles that may READ an inspection.
 *
 * Wider than the write set and narrower than "everyone": the storekeeper needs
 * the failures to know what to order, the cashier and reception need to know
 * what the job covers, and the QC inspector reads the initial sheet to check the
 * original complaint was addressed (`2.txt` §563).
 *
 * `customer` is ABSENT, and that is a decision rather than an omission. `2.txt`
 * §557 has inspection findings reaching the customer as a DIAGNOSTIC REPORT and
 * a preliminary quotation — a prepared document, in the workshop's words, after
 * review. The raw sheet contains a technician's working notes on a vehicle they
 * are still assessing, and publishing it directly would put "requires testing"
 * in front of a customer as though it were a finding. The customer's view
 * arrives with the report that §557 asks for.
 */
export const CAN_READ_INSPECTION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'quality_control_inspector',
  'technician',
  'reception_staff',
  'storekeeper',
  'cashier',
]);

/**
 * The stage a job card must be at for an inspection to be STARTED.
 *
 * §2922-§2924: "the technician opens the assigned job. The technician selects
 * 'Start Inspection.'" — the flow begins from a job already at inspection, which
 * in this lifecycle means the vehicle is present: `STAGE_TRANSITIONS` only
 * reaches `initial_inspection` from `vehicle_received` or from
 * `further_information_required`.
 *
 * ⚠️ WHY THIS IS ENFORCED RATHER THAN LEFT OPEN. Without it, an inspection could
 * be recorded against a card at `complaint_received` — a vehicle that has not
 * arrived at the workshop. That is not a harmless early start; it is a signed
 * statement about the condition of a car nobody has seen, and it is exactly the
 * kind of record that later justifies a charge.
 *
 * A second look is not blocked by this: the lifecycle allows
 * `further_information_required → initial_inspection`, so a re-inspection means
 * moving the card back and starting a NEW attempt — which is what slice 2's
 * rules already govern and log.
 */
export const INSPECTION_START_STAGE = 'initial_inspection';
