'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The customer side of slice 7.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. These actions were written alongside the
 * workshop ones and the workspace id is the single character of difference that
 * LOCAL TESTING CANNOT CATCH — `:3000` and `:3001` share one cookie jar because
 * cookies ignore the port, so a wrong id works on a developer's machine and
 * fails only on the deployed hosts. Recorded three times here already.
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's sentence. When a workshop has nobody set up to receive
      // messages it says so and points at the phone number — far more useful
      // than "forbidden".
      return message ?? fallback;
    case 'notFound':
      return message ?? 'That conversation is not one of yours.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The workshop could not be reached. Nothing was sent.';
  }
}

export async function createCustomerThreadAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<{ threadId: string }>('customer', '/comms/threads', {
    // A customer's conversation is always with the workshop, so the kind is
    // fixed here rather than offered as a choice they would have to interpret.
    threadKind: 'customer',
    subject: String(formData.get('subject') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'Your message was not sent.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Message sent to the workshop.' };
}

export async function replyToWorkshopAction(formData: FormData): Promise<ActionResult> {
  const threadId = String(formData.get('threadId') ?? '');
  const result = await apiPost('customer', `/comms/threads/${threadId}/messages`, {
    body: String(formData.get('body') ?? ''),
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'Your reply was not sent.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Reply sent.' };
}
