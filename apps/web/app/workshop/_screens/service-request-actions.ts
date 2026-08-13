'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';

/**
 * Reception's decision on an incoming Request for Service.
 *
 * ⚠️ NOTHING HERE IS THE RULE. A server action is a public HTTP endpoint exactly
 * like a controller route, so who may decide is decided in
 * `ServiceRequestService` and again in the RLS UPDATE policy — both of which
 * refuse a `customer`, and both of which refuse a decline with no reason. This
 * function owns the redirect and the revalidation, nothing more (CLAUDE.md §8).
 */
export async function decideServiceRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const declineReason = String(formData.get('declineReason') ?? '').trim();

  if (!id || (status !== 'accepted' && status !== 'declined')) return;

  // Argument order is (workspaceId, path, body) — the workspace comes FIRST.
  // Getting it round the wrong way typechecks when both are strings and then
  // calls a nonsense URL at runtime.
  await apiPatch('workshop', `/service-requests/${id}/decision`, {
    status,
    // Sent only when there is one: the API rejects an empty string as a reason,
    // and `undefined` is what "not supplied" means on the wire.
    declineReason: declineReason === '' ? undefined : declineReason,
  });

  // The list is the only view of this record, so it must reflect the decision
  // immediately — a button that appears to do nothing gets pressed twice, and
  // the second press is the one that confuses everybody.
  revalidatePath('/customer-reception/service-requests');
}

/**
 * Turn an accepted request into a job card — value chain step 8.
 *
 * ⚠️ THE COMPLAINT IS NOT SENT. The API reads the customer's own words from the
 * stored row, so reception cannot quietly rewrite what was reported on the way
 * through. All this supplies is WHICH VEHICLE, which is the one judgement the
 * automation deliberately leaves to a person — the customer typed their car as
 * free text, and guessing a make from prose would create wrong vehicle records
 * under a real customer's name.
 */
export async function convertServiceRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  if (!id || !vehicleId) return;

  // ⚠️ OMITTED WHEN EMPTY, never sent as ''. The API's schema is `.strict()`
  // with `assignedTechnicianId: uuid().optional()`, so an empty string is a
  // VALIDATION FAILURE rather than "nobody" — and reception choosing "Leave
  // unassigned" would have had the whole conversion rejected.
  const assignedTechnicianId = String(formData.get('assignedTechnicianId') ?? '').trim();

  await apiPost('workshop', `/service-requests/${id}/convert`, {
    vehicleId,
    ...(assignedTechnicianId ? { assignedTechnicianId } : {}),
  });
  revalidatePath('/customer-reception/service-requests');
  revalidatePath('/requests/service-requests');
  revalidatePath('/requests-and-reception/service-requests');
}
