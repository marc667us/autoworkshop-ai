'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Preparing and approving a quotation — `07.txt` §9-§16.
 *
 * IN ITS OWN `'use server'` MODULE, the same discipline as every sibling: a module
 * whose first line is `'use server'` cannot become a client module without somebody
 * deleting that line on purpose, so the access-token handling inside `apiPost` cannot
 * drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Next exposes one public HTTP endpoint per server
 * action. Every rule lives in `QuotationService`: who may prepare (§11), who may
 * APPROVE (§5, a narrower set — reception can draft a price but not commit the
 * business to it), that an approver is not the submitter (`2.txt` §563), that the card
 * is at `quotation_preparation`, that an APPROVED repair plan exists, and the money
 * gates on submission.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence, because the refusals here are instructions: which
      // lines are still priced at zero, that the discount exceeds the subtotal, that
      // you cannot approve what you submitted.
      return message ?? 'That was not accepted.';
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then retry.';
    case 'notFound':
      return 'That record is no longer available to you. Reload the page.';
    default:
      return 'The service did not respond. Nothing was recorded — try again shortly.';
  }
}

/** All three workshop routes plus the stages the work sits behind. */
const QUOTATION_ROUTES = [
  '/solution-and-approval/quotations',
  '/repair-control/quotations',
  '/customer-approval/quotations',
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
];

function revalidateAll(): void {
  for (const route of QUOTATION_ROUTES) revalidatePath(route);
}

/**
 * A money field from a form.
 *
 * ⚠️ `Number('')` IS 0, NOT NaN — handled before the conversion, so an untouched box
 * is "unchanged" rather than a silent price of zero.
 */
function money(formData: FormData, name: string): number | undefined | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clearable(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? null : value;
}

/** §10 + §3 — generate the draft from the approved plan. */
export async function prepareQuotationAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) return { error: 'Choose a job card to quote.' };

  const result = await apiPost<{ id: string; jobNumber: string; lines: unknown[] }>(
    'workshop',
    `/job-cards/${jobCardId}/quotations`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created:
      `Draft quotation generated for ${result.data.jobNumber} — ` +
      `${result.data.lines.length} line(s) priced from the approved plan`,
  };
}

/** §11's discount and taxes, §4's validity, warranty and conditions. */
export async function recordQuotationDetailsAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  if (!quotationId) return { error: 'That quotation could not be identified. Reload the page.' };

  const discount = money(formData, 'discountAmount');
  if (discount === null) return { error: 'The discount must be an amount, for example 150.00.' };

  const result = await apiPatch<{ id: string }>('workshop', `/quotations/${quotationId}`, {
    // `0` when the box is emptied: a discount is not nullable in the schema, and
    // "no discount" is zero rather than absent.
    discountAmount: discount ?? 0,
    discountReason: clearable(formData, 'discountReason'),
    validUntil: clearable(formData, 'validUntil'),
    warrantyTerms: clearable(formData, 'warrantyTerms'),
    completionConditions: clearable(formData, 'completionConditions'),
    recommendedRepair: clearable(formData, 'recommendedRepair'),
    alternativeOptions: clearable(formData, 'alternativeOptions'),
  });
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Quotation details saved' };
}

/** Price a generated line, or correct one. */
export async function updateQuotationLineAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  const lineId = String(formData.get('lineId') ?? '').trim();
  if (!quotationId || !lineId) return { error: 'That line could not be identified. Reload the page.' };

  const description = String(formData.get('description') ?? '').trim();
  if (description === '') return { error: 'A line must keep a description — the customer reads it.' };

  const unitPrice = money(formData, 'unitPrice');
  const quantity = money(formData, 'quantity');
  if (unitPrice === null) return { error: 'The unit price must be an amount, for example 250.00.' };
  if (quantity === null) return { error: 'The quantity must be a number.' };

  const result = await apiPatch<{ lines: unknown[] }>(
    'workshop',
    `/quotations/${quotationId}/lines/${lineId}`,
    {
      description,
      unitPrice,
      quantity,
      unit: clearable(formData, 'unit'),
      // A checkbox is absent from the FormData when unticked.
      isOptional: formData.get('isOptional') !== null,
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Line priced' };
}

/** §11's external services and §4's other charges. */
export async function addQuotationLineAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  if (!quotationId) return { error: 'That quotation could not be identified. Reload the page.' };

  const description = String(formData.get('description') ?? '').trim();
  const lineKind = String(formData.get('lineKind') ?? '').trim();
  if (description === '') return { error: 'Describe what this line charges for.' };
  if (lineKind === '') return { error: 'Choose what kind of line this is.' };

  const unitPrice = money(formData, 'unitPrice');
  const quantity = money(formData, 'quantity');
  if (unitPrice === undefined || unitPrice === null) return { error: 'Enter a unit price.' };
  if (quantity === undefined || quantity === null) return { error: 'Enter a quantity.' };

  const result = await apiPost<{ lines: unknown[] }>(
    'workshop',
    `/quotations/${quotationId}/lines`,
    {
      lineKind,
      description,
      unitPrice,
      quantity,
      unit: String(formData.get('unit') ?? '').trim() || undefined,
      isOptional: formData.get('isOptional') !== null,
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Line added — ${result.data.lines.length} on this quotation` };
}

/** Remove a line added in error, while the quotation is a draft. */
export async function removeQuotationLineAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  const lineId = String(formData.get('lineId') ?? '').trim();
  if (!quotationId || !lineId) return { error: 'That line could not be identified. Reload the page.' };

  const result = await apiDelete<{ lines: unknown[] }>(
    'workshop',
    `/quotations/${quotationId}/lines/${lineId}`,
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Line removed' };
}

/** §5 — submit for internal approval. */
export async function submitQuotationAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  if (!quotationId) return { error: 'That quotation could not be identified. Reload the page.' };

  const result = await apiPost<{ jobNumber: string; total: number; currency: string }>(
    'workshop',
    `/quotations/${quotationId}/submit`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: `Quotation submitted for approval — ${result.data.jobNumber}, ${result.data.currency} ${result.data.total}`,
  };
}

/** §5's internal approval — approve, or reject with a reason. */
export async function reviewQuotationAction(formData: FormData): Promise<ActionResult> {
  const quotationId = String(formData.get('quotationId') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!quotationId) return { error: 'That quotation could not be identified. Reload the page.' };
  if (decision !== 'approved' && decision !== 'rejected') {
    return { error: 'Choose whether to approve or reject the quotation.' };
  }
  if (decision === 'rejected' && note === '') {
    return { error: 'A rejection must say why — the price cannot be revised from “rejected” alone.' };
  }

  const result = await apiPost<{ jobNumber: string; status: string }>(
    'workshop',
    `/quotations/${quotationId}/review`,
    { decision, note: note === '' ? undefined : note },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created:
      result.data.status === 'approved'
        ? `Quotation approved for ${result.data.jobNumber} — it can now go to the customer`
        : `Quotation rejected for ${result.data.jobNumber} — the reason has been recorded`,
  };
}
