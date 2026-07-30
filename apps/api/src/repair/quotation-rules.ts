/**
 * Quotation rules — Phase 5, slice 5.
 *
 * `07.txt` §9-§16 is the QUOTATION PREPARATION FLOW and `1.txt` §340 is the
 * `quotation_preparation` stage. Transcribed in the order the specification gives
 * them.
 *
 * ⚠️ MIGRATION 016 IS THE AUTHORITY ON EVERY LIST BELOW — each restates a SQL CHECK
 * constraint, and `quotation.spec.ts` compares them against the migration text.
 */

/** §5's internal approval. `sent` is absent: issuing to a customer is slice 6. */
export const QUOTATION_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_REVIEW_DECISIONS = ['approved', 'rejected'] as const;
export type QuotationReviewDecision = (typeof QUOTATION_REVIEW_DECISIONS)[number];

/**
 * §11's own categories.
 *
 * `part` and `consumable` stay distinct because §11 lists them separately, and the
 * storekeeper orders one and issues the other. `other_charge` is where a SURCHARGE
 * goes — the discount column is constrained non-negative precisely so a negative
 * discount cannot smuggle an unexplained increase past the customer.
 */
export const LINE_KINDS = [
  'labour',
  'part',
  'consumable',
  'external_service',
  'other_charge',
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const LINE_KIND_LABEL: Record<string, string> = {
  labour: 'Labour',
  part: 'Part',
  consumable: 'Consumable',
  external_service: 'External service',
  other_charge: 'Other charge',
};

export function lineKindLabel(value: string): string {
  return LINE_KIND_LABEL[value] ?? value;
}

/**
 * How a repair-plan resource kind maps onto a quotation line kind.
 *
 * §29's six resource kinds collapse to two priced ones: a PART or CONSUMABLE is
 * bought for the job and charged; a tool, lift, diagnostic rig or safety harness is
 * workshop equipment that is reserved, not sold. Anything absent from this map is
 * deliberately NOT auto-priced — the draft leaves it off rather than inventing a
 * charge for the workshop's own lift.
 */
export const RESOURCE_KIND_TO_LINE_KIND: Record<string, LineKind> = {
  part: 'part',
  consumable: 'consumable',
};

/**
 * Roles that may PREPARE a quotation — `07.txt` §11, "the Service Advisor or
 * authorized manager".
 *
 * ⚠️ `technician` IS ABSENT, and it is the boundary that matters most in this slice.
 * §50 gives the technician "assigned-job inspection, diagnosis, repair planning,
 * execution and testing" — pricing is not on that list, and a technician who can set
 * the price of their own work is the separation of duties this flow exists to create.
 * There is no Service Advisor role in this build's role set; §11's "or authorized
 * manager" is who holds it, plus reception, who is the customer-facing half (§50 gives
 * them "customer, vehicle, complaint, appointment, intake, INVOICE and release").
 */
export const CAN_PREPARE_QUOTATION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
]);

/**
 * Roles that may READ a quotation.
 *
 * The technician IS here — they must see what was quoted for the work they are about
 * to do, and §31's execution flow has them confirm the customer approval before
 * starting. Reading a price is not setting one.
 *
 * `customer` is ABSENT even though the quotation is ultimately FOR them: a DRAFT
 * quotation is the workshop's internal working figure, and §6 says the APPROVED one is
 * what gets sent. Slice 6 owns that boundary; publishing this table directly would put
 * an unapproved price in front of a customer.
 */
export const CAN_READ_QUOTATION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',
  'cashier',
  'storekeeper',
  'technician',
  'quality_control_inspector',
]);

/**
 * Roles that may APPROVE a quotation — §5's "internal approval where required".
 *
 * ⚠️ NARROWER THAN `CAN_PREPARE_QUOTATION`, and deliberately so: `reception_staff` can
 * draft a quotation but cannot approve one. A price is a commitment the business makes,
 * and §5 exists because somebody other than the preparer signs it. The
 * reviewer-is-not-the-preparer rule in the service is the second, narrower constraint —
 * a manager who drafted it themselves cannot also approve it (`2.txt` §563).
 */
export const CAN_APPROVE_QUOTATION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
]);

/**
 * The stage a job card must be at for a quotation to be prepared — `1.txt` §340.
 *
 * The lifecycle runs `solution_preparation → quotation_preparation →
 * awaiting_customer_approval`, so this is the one stage where a price is being made.
 */
export const QUOTATION_START_STAGE = 'quotation_preparation';

/** The state the source repair plan must be in — §10, "the APPROVED repair plan". */
export const REQUIRED_PLAN_STATUS = 'approved';

/** Fallbacks when an organisation has configured no pricing row. See migration 016. */
export const PRICING_DEFAULTS = {
  currency: 'GHS',
  labourRate: 0,
  taxName: 'VAT',
  taxRatePercent: 0,
  validityDays: 14,
} as const;
