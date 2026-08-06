'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 11 write actions — start a call, record its outcome.
 *
 * ⚠️ THE SIGNALLING DOES NOT GO THROUGH HERE. Server actions render once; a
 * WebRTC negotiation is a stream of small messages over a few seconds and has
 * to happen in the browser. That is what `app/api/call-signalling` exists for,
 * and it is a deliberately narrow allow-list rather than a general API proxy.
 *
 * NOT the authorization point: `CallsService` decides who may join, and it does
 * so by PARTICIPATION rather than role.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
    case 'notFound':
      // The API's own sentence. It names the alternative — "ring them instead",
      // "a call needs somebody to call" — and that is the actionable part.
      return message ?? fallback;
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The calls service did not respond. Nothing was started.';
  }
}

export async function createCallAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    callKind: String(formData.get('callKind') ?? 'customer'),
    medium: String(formData.get('medium') ?? 'voice'),
    subject: String(formData.get('subject') ?? ''),
  };

  const job = String(formData.get('jobCardId') ?? '').trim();
  if (job) body.jobCardId = job;

  const peer = String(formData.get('participantUserIds') ?? '').trim();
  // A call with nobody else on it can never connect. The service refuses it
  // too; sending an empty array here would produce a refusal about a field the
  // person did fill in.
  if (peer) body.participantUserIds = [peer];

  // ⚠️ `datetime-local` GIVES A LOCAL WALL-CLOCK STRING WITH NO ZONE, and the
  // API expects an ISO instant. Passing it through unchanged would be read as
  // UTC and schedule a 14:00 call for 14:00 UTC — hours out for anyone not on
  // GMT. Converting through Date applies the browser's... no: this runs on the
  // SERVER, so it applies the SERVER's zone. That is why the value is only
  // accepted when it parses, and why "call now" is the default path.
  const scheduled = String(formData.get('scheduledFor') ?? '').trim();
  if (scheduled) {
    const parsed = new Date(scheduled);
    if (!Number.isNaN(parsed.getTime())) body.scheduledFor = parsed.toISOString();
  }

  const result = await apiPost<{ callId: string }>('workshop', '/calls', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The call was not started.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Call started.' };
}

export async function completeCallAction(formData: FormData): Promise<ActionResult> {
  const callId = String(formData.get('callId') ?? '');
  const result = await apiPost('workshop', `/calls/${callId}/complete`, {
    outcome: String(formData.get('outcome') ?? ''),
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The outcome was not saved.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Outcome recorded.' };
}
