'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 7 write actions — start a conversation, reply, mark read.
 *
 * NOT the authorization point: `CommsService` decides membership, and it does
 * so by PARTICIPATION rather than role. A check here would be advisory only.
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      return message ?? fallback;
    case 'notFound':
      // The API deliberately gives the same answer for "no such thread" and
      // "not your thread", and its sentence names where the reader's own
      // conversations are. Replacing it with "not found" throws that away.
      return message ?? 'That conversation is not one of yours.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The messaging service did not respond. Nothing was sent.';
  }
}

export async function createThreadAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    threadKind: String(formData.get('threadKind') ?? 'internal'),
    subject: String(formData.get('subject') ?? ''),
    body: String(formData.get('body') ?? ''),
  };
  // Only send an id that is actually there. An empty string is not a UUID and
  // would be refused by the schema, turning "no job selected" into a validation
  // error about a field the person never filled in.
  for (const key of ['jobCardId', 'customerId'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
  const invited = formData.getAll('participantUserIds').map(String).filter(Boolean);
  if (invited.length) body.participantUserIds = invited;

  const result = await apiPost<{ threadId: string }>('workshop', '/comms/threads', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The conversation was not started.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Conversation started.' };
}

export async function postMessageAction(formData: FormData): Promise<ActionResult> {
  const threadId = String(formData.get('threadId') ?? '');
  const result = await apiPost('workshop', `/comms/threads/${threadId}/messages`, {
    body: String(formData.get('body') ?? ''),
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The message was not sent.') };
  }
  // Wide, because the unread badge in the layout is now a real number and a new
  // message changes it for everyone else in the thread.
  revalidatePath('/', 'layout');
  return { created: 'Message sent.' };
}

/**
 * Marking read is idempotent in the service (`ON CONFLICT DO NOTHING`), so a
 * double submit is not a second reading and this needs no guard of its own.
 */
export async function markThreadReadAction(threadId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await apiPost(`workshop`, `/comms/threads/${threadId}/read`, {});
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'Could not mark as read.') };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
