'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The slice 4 write actions — stock, reservations, requisitions, receipts, tools.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives. NOT the authorization point: `PartsService` decides who may move stock
 * and — more widely — who may merely ASK for a part (CLAUDE.md §8).
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence. Its refusals name the alternative — "you can
      // still raise a requisition for what you need", "release a reservation, or
      // record a stock take if the shelf says something different" — and that is
      // the only part the person can act on.
      return message ?? fallback;
    case 'notFound':
      return 'That record no longer exists.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The parts service did not respond. Nothing was saved.';
  }
}

type Simple = { ok: true } | { ok: false; error: string };

export async function createStockItemAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    partNumber: String(formData.get('partNumber') ?? ''),
    name: String(formData.get('name') ?? ''),
  };
  for (const key of ['brand', 'unit', 'shelfLocation'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
  for (const key of ['unitCost', 'reorderLevel', 'openingQuantity'] as const) {
    const n = Number(formData.get(key));
    if (Number.isFinite(n) && n >= 0 && String(formData.get(key) ?? '').trim() !== '') {
      body[key] = key === 'unitCost' ? n : Math.floor(n);
    }
  }
  // An opening quantity of zero is not an opening balance — it is no movement at
  // all, and recording one would put a meaningless row in the ledger.
  if (body.openingQuantity === 0) delete body.openingQuantity;

  const result = await apiPost<{ partNumber: string }>('workshop', '/stock', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The part was not added.') };
  revalidatePath('/', 'layout');
  return { created: result.data.partNumber };
}

export async function recordMovementAction(
  input: { stockItemId: string; quantity: number; movementKind: string; jobCardId?: string; reason?: string },
  revalidate: string,
): Promise<Simple> {
  const result = await apiPost<unknown>('workshop', '/stock/movements', {
    stockItemId: input.stockItemId,
    quantity: input.quantity,
    movementKind: input.movementKind,
    ...(input.jobCardId ? { jobCardId: input.jobCardId } : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  });
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message, 'The movement was not recorded.') };
  revalidatePath(revalidate);
  return { ok: true };
}

export async function reserveStockAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<unknown>('workshop', '/stock-reservations', {
    stockItemId: String(formData.get('stockItemId') ?? ''),
    jobCardId: String(formData.get('jobCardId') ?? ''),
    quantity: Number(formData.get('quantity') ?? 0),
  });
  if (!result.ok) return { error: explain(result.reason, result.message, 'The stock was not reserved.') };
  revalidatePath('/', 'layout');
  return { created: 'reservation' };
}

export async function settleReservationAction(
  reservationId: string,
  status: 'issued' | 'released',
  releaseReason: string | undefined,
  revalidate: string,
): Promise<Simple> {
  const result = await apiPatch<unknown>('workshop', `/stock-reservations/${reservationId}/settle`, {
    status,
    ...(releaseReason?.trim() ? { releaseReason: releaseReason.trim() } : {}),
  });
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message, 'The reservation was not settled.') };
  revalidatePath(revalidate);
  return { ok: true };
}

export async function raiseRequisitionAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    description: String(formData.get('description') ?? ''),
    quantity: Number(formData.get('quantity') ?? 0),
  };
  for (const key of ['stockItemId', 'jobCardId'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
  const by = String(formData.get('neededBy') ?? '').trim();
  if (by) body.neededBy = by;

  const result = await apiPost<unknown>('workshop', '/requisitions', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The requisition was not raised.') };
  revalidatePath('/', 'layout');
  return { created: 'requisition' };
}

export async function decideRequisitionAction(
  requisitionId: string,
  status: 'approved' | 'rejected' | 'cancelled',
  reason: string | undefined,
  revalidate: string,
): Promise<Simple> {
  const result = await apiPatch<unknown>('workshop', `/requisitions/${requisitionId}/decision`, {
    status,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  if (!result.ok) return { ok: false, error: explain(result.reason, result.message, 'The decision was not recorded.') };
  revalidatePath(revalidate);
  return { ok: true };
}

export async function receiveGoodsAction(formData: FormData): Promise<ActionResult> {
  const stockItemId = String(formData.get('stockItemId') ?? '');
  const quantity = Number(formData.get('quantity') ?? 0);
  const body: Record<string, unknown> = { lines: [{ stockItemId, quantity }] };
  for (const key of ['deliveryNoteReference', 'notes'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
  const result = await apiPost<unknown>('workshop', '/goods-receipts', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The delivery was not booked in.') };
  revalidatePath('/', 'layout');
  return { created: 'goods receipt' };
}

export async function createToolAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    assetTag: String(formData.get('assetTag') ?? ''),
    name: String(formData.get('name') ?? ''),
  };
  for (const key of ['toolType', 'location', 'calibrationDueOn'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
  const result = await apiPost<unknown>('workshop', '/tools', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The tool was not added.') };
  revalidatePath('/', 'layout');
  return { created: 'tool' };
}
