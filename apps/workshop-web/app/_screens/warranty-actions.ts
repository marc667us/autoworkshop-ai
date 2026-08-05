'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The slice 5 write actions — warranties and claims.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives. NOT the authorization point: `WarrantyService` decides who may record a
 * claim and — more narrowly — who may decide one (CLAUDE.md §8).
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence: its refusals name WHO can decide and what the
      // person can still do ("you can still record the claim and add notes").
      return message ?? fallback;
    case 'notFound':
      return 'That record no longer exists.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The warranty service did not respond. Nothing was saved.';
  }
}

export async function createPolicyAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    jobCardId: String(formData.get('jobCardId') ?? ''),
    coverSummary: String(formData.get('coverSummary') ?? ''),
  };
  const expiresOn = String(formData.get('expiresOn') ?? '').trim();
  if (expiresOn) body.expiresOn = expiresOn;
  const km = Number(formData.get('expiresAtOdometer'));
  if (Number.isFinite(km) && km > 0) body.expiresAtOdometer = Math.floor(km);

  const result = await apiPost<{ policyNumber: string }>('workshop', '/warranty-policies', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The warranty was not created.') };
  }
  revalidatePath('/', 'layout');
  return { created: result.data.policyNumber };
}

export async function recordClaimAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    policyId: String(formData.get('policyId') ?? ''),
    reportedFault: String(formData.get('reportedFault') ?? ''),
  };
  const km = Number(formData.get('odometerReading'));
  if (Number.isFinite(km) && km >= 0) body.odometerReading = Math.floor(km);

  const result = await apiPost<{ claimNumber: string }>('workshop', '/warranty-claims', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The claim was not recorded.') };
  }
  revalidatePath('/', 'layout');
  return { created: result.data.claimNumber };
}

/**
 * Record a decision on a claim.
 *
 * ⚠️ THIS APPENDS AN EVENT. There is no "edit the decision" action, deliberately
 * — `warranty.claim_events` is append-only on UPDATE and DELETE.
 */
export async function decideClaimAction(
  claimId: string,
  input: { eventKind: string; reason?: string; note?: string },
  revalidate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPost<unknown>('workshop', `/warranty-claims/${claimId}/events`, {
    eventKind: input.eventKind,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The decision was not recorded.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}
