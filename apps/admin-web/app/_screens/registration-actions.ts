'use server';

import { revalidatePath } from 'next/cache';
import { apiPost, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Approving or rejecting a self-registered business.
 *
 * ⚠️ WORKSPACE `'admin'`, WHICH SELECTS THE KEYCLOAK CLIENT whose token is
 * attached — and the tenant context derived from it is what sets
 * `app.current_role`. A decision sent from any other workspace's session is not
 * merely wrong-audience: it is a request with no administrator role behind it,
 * and migration 069's UPDATE policy would match zero rows.
 *
 * 🔴 APPROVING IS WHAT PUBLISHES. The API flips
 * `catalogue.mechanic_directory.is_published` or
 * `catalogue.suppliers.is_published` / `.is_verified` in the SAME transaction as
 * the decision, so there is no state where an administrator has approved a
 * business that stays invisible. Until then the business can sign in and set
 * itself up, and no stranger can see it.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    // The API's own sentences are worth passing through: "Say why it was
    // rejected", and the refusal that names who may decide instead.
    return result.message ?? 'That decision was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') {
    return 'That registration could not be found — a colleague may have decided it already.';
  }
  return 'The decision could not be recorded just now. Nothing has been changed.';
}

export async function decideRegistrationAction(
  registrationId: string,
  decision: 'approved' | 'rejected',
  note: string,
  /**
   * The status the screen was showing when the button was pressed.
   *
   * 🔴 THIS IS WHAT MAKES A RE-DECISION POSSIBLE AND A RACE IMPOSSIBLE. The API
   * pins its UPDATE to this value, so two administrators deciding at the same
   * moment produce ONE decision and the loser is told the row moved — rather
   * than both being told they succeeded and the registry flag landing on
   * whichever committed last.
   */
  expectedStatus: 'pending' | 'approved' | 'rejected',
): Promise<ActionOutcome> {
  const trimmed = note.trim();
  // Checked here as well as in the API, because this message is read by a
  // person looking at a form and the API's is written for a response body. The
  // API's check is the one that enforces.
  if (decision === 'rejected' && trimmed === '') {
    return {
      ok: false,
      message: 'Say why it was rejected — the business is shown this, and a refusal with no reason cannot be acted on.',
    };
  }

  const result = await apiPost<unknown>('admin', `/registrations/${registrationId}/decision`, {
    decision,
    expectedStatus,
    ...(trimmed ? { note: trimmed } : {}),
  });

  if (!result.ok) return { ok: false, message: failureMessage(result) };

  revalidatePath('/directory/registrations');
  return {
    ok: true,
    message:
      decision === 'approved'
        ? // ⚠️ "LISTED" IS NOT PROMISED UNCONDITIONALLY ANY MORE. Approval
          // publishes the registry row, and migration 072 guarantees one
          // exists — but a workshop that has not filled in its city still
          // shows a placeholder. Saying what happened, not what it looks like.
          'Approved and published. The business appears publicly once its own profile is complete.'
        : // Reversal is reachable, so say so — otherwise an administrator who
          // rejects by mistake goes looking for support.
          'Rejected. Nothing is published, the business keeps its account, and you can approve it later if that changes.',
  };
}
