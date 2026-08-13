'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { SubmitButton } from '@autoworkshop/ui';
import {
  setPartPublicationAction,
  setSupplierPublicationAction,
  type ActionOutcome,
} from './catalogue-review-actions';

/**
 * The publish / withdraw controls.
 *
 * ⚠️ THE OUTCOME IS ALWAYS RENDERED, SUCCESS INCLUDED, and that is not
 * decoration here. The defect this whole slice kept running into is an action
 * that reports success and changes nothing — an `UPDATE 0` raises no error, and
 * before migration 025 that is exactly what every publication did. A control
 * that shows nothing on success is indistinguishable from one that silently
 * failed. The list behind it re-renders from the database, so the two together
 * are the evidence.
 */

function Outcome({ outcome }: { outcome: ActionOutcome | null }) {
  if (!outcome) return null;
  return (
    <span
      role={outcome.ok ? 'status' : 'alert'}
      style={{
        marginLeft: primitive.space[2],
        fontSize: primitive.fontSize.sm,
        color: themeVar.textSecondary,
        fontWeight: outcome.ok ? 400 : 600,
      }}
    >
      {outcome.message}
    </span>
  );
}

export function SupplierDecision({
  supplierId,
  published,
}: {
  supplierId: string;
  published: boolean;
}) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <form
      action={async () => {
        // Publishing a supplier also VERIFIES it: "verified" is the reason a
        // stranger trusts a price (021), and an administrator who has just
        // reviewed the listing is exactly the person asserting it. Withdrawal
        // does not un-verify — the review still happened.
        setOutcome(await setSupplierPublicationAction(supplierId, !published, !published ? true : undefined));
      }}
      style={{ display: 'inline' }}
    >
      <SubmitButton>{published ? 'Withdraw listing' : 'Publish listing'}</SubmitButton>
      <Outcome outcome={outcome} />
    </form>
  );
}

export function PartDecision({ partId, published }: { partId: string; published: boolean }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <form
      action={async () => {
        setOutcome(await setPartPublicationAction(partId, !published));
      }}
      style={{ display: 'inline' }}
    >
      <SubmitButton>{published ? 'Withdraw part' : 'Publish part'}</SubmitButton>
      <Outcome outcome={outcome} />
    </form>
  );
}
