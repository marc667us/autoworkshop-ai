'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Preparing, issuing and answering a customer proposal — `1.txt` §396-§424, `07.txt` §7.
 *
 * IN ITS OWN `'use server'` MODULE, so the access-token handling inside `apiPost`
 * cannot drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Every rule lives in `ProposalService`: who may issue
 * a proposal, who may record a decision, that the quotation behind it is APPROVED, and
 * §424's immutability — an approved proposal cannot be edited, only superseded by a new
 * version.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence, because these refusals are instructions — they name
      // §424 and say to prepare a new version rather than edit this one.
      return message ?? 'That was not accepted.';
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
      return 'That record is no longer available to you. Reload the page.';
    default:
      return 'The service did not respond. Nothing was recorded — try again shortly.';
  }
}

const PROPOSAL_ROUTES = [
  '/solution-and-approval/customer-proposals',
  '/repair-control/customer-approval',
  '/customer-approval/pending-approvals',
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
];

function revalidateAll(): void {
  for (const r of PROPOSAL_ROUTES) revalidatePath(r);
}

function clearable(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? '').trim();
  return v === '' ? null : v;
}

/** Draft a proposal, or §424's new VERSION of one. */
export async function prepareProposalAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) return { error: 'Choose a job card.' };

  const result = await apiPost<{ id: string; jobNumber: string; versionNo: number }>(
    'workshop',
    `/job-cards/${jobCardId}/proposals`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: `Proposal version ${result.data.versionNo} drafted for ${result.data.jobNumber}`,
  };
}

/** §418's expected result, §422's risks and uncertainties. */
export async function recordProposalNarrativeAction(formData: FormData): Promise<ActionResult> {
  const proposalId = String(formData.get('proposalId') ?? '').trim();
  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };

  const result = await apiPatch<{ id: string }>('workshop', `/proposals/${proposalId}`, {
    // An emptied box CLEARS the field — every one of these columns is nullable, so
    // refusing to empty one would be a rule the database does not have.
    expectedResult: clearable(formData, 'expectedResult'),
    riskAndLimitations: clearable(formData, 'riskAndLimitations'),
    uncertainties: clearable(formData, 'uncertainties'),
    presentationNote: clearable(formData, 'presentationNote'),
  });
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Proposal saved' };
}

/** Put it in front of the customer. */
export async function issueProposalAction(formData: FormData): Promise<ActionResult> {
  const proposalId = String(formData.get('proposalId') ?? '').trim();
  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };

  const result = await apiPost<{ jobNumber: string; versionNo: number }>(
    'workshop',
    `/proposals/${proposalId}/issue`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: `Version ${result.data.versionNo} issued to the customer for ${result.data.jobNumber}`,
  };
}

/**
 * §7 — record the customer's answer.
 *
 * ⚠️ THE CUSTOMER'S NAME AND THE CHANNEL ARE BOTH REQUIRED, and the client checks them
 * only so the person at the desk is not sent on a round trip. The service enforces
 * them, and a CHECK constraint in migration 017 enforces them again — because an
 * approval with nobody behind it is what a workshop discovers it needed on the day a
 * customer says they never agreed.
 */
export async function recordProposalDecisionAction(formData: FormData): Promise<ActionResult> {
  const proposalId = String(formData.get('proposalId') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const decidedByName = String(formData.get('decidedByName') ?? '').trim();
  const decisionChannel = String(formData.get('decisionChannel') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const approvedOption = String(formData.get('approvedOption') ?? '').trim();

  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
  if (!['approved', 'declined', 'changes_requested'].includes(decision)) {
    return { error: 'Choose what the customer decided.' };
  }
  if (decidedByName === '') {
    return { error: 'Record WHO decided. An approval with no name behind it is not an approval.' };
  }
  if (decisionChannel === '') {
    return { error: 'Record how the customer answered — in person, by telephone, and so on.' };
  }
  if (decision === 'approved' && approvedOption === '') {
    return { error: 'Record which option the customer approved.' };
  }
  if (decision !== 'approved' && note === '') {
    return {
      error: 'Say what the customer asked for. Without it the workshop has nothing to act on.',
    };
  }

  const result = await apiPost<{ jobNumber: string; decision: string; versionNo: number }>(
    'workshop',
    `/proposals/${proposalId}/decision`,
    {
      decision,
      decidedByName,
      decisionChannel,
      approvedOption: decision === 'approved' ? approvedOption : undefined,
      note: note === '' ? undefined : note,
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created:
      result.data.decision === 'approved'
        ? `Customer approved version ${result.data.versionNo} — the repair is authorised`
        : `Customer response recorded on version ${result.data.versionNo}`,
  };
}
