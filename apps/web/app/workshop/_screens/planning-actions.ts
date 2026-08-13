'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 14 write actions — booking and releasing a tool or a bay.
 *
 * 🔴 `'workshop'`, NOT `'customer'`. These are workshop screens; the workspace
 * id is the one character local testing cannot catch, because `:3000` and
 * `:3001` share a cookie jar (cookies ignore the PORT).
 *
 * NOT the authorization point. `PlanningService` calls `assertWorkshopStaff` on
 * every method, and the DATABASE refuses an overlapping booking outright.
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
      // The API's own sentence. A clash says which window is taken and where to
      // look; a generic "could not book" sends the reader back to guess.
      return message ?? fallback;
    case 'noMembership':
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The workshop could not be reached. Nothing was booked.';
  }
}

/** `datetime-local` gives `YYYY-MM-DDTHH:MM` with no zone; the API wants ISO. */
function toIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export async function bookResourceAction(formData: FormData): Promise<ActionResult> {
  const startsAt = toIso(String(formData.get('startsAt') ?? ''));
  const endsAt = toIso(String(formData.get('endsAt') ?? ''));
  if (!startsAt || !endsAt) {
    return { error: 'Give a start and an end time.' };
  }

  const result = await apiPost('workshop', '/plan-work/bookings', {
    resourceKind: String(formData.get('resourceKind') ?? 'tool'),
    resourceId: String(formData.get('resourceId') ?? ''),
    jobCardId: String(formData.get('jobCardId') ?? ''),
    startsAt,
    endsAt,
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'It was not booked.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Booked.' };
}

export async function releaseResourceAction(
  bookingId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiPost('workshop', `/plan-work/bookings/${bookingId}/release`, {
    ...(reason ? { reason } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'It was not released.') };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
