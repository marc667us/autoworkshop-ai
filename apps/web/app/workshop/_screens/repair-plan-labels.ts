/**
 * Repair plan labels — shared by the server screens and the client forms.
 *
 * ⚠️ A SEPARATE, PURE MODULE ON PURPOSE, the same discipline as
 * `diagnosis-labels.ts` and `inspection-labels.ts`. `repair-plan-sheet-screen.tsx`
 * is an async server component; a `'use client'` form importing a constant out of it
 * would drag that module — and everything it imports, including the API client and
 * its token handling — into the client bundle.
 *
 * Nothing here imports anything. That is the property that makes it safe for both
 * sides.
 */

/** The four plan states, for the queue and the sheet header. */
export const PLAN_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  submitted: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * `StatusBadge` kinds for the plan itself.
 *
 * `submitted` is `attention` because it is WAITING ON SOMEBODY — a supervisor's queue
 * is the thing this badge has to surface. `rejected` is `blocked`: the technician
 * must act, and a muted rejection is one that gets missed.
 */
export const PLAN_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  in_progress: 'draft',
  submitted: 'attention',
  approved: 'active',
  rejected: 'blocked',
};

/**
 * `07.txt` §29's resource kinds, in the specification's order.
 *
 * ⚠️ THIS LIST AND `RESOURCE_KINDS` IN THE API ARE TWO STATEMENTS OF ONE RULE, and
 * the API's is checked against migration 014 by a drift test. This copy exists
 * because a client bundle cannot import from `apps/api`; it is the FORM's options,
 * and the server rejects anything not in its own list, so a drift here produces a
 * clear 400 rather than a wrong row.
 */
export const RESOURCE_KIND_ORDER = [
  'part',
  'consumable',
  'tool',
  'diagnostic_equipment',
  'lifting_equipment',
  'safety_equipment',
] as const;

export const RESOURCE_KIND_LABEL: Record<string, string> = {
  part: 'Part',
  consumable: 'Consumable',
  tool: 'Tool',
  diagnostic_equipment: 'Diagnostic equipment',
  lifting_equipment: 'Lifting equipment',
  safety_equipment: 'Safety equipment',
};

/**
 * Which kinds a quotation prices as MATERIALS.
 *
 * Mirrors `MATERIAL_KINDS` in the API. Used to group the resource list, because
 * "what must be bought" and "what must be booked out of the tool store" are two
 * different people's jobs and a single undifferentiated list serves neither.
 */
export const MATERIAL_KINDS: readonly string[] = ['part', 'consumable'];

/**
 * How many hours read on screen.
 *
 * `1.5` is a worse thing to show a technician than `1.50 h` — the trailing digit is
 * what says the value is precise to the minute rather than rounded. Kept here rather
 * than inline so the queue, the sheet and the form cannot format it three ways.
 */
export function formatHours(hours: number | null): string {
  if (hours === null) return 'Not estimated';
  return `${hours.toFixed(2)} h`;
}

/**
 * How a quantity reads on screen.
 *
 * The opposite decision to the hours, and for a reason: quantities are usually whole
 * ("1 each") and `1.000 each` reads as though a precision were being claimed that
 * nobody asked for. Trailing zeros are dropped, so 0.5 litres still shows as `0.5`.
 */
export function formatQuantity(quantity: number, unit: string | null): string {
  const value = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return unit ? `${value} ${unit}` : value;
}
