import { z } from 'zod';
import { money, optionalText, requiredText, uuid } from '../common/validation/validated-body';

/**
 * Request schemas for the finance controller — slice 3.
 *
 * Same division as the rest of the API: these refuse what is STRUCTURALLY
 * impossible, and `FinanceService` + `finance-rules.ts` refuse what is
 * contextually wrong. Invoice statuses are NOT enumerated here —
 * `parseInvoiceTransition` owns them, because whether a move is legal depends on
 * the CURRENT status, which no flat enum can express.
 */

export const CreateInvoiceBody = z
  .object({
    jobCardId: uuid(),
    dueAt: optionalText(40),
    notes: optionalText(2000),
  })
  .strict();
export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBody>;

/** Mirrors migration 042's CHECK, which mirrors `repair.quotation_lines`. */
const LINE_KINDS = ['labour', 'part', 'consumable', 'external_service', 'other_charge'] as const;

export const AddInvoiceLineBody = z
  .object({
    lineKind: z.enum(LINE_KINDS),
    description: requiredText(1000),
    quantity: z.number().positive().max(1_000_000),
    unit: optionalText(40),
    unitPrice: money(),
  })
  .strict();
export type AddInvoiceLineBody = z.infer<typeof AddInvoiceLineBody>;

export const ChangeInvoiceStatusBody = z
  .object({ status: requiredText(40), voidReason: optionalText(1000) })
  .strict();
export type ChangeInvoiceStatusBody = z.infer<typeof ChangeInvoiceStatusBody>;

/**
 * ⚠️ NO `card_online`. ADR-012 forbids a paid processor, so this product
 * RECORDS a payment rather than taking one. Offering a method the workshop
 * cannot honour would be a promise the screen makes and the desk cannot keep.
 * Mirrors migration 042's CHECK.
 */
const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'cheque',
  'mobile_money',
  'card_terminal',
  'credit_note',
  'other',
] as const;

export const RecordPaymentBody = z
  .object({
    amount: money(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    reference: optionalText(200),
    notes: optionalText(2000),
  })
  .strict();
export type RecordPaymentBody = z.infer<typeof RecordPaymentBody>;

export const CreditNoteBody = z
  .object({ amount: money(), reason: requiredText(1000) })
  .strict();
export type CreditNoteBody = z.infer<typeof CreditNoteBody>;

const REFUND_METHODS = [
  'cash',
  'bank_transfer',
  'cheque',
  'mobile_money',
  'card_terminal',
  'other',
] as const;

export const RefundBody = z
  .object({
    amount: money(),
    reason: requiredText(1000),
    refundMethod: z.enum(REFUND_METHODS),
  })
  .strict();
export type RefundBody = z.infer<typeof RefundBody>;
