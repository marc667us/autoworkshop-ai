/**
 * Inspection result labels — shared by the server sheet and the client form.
 *
 * ⚠️ A SEPARATE, PURE MODULE ON PURPOSE. `inspection-sheet-screen.tsx` is an
 * async server component; a `'use client'` form importing a constant from it
 * would drag that module — and everything it imports, including the API client
 * and its token handling — into the client bundle. That is the same failure
 * slice 2 paid for when a Playwright spec imported through the `next-shell`
 * barrel and pulled `next-auth` into a plain Node context: a constant is cheap,
 * but the module it lives in is not.
 *
 * Nothing here imports anything. That is the property that makes it safe for
 * both sides.
 */

/** §2968-§2976's four answers, in the specification's order. */
export const RESULT_ORDER = ['pass', 'fail', 'requires_testing', 'not_applicable'] as const;

export type InspectionResultValue = (typeof RESULT_ORDER)[number];

export const RESULT_LABEL: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  requires_testing: 'Requires testing',
  not_applicable: 'Not applicable',
};

/**
 * `StatusBadge` kinds for the four results.
 *
 * `requires_testing` is `attention`, not `blocked`: it is not a fault, it is an
 * open question — and `2.txt` §557 has both it and `fail` driving the diagnostic
 * report and the preliminary quotation, so neither may render as though nothing
 * was found. `not_applicable` is `draft` (muted) because it is a deliberate
 * non-answer, and `pass` is the only one that means "checked and fine".
 */
export const RESULT_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  pass: 'active',
  fail: 'blocked',
  requires_testing: 'attention',
  not_applicable: 'draft',
};
