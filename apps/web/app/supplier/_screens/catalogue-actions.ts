'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiPatch, apiPost, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Supplier catalogue writes — Slice B.
 *
 * ⚠️ THE API'S OWN SENTENCE IS PREFERRED OVER A LOCAL ONE, EVERY TIME. The
 * refusals in this slice are the useful part, and they are written to name a way
 * forward: "this part is published, so its fitments are public and only an
 * administrator may change them. Ask an administrator to withdraw the part…".
 * Replacing that with "Could not save" throws away the only thing that tells the
 * supplier what to do next — which has been the most expensive defect class in
 * this repository for four slices running.
 *
 * ⚠️ NONE OF THIS IS THE CONTROL. Migration 024's policies decide which rows
 * this supplier may touch, its triggers decide which columns, and 026 decides
 * whether a fitment may change at all. If every function here were rewritten to
 * send whatever it liked, the database would still refuse (CLAUDE.md §8).
 */


/**
 * The sentence to show when a write fails.
 *
 * ⚠️ THE API'S OWN MESSAGE IS PREFERRED FOR BOTH `invalid` AND `forbidden`.
 * This slice's most useful refusals are 403s from a column guard, and they are
 * written to name the way forward: "this part is published, so its fitments are
 * public and only an administrator may change them. Ask an administrator to
 * withdraw the part...". Replacing that with a generic apology states the
 * problem and hides the solution.
 *
 * `apiWrite` only began carrying the message on a 403 for this reason; before
 * that it was dropped and the supplier saw "you do not have access to this".
 */
function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That change was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') return 'That item no longer exists.';
  return 'The catalogue could not be updated just now.';
}

/** The publication state is deliberately NOT settable from this file. */
export async function createPartAction(
  supplierId: string,
  form: FormData,
): Promise<ActionOutcome> {
  const result = await apiPost<{ id: string }>('supplier', `/catalogue/suppliers/${supplierId}/parts`, {
    categoryId: String(form.get('categoryId') ?? ''),
    partNumber: String(form.get('partNumber') ?? ''),
    name: String(form.get('name') ?? ''),
    brand: String(form.get('brand') ?? ''),
    description: String(form.get('description') ?? ''),
    // An empty price box means quote-only, not zero — the API rejects zero and
    // an empty string must not become one on the way there.
    price: String(form.get('price') ?? '').trim() === '' ? null : String(form.get('price')),
    currency: String(form.get('currency') ?? 'GHS'),
  });

  if (!result.ok) {
    return { ok: false, message: failureMessage(result) };
  }
  revalidatePath('/products/product-catalogue');
  return {
    ok: true,
    message: 'Saved as a draft. An administrator publishes it before buyers can see it.',
  };
}

export async function updatePartAction(partId: string, form: FormData): Promise<ActionOutcome> {
  /**
   * ⚠️ ONLY THE FIELDS THE FORM ACTUALLY CARRIES ARE SENT. `parsePartPatch`
   * treats an ABSENT key as "leave alone" and an explicit null as "clear", so
   * sending every key with an empty default would silently wipe the description
   * and brand of any part edited through a partial form. That exact defect has
   * been written up twice in this repo already.
   */
  const patch: Record<string, unknown> = {};
  for (const key of ['partNumber', 'name', 'brand', 'description', 'currency'] as const) {
    if (form.has(key)) patch[key] = String(form.get(key) ?? '');
  }
  if (form.has('price')) {
    const raw = String(form.get('price') ?? '').trim();
    patch['price'] = raw === '' ? null : raw;
  }
  if (form.has('inStock')) patch['inStock'] = form.get('inStock') === 'on';

  const result = await apiPatch('supplier', `/catalogue/parts/${partId}`, patch);
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/products/product-catalogue');
  return { ok: true, message: 'Saved.' };
}

export async function deletePartAction(partId: string): Promise<ActionOutcome> {
  const result = await apiDelete('supplier', `/catalogue/parts/${partId}`);
  if (!result.ok) {
    // The interesting failure here is a part that appears on a placed order:
    // `order_lines.part_id` is ON DELETE RESTRICT, and the API turns that into
    // "mark it out of stock instead, so the order history stays intact".
    return { ok: false, message: failureMessage(result) };
  }
  revalidatePath('/products/product-catalogue');
  return { ok: true, message: 'Removed.' };
}

export async function addFitmentAction(partId: string, form: FormData): Promise<ActionOutcome> {
  const result = await apiPost('supplier', `/catalogue/parts/${partId}/fitments`, {
    make: String(form.get('make') ?? ''),
    model: String(form.get('model') ?? ''),
    yearFrom: String(form.get('yearFrom') ?? ''),
    yearTo: String(form.get('yearTo') ?? ''),
  });
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/products/product-catalogue');
  return { ok: true, message: 'Compatibility added.' };
}

export async function removeFitmentAction(fitmentId: string): Promise<ActionOutcome> {
  const result = await apiDelete('supplier', `/catalogue/fitments/${fitmentId}`);
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/products/product-catalogue');
  return { ok: true, message: 'Compatibility removed.' };
}

/** Apply to be listed. Creates the supplier row and makes the caller its owner. */
export async function applyAction(form: FormData): Promise<ActionOutcome> {
  const result = await apiPost<{ message?: string }>('supplier', '/catalogue/suppliers', {
    name: String(form.get('name') ?? ''),
    country: String(form.get('country') ?? ''),
    city: String(form.get('city') ?? ''),
    website: String(form.get('website') ?? ''),
  });
  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/products/product-catalogue');
  return {
    ok: true,
    message:
      result.data?.message ??
      'Your listing has been created and is awaiting review.',
  };
}
