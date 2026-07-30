/**
 * Repair proposal rules — Phase 5, slice 6 (the Solution Studio).
 *
 * `1.txt` §396-§424 is DOMAIN 6 and `07.txt` §7 is the CUSTOMER APPROVAL FLOW.
 *
 * ⚠️ MIGRATION 017 IS THE AUTHORITY ON EVERY LIST BELOW — each restates a SQL CHECK,
 * and `proposal.spec.ts` compares them against the migration text.
 */

/**
 * The proposal lifecycle — §7's outcomes plus §424's versioning.
 *
 * `superseded` is the one that is not a customer action: §424 says a material change
 * creates a NEW VERSION, and the row it replaced has to say so rather than vanish.
 */
export const PROPOSAL_STATUSES = [
  'draft',
  'issued',
  'approved',
  'declined',
  'changes_requested',
  'superseded',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * §7 — what the customer may answer.
 *
 * §7 lists eight actions. Three are DECISIONS and five are requests that resolve to
 * one of them, which is why modelling all eight as statuses would put five values in
 * the record that nothing downstream could interpret:
 *
 *   · "Approve Full Quotation"      → `approved`, option `comprehensive`
 *   · "Approve Selected Items"      → `approved`, option `recommended`
 *     (slice 5 already models the split: optional lines are excluded from the
 *      headline total, so "selected items" IS the non-optional set)
 *   · "Reject Quotation"            → `declined`
 *   · "Request Modification"        → `changes_requested`, the note says what
 *   · "Request Explanation"         → `changes_requested`, ditto
 *   · "Request Alternative Parts"   → `changes_requested`, ditto
 *   · "Request Voice Consultation"  → `changes_requested` + a channel
 *   · "Request Video Consultation"  → `changes_requested` + a channel
 *
 * The note is MANDATORY for the two negative outcomes precisely because it carries
 * which of those five the customer meant.
 */
export const PROPOSAL_DECISIONS = ['approved', 'declined', 'changes_requested'] as const;
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

/**
 * §398-§402's repair options, as the customer's choice between them.
 *
 * `minimum` is deliberately ABSENT. Slice 5 models a quotation as chargeable lines
 * plus optional extras, which gives exactly two prices — the recommended repair and
 * the comprehensive one. A third tier would need a third price with nothing behind
 * it, and offering a customer a "minimum" figure the schema cannot compute is how a
 * quotation and an invoice come to disagree. When a minimum tier is genuinely priced,
 * it becomes a third value here and a third total there, together.
 */
export const PROPOSAL_OPTIONS = ['recommended', 'comprehensive'] as const;
export type ProposalOption = (typeof PROPOSAL_OPTIONS)[number];

/**
 * §7's channels. Recording HOW a decision arrived is what makes a disputed approval
 * investigable — "the customer approved it" with no channel is an assertion, not a
 * record.
 */
export const DECISION_CHANNELS = [
  'in_person',
  'telephone',
  'email',
  'sms',
  'customer_portal',
] as const;
export type DecisionChannel = (typeof DECISION_CHANNELS)[number];

export const DECISION_CHANNEL_LABEL: Record<string, string> = {
  in_person: 'In person',
  telephone: 'Telephone',
  email: 'Email',
  sms: 'SMS',
  customer_portal: 'Customer portal',
};

export function decisionChannelLabel(value: string): string {
  return DECISION_CHANNEL_LABEL[value] ?? value;
}

/**
 * Roles that may PREPARE and ISSUE a proposal to a customer.
 *
 * The same set that may prepare a quotation: this is the customer-facing half of the
 * workshop. `reception_staff` is central rather than incidental — §50 gives them the
 * customer, complaint, appointment and intake functions, and they are who a customer
 * actually speaks to.
 *
 * ⚠️ `technician` and `workshop_supervisor` ARE ABSENT. A proposal is a commercial
 * offer; the supervisor's authority under §50 is technical review and repair-plan
 * approval, and it stops at the customer's door.
 */
export const CAN_PREPARE_PROPOSAL = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
]);

/**
 * Roles that may RECORD the customer's decision.
 *
 * Identical to the set that may issue, and deliberately so — this is not a second
 * approval gate. The decision is the CUSTOMER'S; the staff member is a scribe, and
 * `decided_by_name` names the customer while `recorded_by` names the scribe. Making
 * this narrower would mean a customer standing at the desk could not be given an
 * answer by the person they are speaking to.
 *
 * ⚠️ THERE IS NO reviewer-is-not-the-submitter RULE HERE, and its absence is a
 * decision rather than an omission. Everywhere else in Phase 5 the two parties are
 * both workshop staff, so independence has to be enforced. Here the deciding party is
 * the customer, who is outside the system entirely — an independence check between
 * the issuer and the recorder would be theatre, and would block the single commonest
 * real case: reception issues a proposal and the customer answers them on the spot.
 * What protects this record instead is that the channel and the customer's name are
 * MANDATORY, and that the whole row freezes the moment it is decided (§424).
 */
export const CAN_RECORD_DECISION = CAN_PREPARE_PROPOSAL;

/**
 * Roles that may READ a proposal.
 *
 * The technician is here because §32-§33 has them CONFIRM THE CUSTOMER APPROVAL
 * before starting work — "repair work shall not start until the required approval is
 * received" (§7). A technician who cannot see the approval cannot check it.
 */
export const CAN_READ_PROPOSAL = new Set([
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
 * The stages at which a proposal is the work in hand.
 *
 * A proposal is DRAFTED once the price exists (`quotation_preparation`) and ISSUED
 * when it goes to the customer, which is what `awaiting_customer_approval` means. Both
 * are permitted because a workshop legitimately writes the covering narrative before
 * moving the card.
 */
export const PROPOSAL_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];

/** The state the source quotation must be in — §5's internal approval must precede §7's. */
export const REQUIRED_QUOTATION_STATUS = 'approved';
