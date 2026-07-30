/**
 * Proposal labels — shared by the server screens and the client forms.
 *
 * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
 * form importing a constant out of a server screen would drag that module — and its
 * API client and token handling — into the browser bundle. Nothing here imports
 * anything.
 */

/** §7's outcomes plus §424's versioning. */
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'With the customer',
  approved: 'Approved by customer',
  declined: 'Declined',
  changes_requested: 'Changes requested',
  superseded: 'Superseded',
};

/**
 * `issued` is `attention` because it is WAITING ON SOMEBODY OUTSIDE the workshop — the
 * state most likely to be forgotten, since no colleague is chasing it.
 * `changes_requested` is `blocked`: the workshop must act. `superseded` is muted — a
 * real record, deliberately quiet, so a version history does not shout.
 */
export const PROPOSAL_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  draft: 'draft',
  issued: 'attention',
  approved: 'active',
  declined: 'blocked',
  changes_requested: 'blocked',
  superseded: 'draft',
};

/** §7's channels — recording HOW a decision arrived is what makes it investigable. */
export const DECISION_CHANNEL_ORDER = [
  'in_person',
  'telephone',
  'email',
  'sms',
  'customer_portal',
] as const;

export const DECISION_CHANNEL_LABEL: Record<string, string> = {
  in_person: 'In person',
  telephone: 'Telephone',
  email: 'Email',
  sms: 'SMS',
  customer_portal: 'Customer portal',
};

/** §398-§402's tiers, as the customer chooses between them. */
export const PROPOSAL_OPTION_LABEL: Record<string, string> = {
  recommended: 'Recommended repair only',
  comprehensive: 'Recommended repair plus the optional extras',
};

/** Money in the proposal's own currency — never defaulted, see the quotation labels. */
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
