'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Move an order along, as the SUPPLIER.
 *
 * ⚠️ THE WORKSPACE ID IS `'supplier'`, NOT `'customer'`, AND IT IS NOT
 * COSMETIC. It selects which Keycloak client's session token is attached, so
 * calling with the wrong one sends a token minted for a different audience and
 * the API rejects it. It is also what makes the SAME endpoint return a
 * different list — `/marketplace/supplier/orders` resolves membership from the
 * token's subject, so the identity behind this call is the whole authorization
 * story.
 *
 * ⚠️ THIS SENDS ONLY A STATUS AND A TRACKING REFERENCE. It cannot send a price,
 * a buyer or an address, and if it tried, migration 023's
 * `trg_orders_supplier_scope` trigger would refuse the UPDATE — the column rule
 * lives in the database, not in this file, because RLS selects rows and not
 * columns. This is the convenient path, not the enforcing one.
 */
export async function setOrderStatusAction(
  orderId: string,
  status: 'confirmed' | 'dispatched' | 'delivered' | 'cancelled',
  reason?: string,
): Promise<ActionOutcome> {
  const result = await apiPatch<{ status: string }>(
    'supplier',
    `/marketplace/orders/${orderId}/status`,
    reason ? { status, reason } : { status },
  );

  if (!result.ok) {
    return {
      ok: false,
      // The API's own sentence is preferred: it is the one that says what can
      // be done instead ("an order that is placed can go to: confirmed or
      // cancelled"). A generic replacement throws that away.
      message:
        result.reason === 'invalid'
          ? (result.message ?? 'That change was not accepted.')
          : result.reason === 'unauthenticated'
            ? 'Your session has expired. Sign in again.'
            : result.reason === 'forbidden'
              ? 'Your account may not update this order.'
              : 'The order could not be updated just now.',
    };
  }

  revalidatePath('/orders-and-delivery/new-orders');
  return { ok: true, message: `Order marked ${status}.` };
}

/**
 * Record the supplier's own tracking reference.
 *
 * Free text on purpose. Delivery is the supplier's own system (migration 022),
 * so this is whatever THEY use to find the consignment — a waybill number, a
 * driver's name, a rider's phone. Parsing it into structured carrier states
 * would be inventing states nothing here can observe, and a progress bar that
 * lies is worse than a reference the customer can quote.
 */
export async function setTrackingAction(
  orderId: string,
  trackingReference: string,
  notes: string,
): Promise<ActionOutcome> {
  // ⚠️ ITS OWN ENDPOINT, NOT A FIELD ON THE STATUS CALL. The first version of
  // this action posted `trackingReference` to `/status`, which accepts only a
  // status and a reason — so the reference would have been silently DROPPED and
  // the screen would have reported success. A control that reports success while
  // changing nothing is the worst kind of defect this repo keeps meeting.
  // Separate routes also let a supplier correct a mistyped waybill without
  // re-dispatching the order.
  const result = await apiPatch<{ trackingReference: string | null }>(
    'supplier',
    `/marketplace/orders/${orderId}/tracking`,
    { trackingReference: trackingReference.trim(), notes: notes.trim() },
  );

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === 'invalid'
          ? (result.message ?? 'That tracking reference was not accepted.')
          : 'The tracking reference could not be recorded just now.',
    };
  }

  revalidatePath('/orders-and-delivery/new-orders');
  return { ok: true, message: 'Tracking reference saved.' };
}
