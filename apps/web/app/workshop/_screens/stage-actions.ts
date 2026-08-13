'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Moving a job card along the staging board — `02.txt` §29.
 *
 * IN ITS OWN `'use server'` MODULE, the same discipline as `register-actions.ts`
 * and for the same reason: a module whose first line is `'use server'` cannot
 * become a client module without someone deleting that line on purpose, so the
 * access token handling below cannot drift into the browser.
 *
 * ⚠️ THIS IS NOT THE AUTHORIZATION POINT, and on this screen that matters more
 * than usual. `02.txt` §29 says "drag-and-drop movement shall not bypass
 * business rules — THE BACKEND SHALL VALIDATE EVERY STAGE CHANGE", and a server
 * action is a public HTTP endpoint that Next exposes one of per action. Anyone
 * can call this directly with any `toStage` they like. Every rule that matters
 * lives in `JobCardService.changeStage`: the role's permitted stages
 * (`07.txt` pt2 §50), the lifecycle transitions, and the authorized-and-logged
 * override (`1.txt` §394). The board only decides what to OFFER.
 */

/**
 * The API's own sentence is passed through for `invalid` and `forbidden`, and
 * this is a deliberate departure from `register-actions.ts`, which replaces the
 * `forbidden` text.
 *
 * There, a refusal meant "your account cannot register customers" — the person
 * can do nothing with the detail, and naming the missing permission would
 * publish the authorization model to whoever probed it. Here the refusal is
 * about the CARD, not the viewer's standing: "a job card at 'testing' may not
 * move to 'ready_for_collection'. Permitted: quality_control, ..." tells a
 * supervisor exactly which move to make instead. It describes the lifecycle,
 * which is printed on the wall of the workshop, not a secret.
 */
function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      return message ?? 'That move was not accepted.';
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then retry.';
    case 'notFound':
      // Also what a technician gets for a card that is not theirs — the service
      // answers 404 rather than 403 so this is not an existence oracle.
      return 'That job card is no longer available to you. Reload the board.';
    default:
      return 'The service did not respond. The job card has not moved — try again shortly.';
  }
}

const BOARD_ROUTES = [
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
  '/home/my-assigned-work',
];

export async function changeStageAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('jobCardId') ?? '').trim();
  const toStage = String(formData.get('toStage') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const overrideReason = String(formData.get('overrideReason') ?? '').trim();

  if (!id || !toStage) {
    return { error: 'Choose a stage to move this job card to.' };
  }

  const result = await apiPatch<{ jobNumber: string; stage: string }>(
    'workshop',
    `/job-cards/${id}/stage`,
    {
      toStage,
      // Omitted rather than sent empty: the API treats '' as unset anyway, but
      // sending a blank override reason would look like an override attempt.
      note: note === '' ? undefined : note,
      overrideReason: overrideReason === '' ? undefined : overrideReason,
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  // Every surface that shows a stage, not just the board: the same card is on
  // the job card list and on a technician's assigned work, and leaving those
  // stale is how two screens disagree about where a car is.
  for (const route of BOARD_ROUTES) revalidatePath(route);

  return { created: `${result.data.jobNumber} moved` };
}
