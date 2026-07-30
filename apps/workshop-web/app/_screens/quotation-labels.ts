/**
 * Quotation labels and money formatting — shared by the server screens and the
 * client forms.
 *
 * ⚠️ A SEPARATE, PURE MODULE, the same discipline as `diagnosis-labels.ts` and
 * `repair-plan-labels.ts`: a `'use client'` form importing a constant out of a server
 * screen would drag that module — and its API client and token handling — into the
 * browser bundle. Nothing here imports anything.
 */

/** §5's internal approval states. `sent` is absent — issuing is slice 6. */
export const QUOTATION_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const QUOTATION_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  draft: 'draft',
  submitted: 'attention',
  approved: 'active',
  rejected: 'blocked',
};

/** §11's line categories. Mirrors `LINE_KINDS` in the API, which the drift test pins. */
export const LINE_KIND_ORDER = [
  'labour',
  'part',
  'consumable',
  'external_service',
  'other_charge',
] as const;

export const LINE_KIND_LABEL: Record<string, string> = {
  labour: 'Labour',
  part: 'Part',
  consumable: 'Consumable',
  external_service: 'External service',
  other_charge: 'Other charge',
};

/**
 * Money, in the quotation's OWN currency.
 *
 * ⚠️ THE CURRENCY IS ALWAYS PASSED IN, never defaulted here. Every amount on a
 * quotation is denominated in the code snapshot onto that quotation when it was
 * priced, and a formatter that quietly assumed one would render a GHS figure with a
 * different symbol the day a second currency exists — a wrong price that looks
 * perfectly formatted.
 *
 * `Intl.NumberFormat` with an explicit `en-GH`-agnostic locale: the grouping and the
 * decimal separator follow the viewer's own locale, which is what a human expects,
 * while the CODE is fixed by the data. Falls back to "CODE 1,234.56" if the runtime
 * does not know the code, rather than throwing on a screen showing a price.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * A quantity, with its unit.
 *
 * Trailing zeros dropped — `2 each` rather than `2.000 each` — because a quantity is
 * usually whole and three decimals claims a precision nobody asked for. Hours keep
 * whatever the technician estimated.
 */
export function formatQty(quantity: number, unit: string | null): string {
  const value = String(quantity);
  return unit ? `${value} ${unit}` : value;
}
