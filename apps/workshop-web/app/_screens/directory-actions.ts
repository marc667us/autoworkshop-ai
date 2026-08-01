'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * The workshop's public directory listing — Slice C.
 *
 * ⚠️ SAVING AND PUBLISHING ARE SEPARATE ACTIONS, deliberately. Editing a live
 * listing must not be able to withdraw it by accident, and editing a draft must
 * not expose it. The API keeps `is_published` out of the save statement
 * entirely, and these two functions mirror that split rather than offering one
 * "save and publish" that hides which of the two happened.
 *
 * ⚠️ NOT THE CONTROL. Migration 027's `owner_manage_own` policy decides who may
 * write which row, and it keys on the ORGANIZATION and the ROLE together. If
 * this file sent another workshop's id, the policy would refuse it.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  // `forbidden` carries the API's own sentence — here it is "only the workshop
  // owner can change the public directory listing. Ask an owner to publish or
  // withdraw it", which names who to go to. A generic replacement would leave a
  // technician staring at a form with no idea why it will not save.
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That change was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  return 'The listing could not be updated just now.';
}

export async function saveListingAction(form: FormData): Promise<ActionOutcome> {
  const result = await apiPatch<{ saved: boolean }>('workshop', '/directory/listing', {
    tradingName: String(form.get('tradingName') ?? ''),
    city: String(form.get('city') ?? ''),
    country: String(form.get('country') ?? ''),
    publicPhone: String(form.get('publicPhone') ?? ''),
    // Comma-separated, because a plain text input is what the first version of
    // this screen can honestly offer. The API splits and de-duplicates.
    services: String(form.get('services') ?? ''),
    specialisms: String(form.get('specialisms') ?? ''),
  });

  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/workshop-management/workshop-profile');
  return {
    ok: true,
    message: 'Saved. Publishing is a separate step, so nothing has changed for the public yet.',
  };
}

export async function setListingPublicationAction(published: boolean): Promise<ActionOutcome> {
  const result = await apiPatch<{ isPublished: boolean; message?: string }>(
    'workshop',
    '/directory/listing/publication',
    { published },
  );
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/workshop-management/workshop-profile');
  return { ok: true, message: result.data?.message ?? 'Updated.' };
}
