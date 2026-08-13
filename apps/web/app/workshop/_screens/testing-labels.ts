/**
 * Testing labels — shared by the server screens and the client forms.
 *
 * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
 * form importing a constant out of a server screen would drag that module — and its API
 * client and token handling — into the browser bundle.
 */

export const TEST_SESSION_STATUS_LABEL: Record<string, string> = {
  in_progress: 'Being recorded',
  submitted: 'With quality control',
};

export const TEST_SESSION_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  in_progress: 'draft',
  submitted: 'attention',
};

/** §34's eighteen categories, in the specification's order. */
export const TEST_CATEGORY_ORDER = [
  'visual_inspection', 'diagnostic_scan', 'electrical', 'battery',
  'charging_system', 'starting_system', 'pressure', 'compression',
  'leak', 'temperature', 'brake', 'steering', 'suspension',
  'wheel_alignment', 'tyre', 'air_conditioning', 'road_test', 'emission',
] as const;

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

/** §36's four outcomes. `symptom_improved` is the one a boolean would lose. */
export const ROAD_TEST_OUTCOME_ORDER = [
  'symptom_resolved', 'symptom_improved', 'symptom_remains', 'new_symptom_observed',
] as const;

export const ROAD_TEST_OUTCOME_LABEL: Record<string, string> = {
  symptom_resolved: 'The symptom is gone',
  symptom_improved: 'The symptom is better but still there',
  symptom_remains: 'The symptom is unchanged',
  new_symptom_observed: 'A new symptom appeared',
};

/**
 * A pass reads as `active`, a failure as `blocked`.
 *
 * A failed test is not an error state — it is a RESULT, and quality control decides what
 * to do about it. But it must be impossible to skim past, which is why it carries the
 * strongest badge rather than a muted one.
 */
export const OUTCOME_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  pass: 'active',
  fail: 'blocked',
};

export const OUTCOME_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail' };
