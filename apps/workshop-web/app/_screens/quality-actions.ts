'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * The independent quality inspection — Phase 5 slice 9 (`2.txt` §563).
 *
 * ⚠️ NOT THE CONTROL, AND HERE THAT MATTERS MORE THAN USUAL. The independence
 * rule is enforced by `repair.user_worked_on_job_card()` and the
 * `trg_qc_independence` trigger, which refuse a self-inspection even if every
 * line of this file were deleted. What these actions do is carry the API's
 * SENTENCE back to the screen, so an inspector who worked on the car is told
 * that is why — rather than meeting a bare refusal.
 *
 * ⚠️ THE INSPECTOR IS NEVER SENT. It is `ctx.userId` on the server, resolved
 * from a validated token. A signature you can nominate is not a signature.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  // `forbidden` carries the API's own sentence — for QC that is either "you
  // worked on this repair and cannot carry out its quality inspection" or the
  // role refusal naming who can. Both tell the reader what to do next, which a
  // generic replacement would destroy.
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') return 'That repair is no longer available to inspect.';
  return 'The inspection could not be updated just now.';
}

/** Revalidates all three routes: the same screen is reachable from three trees. */
function revalidateAll(): void {
  for (const route of [
    '/repair-services/quality-control',
    '/repair-control/quality-control',
    '/repair-control/quality-control-queue',
  ]) {
    revalidatePath(route);
  }
}

export async function openInspectionAction(testSessionId: string): Promise<ActionOutcome> {
  const result = await apiPost<{ id: string }>('workshop', '/quality-inspections', {
    testSessionId,
  });
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidateAll();
  return {
    ok: true,
    message: 'Inspection started. Record what you found, then submit the result.',
  };
}

/**
 * Record the verdict.
 *
 * ⚠️ THE STATUS IS NOT SENT. §563 asks two questions and the verdict is their
 * conjunction — the API derives it, so a screen cannot record "the complaint was
 * not addressed" alongside "passed". `parseQualityDecision` ignores any `status`
 * a caller supplies, and migration 030's CHECK makes the pairing unreachable in
 * the database as well.
 *
 * The booleans are sent as the STRINGS the form produced. `Boolean('false')` is
 * TRUE, so coercing them here would turn "not addressed" into a pass before the
 * API ever saw it — the API enumerates the accepted values instead.
 */
export async function decideInspectionAction(
  inspectionId: string,
  form: FormData,
): Promise<ActionOutcome> {
  const result = await apiPatch<{ status: string }>(
    'workshop',
    `/quality-inspections/${inspectionId}`,
    {
      complaintAddressed: String(form.get('complaintAddressed') ?? ''),
      newDefectFound: String(form.get('newDefectFound') ?? ''),
      newDefectDescription: String(form.get('newDefectDescription') ?? ''),
      notes: String(form.get('notes') ?? ''),
    },
  );

  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidateAll();

  return {
    ok: true,
    message:
      result.data?.status === 'passed'
        ? 'Passed. The vehicle can move to ready for collection.'
        : 'Failed and recorded. The repair goes back to the workshop with your findings.',
  };
}
