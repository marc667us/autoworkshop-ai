'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 13 write action — requesting recovery.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. The workspace id is the one character of
 * difference LOCAL TESTING CANNOT CATCH: `:3000` and `:3001` share a cookie jar
 * because cookies ignore the PORT. Three recorded instances.
 *
 * NOT the authorization point. `CustomerTailService` derives the customer from
 * the session, checks any named vehicle is theirs, and migration 055 enforces
 * that a towing case carries a location and a number to ring.
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
      return message ?? fallback;
    case 'noMembership':
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Ask the workshop to add you as a customer.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      // ⚠️ THE FALLBACK MATTERS MORE HERE THAN ANYWHERE ELSE IN THE PRODUCT.
      // Somebody is at the roadside. "Nothing was saved" without an alternative
      // would leave them refreshing a page instead of telephoning.
      return 'The workshop could not be reached and nothing was saved. Telephone them directly if the vehicle is unsafe where it is.';
  }
}

export async function requestTowingAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    location: String(formData.get('location') ?? ''),
    contactPhone: String(formData.get('contactPhone') ?? ''),
    description: String(formData.get('description') ?? ''),
  };
  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  if (vehicleId) body.vehicleId = vehicleId;

  const result = await apiPost('customer', '/my/towing', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The recovery request was not sent.') };
  }
  revalidatePath('/', 'layout');
  return {
    created:
      'Recovery requested. The workshop can see it now — keep your phone to hand, and telephone them as well if the vehicle is somewhere unsafe.',
  };
}
