/**
 * Presentation logic for job-card stages — deliberately NOT inside the screen
 * component.
 *
 * Two reasons, and the second is the load-bearing one:
 *
 *   1. It is pure. A function that maps `initial_inspection` to
 *      "Initial inspection" has no business being re-declared on every render.
 *   2. IT IS TESTABLE WITHOUT A RENDERER. These functions exist to stop the
 *      screen crashing on data shaped differently from what it expected, so
 *      they are exactly the part that must be tested — and a spec importing the
 *      `.tsx` could not be parsed by vitest without adding a JSX transform to
 *      the test setup. Moving the logic is a better answer than teaching the
 *      test runner to parse a component it never needed to render.
 */

export interface JobCardDetail {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  mileageAtIntake: number | null;
  openedAt: string;
  stageChangedAt: string;
  closedAt: string | null;
  /**
   * 🔴 `allowedStages`, AND THE NAME MATTERS. This was first written as
   * `stageOptions`, which the API does not return. Nothing would have thrown:
   * `normaliseOptions(undefined)` yields an empty list and the screen renders
   * its "your role cannot move this job from its current stage" message — a
   * fluent, confident, completely false explanation shown to every user
   * including the ones who could move it. Verified against
   * `JobCard.allowedStages` in `apps/api/src/repair/job-card.service.ts`.
   */
  allowedStages?: Array<{ value: string; label?: string }> | string[];
}

/** Stage identifiers are `snake_case`; a person should not have to read that. */
export function humanStage(stage: string): string {
  const words = stage.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `allowedStages` has been seen as both a list of strings and a list of
 * `{value,label}`. Rather than guess, both are accepted and normalised — a
 * screen that crashed on the shape it did not expect would be a worse failure
 * than one that renders either.
 */
export function normaliseOptions(
  options: JobCardDetail['allowedStages'],
): Array<{ value: string; label: string }> {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) =>
      typeof o === 'string'
        ? { value: o, label: humanStage(o) }
        : { value: o.value, label: o.label ?? humanStage(o.value) },
    )
    .filter((o) => typeof o.value === 'string' && o.value.length > 0);
}

/**
 * WHY THERE ARE NO BUTTONS — and the four answers are genuinely different.
 *
 * 🔴 RAISED BY CODEX, AND IT IS THE SAME DEFECT CLASS AS THE FIELD-NAME BUG ONE
 * STEP REMOVED. The screen used to say "your role cannot move this job" whenever
 * the option list came back empty. That sentence is a claim about PERMISSION,
 * but an empty list is also what a missing field, a renamed field or a malformed
 * payload produces — so a contract break would have told every user, including
 * a workshop owner, something confident and false about their own access.
 *
 * Distinguishing them costs one function and means the app can never again
 * explain a bug as a permission rule.
 */
export type StageAvailability =
  | { kind: 'options'; options: Array<{ value: string; label: string }> }
  | { kind: 'closed' }
  | { kind: 'noMoves' }
  | { kind: 'unavailable' };

export function stageAvailability(card: {
  allowedStages?: JobCardDetail['allowedStages'];
  closedAt?: string | null;
}): StageAvailability {
  // A closed job has no next stage regardless of who is looking, so this is
  // checked first and is the one answer that is about the JOB.
  if (card.closedAt) return { kind: 'closed' };

  // The field is absent or not a list: the app and the API disagree. Say that,
  // rather than inventing a reason about the user.
  if (!Array.isArray(card.allowedStages)) return { kind: 'unavailable' };

  const options = normaliseOptions(card.allowedStages);
  if (options.length === 0) {
    // A present-but-empty list IS the server's answer: no moves are available
    // to this viewer from this stage.
    return { kind: 'noMoves' };
  }
  return { kind: 'options', options };
}
