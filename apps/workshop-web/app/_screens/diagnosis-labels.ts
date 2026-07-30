/**
 * Diagnosis labels — shared by the server screens and the client forms.
 *
 * ⚠️ A SEPARATE, PURE MODULE ON PURPOSE, the same discipline as
 * `inspection-labels.ts`. `diagnosis-sheet-screen.tsx` is an async server
 * component; a `'use client'` form importing a constant out of it would drag that
 * module — and everything it imports, including the API client and its token
 * handling — into the client bundle.
 *
 * Nothing here imports anything. That is the property that makes it safe for both
 * sides.
 */

/** `02.txt` §1290's three standings, in the specification's order. */
export const FINDING_STATUS_ORDER = ['confirmed', 'suspected', 'excluded'] as const;

export type FindingStatusValue = (typeof FINDING_STATUS_ORDER)[number];

export const FINDING_STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  suspected: 'Suspected',
  excluded: 'Excluded',
};

/**
 * `StatusBadge` kinds for the three standings.
 *
 * `confirmed` is `blocked` (the strongest visual) because a confirmed fault is
 * what a repair plan and a customer charge are built from — it must not read as
 * "resolved". `suspected` is `attention`: an open question, not a fault.
 * `excluded` is `draft` (muted) — a real and useful record, deliberately quiet,
 * because a list where ruled-out faults shout as loudly as established ones is a
 * list nobody can read at a glance.
 */
export const FINDING_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  confirmed: 'blocked',
  suspected: 'attention',
  excluded: 'draft',
};

/**
 * `08.txt` §9's Fault Condition Library categories — `07.txt` §3032's affected
 * system.
 *
 * ⚠️ THIS LIST AND `AFFECTED_SYSTEMS` IN THE API ARE TWO STATEMENTS OF ONE RULE,
 * and the API's is checked against the migration by a drift test. This copy exists
 * because a client bundle cannot import from `apps/api`; it is the FORM's options,
 * and the server rejects anything not in its own list, so a drift here produces a
 * clear 400 rather than a wrong row.
 */
export const AFFECTED_SYSTEM_ORDER = [
  'electrical',
  'sensor_actuator',
  'network_module',
  'mechanical',
  'fluid_thermal',
  'other',
] as const;

export const AFFECTED_SYSTEM_LABEL: Record<string, string> = {
  electrical: 'Electrical',
  sensor_actuator: 'Sensor / actuator',
  network_module: 'Network / control module',
  mechanical: 'Mechanical',
  fluid_thermal: 'Fluid / thermal',
  other: 'Other',
};

/** The four diagnosis states, for the queue and the sheet header. */
export const DIAGNOSIS_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  submitted: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * `StatusBadge` kinds for the diagnosis itself.
 *
 * `submitted` is `attention` because it is WAITING ON SOMEBODY — a supervisor's
 * queue is the thing this badge has to surface. `rejected` is `blocked`: the
 * technician must act, and a muted rejection is one that gets missed.
 */
export const DIAGNOSIS_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  in_progress: 'draft',
  submitted: 'attention',
  approved: 'active',
  rejected: 'blocked',
};

/**
 * §1294 — how a finding's SOURCE is shown.
 *
 * Only rendered for `ai_suggestion`. There is no AI in this build, so every
 * finding today is a technician's; labelling each one "Technician" would be noise
 * that trains readers to ignore the field, which is the opposite of preserving the
 * distinction. When Phase 8 writes suggestions, they are the ones that stand out.
 */
export const FINDING_SOURCE_LABEL: Record<string, string> = {
  ai_suggestion: 'AI suggestion',
};
