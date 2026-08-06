'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The slice 2 write actions — bookings, walk-ins, bays, feedback replies.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives: an action defined inside a component file is one refactor away from
 * landing in a file that gains `'use client'`, at which point the session token
 * would be handled in the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. A server action is a public HTTP endpoint that
 * Next exposes one-per-action and anyone may call directly. `ReceptionService`
 * decides who may book, configure a bay or answer a review, so a caller who
 * reaches these without passing a screen's gate is still refused (CLAUDE.md §8).
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // ⚠️ BOTH pass the API's own sentence through, which is unusual and
      // deliberate here. `ReceptionService`'s refusals NAME THE ROLE that can do
      // the thing instead ("ask reception, the workshop manager or the owner"),
      // and replacing that with a generic "you may not" would throw away the
      // only part the person can act on. A refusal that names no reachable
      // alternative is a wall, and it is the most expensive defect class in this
      // repository.
      return message ?? fallback;
    case 'notFound':
      return 'That record no longer exists — it may have been closed by someone else.';
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
      return 'The workshop service did not respond. Nothing was saved.';
  }
}

export async function createAppointmentAction(formData: FormData): Promise<ActionResult> {
  const duration = Number(formData.get('durationMinutes') ?? 60);
  const body: Record<string, unknown> = {
    customerId: String(formData.get('customerId') ?? ''),
    serviceSummary: String(formData.get('serviceSummary') ?? ''),
    scheduledFor: new Date(String(formData.get('scheduledFor') ?? '')).toISOString(),
    durationMinutes: Number.isFinite(duration) ? duration : 60,
  };
  // Empty select values must be OMITTED, not sent as ''. The schema is `.strict()`
  // with `uuid()` on these, so an empty string is a validation failure rather
  // than "not chosen" — which would show the person a field error for leaving an
  // optional field alone.
  for (const key of ['vehicleId', 'bayId', 'assignedTo'] as const) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) body[key] = value;
  }
  for (const key of ['contactPhone', 'notes'] as const) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) body[key] = value;
  }

  const result = await apiPost<{ id: string }>('workshop', '/appointments', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The booking was not accepted.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'appointment' };
}

export async function changeAppointmentStatusAction(
  appointmentId: string,
  status: string,
  cancellationReason: string | undefined,
  revalidate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPatch<unknown>('workshop', `/appointments/${appointmentId}/status`, {
    status,
    ...(cancellationReason?.trim() ? { cancellationReason: cancellationReason.trim() } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The appointment was not changed.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

export async function createWalkInAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    contactName: String(formData.get('contactName') ?? ''),
    vehicleDescription: String(formData.get('vehicleDescription') ?? ''),
    complaint: String(formData.get('complaint') ?? ''),
  };
  for (const key of ['contactPhone', 'registrationNumber'] as const) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) body[key] = value;
  }

  const result = await apiPost<{ id: string }>('workshop', '/walk-ins', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The walk-in was not recorded.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'walk-in' };
}

export async function closeWalkInAction(
  walkInId: string,
  status: string,
  outcomeNote: string | undefined,
  revalidate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPatch<unknown>('workshop', `/walk-ins/${walkInId}/close`, {
    status,
    ...(outcomeNote?.trim() ? { outcomeNote: outcomeNote.trim() } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The walk-in was not updated.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

export async function createBayAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = { name: String(formData.get('name') ?? '') };
  for (const key of ['bayType', 'notes'] as const) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) body[key] = value;
  }
  const result = await apiPost<{ id: string }>('workshop', '/service-bays', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The bay was not created.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'bay' };
}

export async function setBayActiveAction(
  bayId: string,
  isActive: boolean,
  revalidate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPatch<unknown>('workshop', `/service-bays/${bayId}/active`, { isActive });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The bay was not changed.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

export async function respondToFeedbackAction(
  feedbackId: string,
  response: string,
  revalidate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await apiPost<unknown>('workshop', `/customer-feedback/${feedbackId}/response`, {
    response,
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The reply was not published.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}
