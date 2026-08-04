'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * §7 — the customer approves, declines or questions a repair proposal, themselves.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT SEND ────────────────────────────────────
 *
 * Not `decidedByName`, and not `decisionChannel`. Both are DERIVED by the API:
 * the name from the customer record the proposal hangs off, the channel from
 * the route (`customer_portal`). `CustomerProposalDecisionBody` does not admit
 * either, so Zod strips them if they ever appear.
 *
 * That is not tidiness. `decided_by_name` and `decision_channel` are the consent
 * record a disputed authorisation is settled from — sending them from the
 * browser would let a customer approve chargeable work under somebody else's
 * name, or file a portal approval as a telephone call no recording exists for.
 *
 * ⚠️ The screen never sends a proposal id the viewer did not receive from their
 * own list, and the API re-checks ownership anyway with a `c.user_id` predicate
 * inside the same statement that locks the row. The form is not the control.
 */
export async function decideProposalAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const proposalId = read('proposalId');
  if (!proposalId) return { error: 'Nothing was selected to answer. Reload the page and try again.' };

  const decision = read('decision');

  const result = await apiPost(`customer`, `/proposals/${proposalId}/customer-decision`, {
    decision,
    // Only when approving. Sending an option alongside a decline would be
    // recording a choice the customer did not make.
    approvedOption: decision === 'approved' ? read('approvedOption') : undefined,
    note: read('note'),
  });

  if (!result.ok) {
    const error =
      /*
        ⚠️ `invalid` COVERS 409 AS WELL AS 400 — see `ApiResult`. That matters
        here because the two most likely refusals on this route are conflicts:
        "this proposal has not been sent to you yet" and "you already answered
        version 2". Both arrive as `invalid` CARRYING THE API'S OWN SENTENCE,
        which is far more use than anything invented in the browser.

        A `result.reason === 'conflict'` branch was written first and DELETED:
        no such reason exists, so it could never have run, and a real 409 would
        have fallen through to "the service did not respond" — telling the
        customer the system was broken when it had in fact answered clearly.
      */
      result.reason === 'invalid'
        ? (result.message ??
          'That answer was not accepted. If you are declining or asking for changes, please say why.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your account may not answer this proposal.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That proposal is no longer available. Reload the page.'
              : 'The service did not respond. Nothing has been sent — try again shortly.';
    return { error };
  }

  // Every customer screen that shows the state of a repair, because a decision
  // moves the job card as well as the proposal. Revalidating only this page
  // would leave the dashboard and the tracking list showing the old stage.
  for (const path of [
    '/service-and-repairs/repair-proposals',
    '/service-and-repairs/repair-tracking',
    '/service-and-repairs/service-requests',
    '/home/dashboard',
  ]) {
    revalidatePath(path);
  }

  return {
    created:
      decision === 'approved'
        ? 'Approved. The workshop has been told and will start the work.'
        : decision === 'declined'
          ? 'Declined. The workshop has been told.'
          : 'Sent. The workshop will come back to you.',
  };
}
