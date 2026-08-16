'use client';

import * as React from 'react';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { SubmitButton } from '@autoworkshop/ui';
import {
  verifyInsuranceProductAction,
  withdrawInsuranceProductAction,
  type ActionOutcome,
} from './insurance-review-actions';

/**
 * Verify / withdraw controls.
 *
 * ⚠️ THE OUTCOME IS ALWAYS RENDERED, SUCCESS INCLUDED. Same reasoning as
 * `catalogue-review-controls.tsx`, and it is not decoration: an admin UPDATE
 * that matches no RLS policy affects zero rows and RAISES NOTHING, which is
 * exactly what every parts publication did before migration 025. A control that
 * shows nothing on success is indistinguishable from one that silently failed.
 * The list behind it re-renders from the database, so the two together are the
 * evidence.
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

export function VerifyDecision({ productId }: { productId: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <form
      action={async () => {
        setOutcome(await verifyInsuranceProductAction(productId));
      }}
      style={{ display: 'inline' }}
    >
      <SubmitButton>Verify product</SubmitButton>
      <Outcome outcome={outcome} />
    </form>
  );
}

export function WithdrawDecision({ productId }: { productId: string }) {
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  return (
    <form
      action={async () => {
        setOutcome(await withdrawInsuranceProductAction(productId));
      }}
      style={{ display: 'inline' }}
    >
      {/* The label says what it actually does. Withdrawing verification also
          UNLISTS the product in the same statement, and a button reading only
          "Withdraw verification" would understate that. */}
      <SubmitButton>Withdraw and unlist</SubmitButton>
      <Outcome outcome={outcome} />
    </form>
  );
}
