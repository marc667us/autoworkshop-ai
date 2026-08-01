'use server';

import { revalidatePath } from 'next/cache';
import { apiPut, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Saving the workshop's pricing — Slice D.
 *
 * ⚠️ NOT THE CONTROL. Migration 029's `owner_write` / `owner_update` policies
 * decide who may write this row, keyed on the ORGANIZATION and the ROLE
 * together. If this file sent another workshop's id the policy would refuse it,
 * and `verify/029` proves that against a real database.
 *
 * ⚠️ ONE SAVE, NOT A FIELD-BY-FIELD AUTOSAVE. These five values are read
 * TOGETHER by `quotation.service.ts` when a quotation is built. A partial save
 * would leave a workshop quoting with, say, the new labour rate and the old tax
 * rate — a state nobody chose and nobody can see. `PUT` replaces the set.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  // `invalid` and `forbidden` carry the API's own sentence — for pricing that is
  // either the specific field problem ("the labour rate cannot be negative") or
  // the refusal naming who to ask. Replacing them with something generic would
  // leave an owner staring at a form with no idea which field is wrong.
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That change was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  return 'The pricing could not be saved just now.';
}

export async function savePricingAction(form: FormData): Promise<ActionOutcome> {
  const result = await apiPut<{ saved: boolean; message?: string }>('workshop', '/pricing', {
    currency: String(form.get('currency') ?? ''),
    // ⚠️ SENT AS THE RAW STRING, NOT `Number(...)`. `Number('')` is 0, so
    // coercing here would turn a field the owner CLEARED into a labour rate of
    // ZERO before the API ever saw it — and the API's own guard against exactly
    // that would never fire. `parsePricingInput` rejects the empty string.
    defaultLabourRate: String(form.get('defaultLabourRate') ?? ''),
    taxName: String(form.get('taxName') ?? ''),
    taxRatePercent: String(form.get('taxRatePercent') ?? ''),
    defaultValidityDays: String(form.get('defaultValidityDays') ?? ''),
    defaultWarrantyTerms: String(form.get('defaultWarrantyTerms') ?? ''),
  });

  if (!result.ok) return { ok: false, message: failureMessage(result) };
  revalidatePath('/workshop-management/pricing-rules');
  return {
    ok: true,
    message:
      result.data?.message ??
      'Saved. New quotations will use these rates; quotations already issued keep the rates they were built with.',
  };
}
