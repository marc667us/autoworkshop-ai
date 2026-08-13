'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The customer's side of slice 11.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. The workspace id is the one character of
 * difference local testing cannot catch — `:3000` and `:3001` share one cookie
 * jar because cookies ignore the port.
 *
 * ⚠️ THE SIGNALLING DOES NOT GO THROUGH HERE. A server action renders once; a
 * WebRTC negotiation is a stream of small messages over a few seconds and has
 * to happen in the browser. `app/api/call-signalling` is the narrow allow-list
 * that exists for it.
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
      // The API's own sentence — when a workshop has nobody set up to take
      // calls it says so and points at the phone number, which is far more
      // useful than "forbidden".
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
      return 'The workshop could not be reached. No call was started.';
  }
}

export async function startCustomerCallAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<{ callId: string }>('customer', '/calls', {
    // A customer's call is always to the workshop, so the kind is fixed here
    // rather than offered as a choice they would have to interpret. The service
    // addresses it to the front desk.
    callKind: 'customer',
    medium: String(formData.get('medium') ?? 'voice'),
    subject: String(formData.get('subject') ?? ''),
    // No `scheduledFor`: a customer pressing "call the workshop" means now.
    // The service turns that into `ringing`.
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The call was not started.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Calling the workshop.' };
}
