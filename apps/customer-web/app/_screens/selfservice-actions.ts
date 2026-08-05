'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 9 write actions — documents, maintenance, drivers, support cases.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. The workspace id is the one character of
 * difference LOCAL TESTING CANNOT CATCH: `:3000` and `:3001` share a cookie jar
 * because cookies ignore the port, so a wrong id works on a developer's machine
 * and fails only on the deployed hosts. Three recorded instances.
 *
 * NOT the authorization point. `SelfServiceService` derives the customer from
 * the SESSION and never accepts one from a caller.
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
    case 'notFound':
      // The API's own sentence. Its refusals name what to do instead — "add a
      // document against any vehicle in your garage", "reception can create a
      // record when you next bring a vehicle in" — and that is the only part
      // the reader can act on.
      return message ?? fallback;
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The workshop could not be reached. Nothing was saved.';
  }
}

function optional(formData: FormData, keys: readonly string[], body: Record<string, unknown>): void {
  for (const key of keys) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
}

export async function addDocumentAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    vehicleId: String(formData.get('vehicleId') ?? ''),
    documentKind: String(formData.get('documentKind') ?? 'other'),
    title: String(formData.get('title') ?? ''),
  };
  optional(formData, ['reference', 'expiresOn'], body);

  const result = await apiPost('customer', '/self-service/documents', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The document was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Document saved.' };
}

export async function addMaintenanceAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    vehicleId: String(formData.get('vehicleId') ?? ''),
    item: String(formData.get('item') ?? ''),
  };
  optional(formData, ['dueOn', 'notes'], body);
  const km = String(formData.get('dueAtKm') ?? '').trim();
  if (km !== '' && Number.isFinite(Number(km))) body.dueAtKm = Math.floor(Number(km));

  const result = await apiPost('customer', '/self-service/maintenance', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The service item was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Service item saved.' };
}

export async function addDriverAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    fullName: String(formData.get('fullName') ?? ''),
    mayDropOff: String(formData.get('mayDropOff') ?? '') === 'on',
    mayCollect: String(formData.get('mayCollect') ?? '') === 'on',
    // Unticked means false, and false is the safe default. Someone trusted to
    // collect a car is not thereby trusted to approve a bill.
    mayApproveWork: String(formData.get('mayApproveWork') ?? '') === 'on',
  };
  optional(formData, ['phone', 'relationship', 'vehicleId'], body);

  const result = await apiPost('customer', '/self-service/drivers', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The authorisation was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Authorisation saved.' };
}

export async function withdrawDriverAction(driverId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await apiPost('customer', `/self-service/drivers/${driverId}/withdraw`, {});
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The authorisation was not withdrawn.') };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function raiseCaseAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    subject: String(formData.get('subject') ?? ''),
    description: String(formData.get('description') ?? ''),
    category: String(formData.get('category') ?? 'other'),
  };
  optional(formData, ['jobCardId'], body);

  const result = await apiPost('customer', '/self-service/cases', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The case was not raised.') };
  revalidatePath('/', 'layout');
  return { created: 'Case raised.' };
}

export async function setMyPreferenceAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost('customer', '/self-service/preferences', {
    eventKey: String(formData.get('eventKey') ?? ''),
    channel: String(formData.get('channel') ?? ''),
    // Unticked means false. A checkbox that is off sends nothing at all, so the
    // absence of the field IS the answer rather than a missing one.
    isEnabled: String(formData.get('isEnabled') ?? '') === 'on',
  });
  if (!result.ok) return { error: explain(result.reason, result.message, 'The preference was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Preference saved.' };
}
