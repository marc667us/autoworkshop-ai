'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * The repair variation flow — Phase 5 slice 7b (`07.txt` §14, §3766 step 12).
 *
 * ⚠️ NOT THE CONTROL, and on this screen that matters more than usual because
 * the rule is about MONEY. Migrations 032-034 refuse an authorisation without an
 * approval, a lifecycle that skips internal review, a review by the person who
 * raised it, and any edit to the cost once the customer has been asked. These
 * actions carry the API's SENTENCE back so a technician is told which rule
 * stopped them rather than meeting a bare refusal.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') return 'That variation is no longer available.';
  return 'The variation could not be updated just now.';
}

/** All four routes: the same screen is reachable from four trees. */
function revalidateAll(): void {
  for (const route of [
    '/solution-and-approval/variations',
    '/repair-control/variations',
    '/record-work/variation-requests',
  ]) {
    revalidatePath(route);
  }
}

/** §3764 step 11 — the technician found more work. */
export async function raiseVariationAction(
  executionId: string,
  form: FormData,
): Promise<ActionOutcome> {
  const result = await apiPost<{ id: string }>('workshop', '/variations', {
    executionId,
    newFinding: String(form.get('newFinding') ?? ''),
    additionalWork: String(form.get('additionalWork') ?? ''),
    additionalParts: String(form.get('additionalParts') ?? ''),
    additionalLabourHours: String(form.get('additionalLabourHours') ?? ''),
    // ⚠️ SENT AS THE RAW STRING. `Number('')` is 0, so coercing here would turn a
    // cleared cost field into a FREE variation — which skips the chargeable
    // consent rules entirely and lets the work proceed with no signature against
    // it. The API refuses the empty string instead.
    additionalCost: String(form.get('additionalCost') ?? ''),
    currency: String(form.get('currency') ?? 'GHS'),
    effectOnCompletion: String(form.get('effectOnCompletion') ?? ''),
  });

  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidateAll();
  return {
    ok: true,
    message:
      'Raised. It must be reviewed internally before the customer sees it, and no chargeable ' +
      'work may start until they approve.',
  };
}

/** §3792 — reviewed internally, and optionally sent to the customer at once. */
export async function reviewVariationAction(
  variationId: string,
  send: boolean,
): Promise<ActionOutcome> {
  const result = await apiPatch<{ status: string }>(
    'workshop',
    `/variations/${variationId}/review`,
    { send },
  );
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidateAll();
  return {
    ok: true,
    message: send
      ? 'Reviewed and sent to the customer. Record their answer when you have it.'
      : 'Reviewed. Send it to the customer when you are ready.',
  };
}

/**
 * Record the customer's answer.
 *
 * ⚠️ THE CUSTOMER IS OFTEN NOT A SYSTEM USER — they answer the phone. So their
 * NAME and the CHANNEL are what carry the consent, and a chargeable approval is
 * refused without both. That refusal is the API's and the database's; this only
 * relays it.
 */
export async function decideVariationAction(
  variationId: string,
  form: FormData,
): Promise<ActionOutcome> {
  const decision = String(form.get('decision') ?? '');
  const result = await apiPatch<{ status: string; workAuthorized: boolean }>(
    'workshop',
    `/variations/${variationId}/decision`,
    {
      decision,
      decidedByName: String(form.get('decidedByName') ?? ''),
      decisionChannel: String(form.get('decisionChannel') ?? ''),
      decisionNote: String(form.get('decisionNote') ?? ''),
    },
  );

  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidateAll();

  if (decision === 'approved') {
    return {
      ok: true,
      message: 'Approved and recorded. The additional work is now authorised.',
    };
  }
  if (decision === 'modified') {
    return {
      ok: true,
      message:
        'Recorded. The variation is back to draft — rewrite it and it goes round the review ' +
        'and approval again.',
    };
  }
  return { ok: true, message: 'Rejected and recorded, with the reason.' };
}
