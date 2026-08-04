'use client';

import * as React from 'react';
import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { decideProposalAction } from './proposal-decision-actions';

/**
 * §7 — the customer's answer to a repair proposal, made by the customer.
 *
 * ⚠️ THIS FORM HAS A SUBMIT BUTTON, AND THAT SENTENCE IS HERE ON PURPOSE.
 * `FormShell` renders whatever children it is given and adds nothing; a form
 * shipped without one passed typecheck, lint AND `next build` in this repo on
 * 2026-08-03 and was found only by opening it in a browser.
 *
 * ── WHAT IS SENT, AND WHAT IS NOT ──────────────────────────────────────────
 *
 * Sent: the decision, the option (only when approving) and a note. NOT the
 * customer's name and NOT the channel — the API derives both, because on this
 * route they are the consent record rather than the caller's input. See
 * `proposal-decision-actions.ts`.
 */
export function ProposalDecisionForm({
  proposalId,
  recommendedTotal,
  comprehensiveTotal,
  currency,
}: {
  proposalId: string;
  recommendedTotal: number;
  comprehensiveTotal: number;
  currency: string;
}) {
  const [decision, setDecision] = React.useState('approved');
  const approving = decision === 'approved';

  const money = (n: number) =>
    `${currency} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      style={{
        marginTop: primitive.space[4],
        paddingTop: primitive.space[4],
        borderTop: `1px solid ${themeVar.borderDefault}`,
      }}
    >
      <FormShell action={decideProposalAction} successPrefix="">
        <input type="hidden" name="proposalId" value={proposalId} />

        <Field label="Your answer" htmlFor="decision">
          <Select
            id="decision"
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.currentTarget.value)}
            options={[
              { value: 'approved', label: 'Approve — go ahead with the work' },
              { value: 'changes_requested', label: 'Ask a question or request a change' },
              { value: 'declined', label: 'Decline — do not do the work' },
            ]}
          />
        </Field>

        {/*
          The option ONLY when approving. Rendering it beside a decline would
          invite the customer to pick a repair they are refusing, and the action
          drops it in that case anyway — but a control that is ignored is a
          control that lies.
        */}
        {approving ? (
          <Field label="Which option are you approving?" htmlFor="approvedOption">
            <Select
              id="approvedOption"
              name="approvedOption"
              defaultValue="recommended"
              options={[
                { value: 'recommended', label: `Recommended repair — ${money(recommendedTotal)}` },
                { value: 'comprehensive', label: `Comprehensive repair — ${money(comprehensiveTotal)}` },
              ]}
            />
          </Field>
        ) : null}

        <Field
          label={approving ? 'Anything to add (optional)' : 'Please say why — required'}
          htmlFor="note"
        >
          <TextInput
            id="note"
            name="note"
            // The API requires a note for anything that is not an approval, and
            // refusing server-side without saying so here would read as a bug.
            required={!approving}
            placeholder={
              approving
                ? 'Any instructions for the workshop'
                : 'What would you like changed, or why are you declining?'
            }
          />
        </Field>

        <SubmitButton>{approving ? 'Approve this repair' : 'Send my answer'}</SubmitButton>
      </FormShell>

      <p
        style={{
          margin: `${primitive.space[3]} 0 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
        }}
      >
        {/*
          The customer is told this is recorded against their name. An approval
          for chargeable work should not feel like an anonymous click.
        */}
        Your answer is recorded against your account, with the date and time, and
        the workshop can see it immediately.
      </p>
    </div>
  );
}
