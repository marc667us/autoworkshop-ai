'use server';

import { revalidatePath } from 'next/cache';
import { apiPost, apiPatch } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The workshop's side of the parts marketplace — ask, then accept or cancel.
 *
 * ⚠️ WHO MAY DO THIS IS NOT DECIDED HERE. `SupplierRequestService` holds the
 * role rule and the RLS INSERT policy repeats it, because a server action is a
 * public HTTP endpoint like any other (CLAUDE.md §8).
 */
export async function askSupplierAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const supplierId = read('supplierId');
  if (!supplierId) return { error: 'Choose a supplier to ask.' };

  const quantity = Number(read('quantity') ?? '1');
  if (!Number.isInteger(quantity) || quantity < 1) {
    // Refused here as well as by `quantity > 0` in the schema, so the person
    // reads a sentence rather than a constraint violation.
    return { error: 'Quantity must be a whole number of at least 1.' };
  }

  const result = await apiPost<{ id: string }>('workshop', '/supplier-requests', {
    supplierId,
    partDescription: read('partDescription'),
    quantity,
    neededBy: read('neededBy'),
    notes: read('notes'),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Some details were not accepted. Check the fields and try again.')
        : result.reason === 'forbidden'
          ? 'Your role may not raise a parts request.'
          : result.reason === 'notFound'
            ? 'That supplier is no longer listed. Choose another.'
            : result.reason === 'unauthenticated'
              ? 'Your session has ended. Sign in again, then resend — nothing has been sent.'
              : 'The service did not respond. Nothing has been sent — try again shortly.';
    return { error };
  }

  revalidatePath('/parts-and-supply/parts-requests');
  return { created: result.data.id };
}

/** Accept a supplier's quote, or cancel a request nobody has answered. */
export async function decideSupplierRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  if (!id || (decision !== 'accepted' && decision !== 'cancelled')) return;

  await apiPatch('workshop', `/supplier-requests/${id}/decision`, { decision });
  revalidatePath('/parts-and-supply/parts-requests');
}
