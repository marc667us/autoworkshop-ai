'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch } from '@autoworkshop/next-shell';

/**
 * The supplier's answer to a workshop's Request for Parts.
 *
 * ⚠️ NOTHING HERE IS THE RULE. A server action is a public HTTP endpoint like
 * any other, so who may answer is decided in `SupplierRequestService` and again
 * by the RLS policy, which narrows every row to the suppliers this user actually
 * works for. This function owns the message and the revalidation (CLAUDE.md §8).
 */
export async function respondToRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const intent = String(formData.get('intent') ?? '').trim();
  if (!id) return;

  if (intent === 'decline') {
    const reason = String(formData.get('declineReason') ?? '').trim();
    // A decline with no reason is refused by the service AND by
    // `ck_supplier_request_declined`. Stopping here first spares the workshop a
    // useless notification and the supplier a confusing error.
    if (!reason) return;
    await apiPatch('supplier', `/supplier-requests/${id}/response`, { declineReason: reason });
  } else {
    const amount = String(formData.get('quoteAmount') ?? '').trim();
    const currency = String(formData.get('quoteCurrency') ?? 'GHS').trim().toUpperCase();
    const lead = String(formData.get('quoteLeadDays') ?? '').trim();
    if (!amount) return;

    // 🔴 MAJOR UNITS IN, MINOR UNITS OUT. The supplier types 450.00; the API and
    // the database store 45000. Sending the major figure would under-charge by
    // a factor of a hundred, silently, on every quote.
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(minor) || minor < 0) return;

    await apiPatch('supplier', `/supplier-requests/${id}/response`, {
      quoteMinor: minor,
      quoteCurrency: currency,
      ...(lead === '' ? {} : { quoteLeadDays: Number(lead) }),
    });
  }

  revalidatePath('/orders-and-delivery/parts-requests');
}
