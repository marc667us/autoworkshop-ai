/**
 * Post-repair testing rules — Phase 5, slice 8.
 *
 * `07.txt` §34-§36 is REPAIR TEST RESULTS, the POST-REPAIR DIAGNOSTIC SCAN and the
 * ROAD TEST FLOW; `1.txt` §388 puts testing results in Domain 5.
 *
 * ⚠️ MIGRATION 020 IS THE AUTHORITY ON EVERY LIST BELOW — each restates a SQL CHECK,
 * and `testing.spec.ts` compares them against the migration text.
 */

/** A session is written, then submitted for quality control. Slice 9 answers it. */
export const TEST_SESSION_STATUSES = ['in_progress', 'submitted'] as const;
export type TestSessionStatus = (typeof TEST_SESSION_STATUSES)[number];

/**
 * §34's eighteen categories, in the specification's order.
 *
 * Transcribed rather than grouped. A workshop reading "brake test" wants that phrase,
 * and inventing tidier super-categories would make the record disagree with the
 * document a technician was trained on.
 */
export const TEST_CATEGORIES = [
  'visual_inspection',
  'diagnostic_scan',
  'electrical',
  'battery',
  'charging_system',
  'starting_system',
  'pressure',
  'compression',
  'leak',
  'temperature',
  'brake',
  'steering',
  'suspension',
  'wheel_alignment',
  'tyre',
  'air_conditioning',
  'road_test',
  'emission',
] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number];

export const TEST_CATEGORY_LABEL: Record<string, string> = {
  visual_inspection: 'Visual inspection',
  diagnostic_scan: 'Diagnostic scan',
  electrical: 'Electrical test',
  battery: 'Battery test',
  charging_system: 'Charging-system test',
  starting_system: 'Starting-system test',
  pressure: 'Pressure test',
  compression: 'Compression test',
  leak: 'Leak test',
  temperature: 'Temperature test',
  brake: 'Brake test',
  steering: 'Steering test',
  suspension: 'Suspension test',
  wheel_alignment: 'Wheel alignment',
  tyre: 'Tyre test',
  air_conditioning: 'Air-conditioning test',
  road_test: 'Road test',
  emission: 'Emission test',
};

export function testCategoryLabel(value: string): string {
  return TEST_CATEGORY_LABEL[value] ?? value;
}

/**
 * §34: "Pass or fail."
 *
 * Exactly those two. A third value — "not applicable", "inconclusive" — would need a
 * meaning downstream that nobody has defined, and slice 9's inspector reading a list of
 * inconclusive results learns nothing. A test that could not be carried out is not
 * recorded, and its absence is itself visible.
 */
export const TEST_OUTCOMES = ['pass', 'fail'] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];

/**
 * §36's four road-test outcomes.
 *
 * `symptom_improved` is the one a boolean would lose, and it is the honest answer more
 * often than either extreme — a noise that is quieter is neither fixed nor unfixed, and
 * recording it as "resolved" is how a car comes back.
 */
export const ROAD_TEST_OUTCOMES = [
  'symptom_resolved',
  'symptom_improved',
  'symptom_remains',
  'new_symptom_observed',
] as const;
export type RoadTestOutcome = (typeof ROAD_TEST_OUTCOMES)[number];

export const ROAD_TEST_OUTCOME_LABEL: Record<string, string> = {
  symptom_resolved: 'The symptom is gone',
  symptom_improved: 'The symptom is better but still there',
  symptom_remains: 'The symptom is unchanged',
  new_symptom_observed: 'A new symptom appeared',
};

export function roadTestOutcomeLabel(value: string): string {
  return ROAD_TEST_OUTCOME_LABEL[value] ?? value;
}

/**
 * Roles that may RECORD test results — `07.txt` pt2 §50.
 *
 * §50 gives the technician "assigned-job inspection, diagnosis, repair planning,
 * execution and TESTING". The supervisor and above cover the bench.
 *
 * ⚠️ `quality_control_inspector` IS ABSENT, and this is the boundary the next slice
 * depends on. `2.txt` §563 requires the quality check to be INDEPENDENT of the work; an
 * inspector who could write the test results would be inspecting their own evidence.
 * They read this record — that is the whole of their involvement here.
 */
export const CAN_RECORD_TESTS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'technician',
]);

/**
 * Roles that may APPROVE releasing a car with a critical fault still present.
 *
 * ⚠️ NARROWER THAN THE SET THAT MAY TEST, and deliberately: §35 says a repair shall not
 * be marked technically complete with an unresolved critical fault "WITHOUT DOCUMENTED
 * APPROVAL", and an approval the technician can give themselves is not an approval. A
 * technician records the fault; somebody accountable decides the car may go.
 */
export const CAN_APPROVE_CRITICAL_OVERRIDE = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
]);

/**
 * Roles that may READ test results.
 *
 * The QC inspector is here because reading them is their job. Reception and the cashier
 * answer "is it ready", and the storekeeper sees which parts a failed test implicates.
 *
 * `customer` is ABSENT: the vehicle owner receives a completion report, not the raw
 * pass/fail sheet — `2.txt` §557's judgement, applied again.
 */
export const CAN_READ_TESTS = new Set([
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

/** §34 opens "after completing the repair". */
export const REQUIRED_EXECUTION_STATUS = 'completed';

/** The stage a card is at while its repair is being tested. */
export const TESTING_STAGES = ['repair_in_progress', 'testing'];
