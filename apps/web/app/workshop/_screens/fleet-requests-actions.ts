'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The workshop's response to a fleet's service request — ADR-023's other half.
 *
 * 🔴 THIS IS THE CALLER `PATCH /fleet/incoming-requests/:id` NEEDS IN ORDER TO
 * BE SHIPPED. A route with no caller is as unshipped as a caller with no route,
 * and this repository has recorded both directions.
 *
 * ⚠️ THE TRANSITION IS NOT VALIDATED HERE, DELIBERATELY. Migration 087's
 * party-aware trigger and the service's transition table both decide what a
 * workshop may do; a third copy of those rules in a server action would be a
 * third place for them to drift. What this does is pass the refusal through
 * intact, because it names the moves that ARE available.
 */
export async function respondToFleetRequestAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('requestId') ?? '').trim();
  if (!id) return { error: 'Nothing was selected. Reload the page and try again.' };

  const status = String(formData.get('status') ?? '').trim();
  if (!['accepted', 'declined', 'in_progress', 'completed'].includes(status)) {
    return { error: 'Choose accept, decline, start or complete.' };
  }

  const declineReason = String(formData.get('declineReason') ?? '').trim();
  // Checked here as well as by the API, 087's CHECK and the trigger, because
  // this one names the field a person left blank rather than a constraint. A
  // declined request the fleet cannot understand is a dead end.
  if (status === 'declined' && declineReason === '') {
    return { error: 'Say why you cannot take this work — the fleet sees only this.' };
  }

  const result = await apiPatch('workshop', `/fleet/incoming-requests/${id}`, {
    status,
    ...(declineReason ? { declineReason } : {}),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? // The API's own sentence — "A request that is submitted can be moved
          // to accepted or declined" — is the most useful thing on the screen.
          (result.message ?? 'That decision was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not answer fleet requests.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That request is no longer addressed to this workshop. Reload the page.'
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  // All three mounts of the reception screen render this panel.
  for (const p of [
    '/workshop/customer-reception/service-requests',
    '/workshop/requests/service-requests',
    '/workshop/requests-and-reception/service-requests',
  ]) {
    revalidatePath(p);
  }
  return { created: `Marked as ${status.replace('_', ' ')}.` };
}
