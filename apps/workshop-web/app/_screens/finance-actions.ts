'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The slice 3 write actions — invoices, payments, credit notes, refunds.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives: an action defined inside a component file is one refactor away from
 * landing in a file that gains `'use client'`, at which point the session token
 * would be handled in the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. A server action is a public HTTP endpoint that
 * Next exposes one-per-action. `FinanceService` decides who may bill and — more
 * narrowly — who may refund, so a caller who reaches these without passing a
 * screen's gate is still refused (CLAUDE.md §8).
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // Both pass the API's own sentence through. `FinanceService`'s refusals
      // NAME WHO CAN do the thing ("ask reception, the cashier, the workshop
      // manager or the owner") and what to do instead ("record the payment",
      // "issue a credit note"). Replacing that with a generic "you may not"
      // throws away the only part the person can act on — and a refusal that
      // names no reachable alternative is a wall.
      return message ?? fallback;
    case 'notFound':
      return 'That invoice no longer exists — it may have been voided by someone else.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The billing service did not respond. Nothing was saved.';
  }
}

type Simple = { ok: true } | { ok: false; error: string };

export async function createInvoiceAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = { jobCardId: String(formData.get('jobCardId') ?? '') };
  const due = String(formData.get('dueAt') ?? '').trim();
  // A `datetime-local` value has no timezone; the API stores `timestamptz`, so
  // it is normalised here rather than letting Postgres guess.
  if (due) body.dueAt = new Date(due).toISOString();
  const notes = String(formData.get('notes') ?? '').trim();
  if (notes) body.notes = notes;

  const result = await apiPost<{ id: string; invoiceNumber: string }>(
    'workshop',
    '/invoices',
    body,
  );
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The invoice was not created.') };
  }
  revalidatePath('/', 'layout');
  return { created: result.data.invoiceNumber };
}

export async function addInvoiceLineAction(
  invoiceId: string,
  line: {
    lineKind: string;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
  },
  revalidate: string,
): Promise<Simple> {
  const result = await apiPost<unknown>('workshop', `/invoices/${invoiceId}/lines`, line);
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The line was not added.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

export async function changeInvoiceStatusAction(
  invoiceId: string,
  status: string,
  voidReason: string | undefined,
  revalidate: string,
): Promise<Simple> {
  const result = await apiPatch<unknown>('workshop', `/invoices/${invoiceId}/status`, {
    status,
    ...(voidReason?.trim() ? { voidReason: voidReason.trim() } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The invoice was not changed.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

/**
 * Record money that has arrived.
 *
 * ⚠️ RECORDED, NOT TAKEN. ADR-012 forbids a paid card processor, so somebody at
 * the desk marks that cash, a transfer or a cheque arrived. The screens say so
 * rather than implying the product charged anybody.
 */
export async function recordPaymentAction(
  invoiceId: string,
  payment: { amount: number; paymentMethod: string; reference?: string; notes?: string },
  revalidate: string,
): Promise<{ ok: true; receiptNumber: string } | { ok: false; error: string }> {
  const result = await apiPost<{ receiptNumber: string }>(
    'workshop',
    `/invoices/${invoiceId}/payments`,
    payment,
  );
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The payment was not recorded.') };
  }
  revalidatePath(revalidate);
  // The receipt number is returned so the desk can say it aloud while the
  // customer is still standing there.
  return { ok: true, receiptNumber: result.data.receiptNumber };
}

export async function issueCreditNoteAction(
  invoiceId: string,
  input: { amount: number; reason: string },
  revalidate: string,
): Promise<Simple> {
  const result = await apiPost<unknown>('workshop', `/invoices/${invoiceId}/credit-notes`, input);
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The credit note was not issued.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}

export async function issueRefundAction(
  paymentId: string,
  input: { amount: number; reason: string; refundMethod: string },
  revalidate: string,
): Promise<Simple> {
  const result = await apiPost<unknown>('workshop', `/payments/${paymentId}/refunds`, input);
  if (!result.ok) {
    return { ok: false, error: explain(result.reason, result.message, 'The refund was not issued.') };
  }
  revalidatePath(revalidate);
  return { ok: true };
}
