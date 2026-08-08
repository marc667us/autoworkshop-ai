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
    ...(trimmed ? { note: trimmed } : {}),
  });

  if (!result.ok) return { ok: false, message: failureMessage(result) };

  revalidatePath('/directory/registrations');
  return {
    ok: true,
    message:
      decision === 'approved'
        ? 'Approved — the business is now listed publicly.'
        : 'Rejected. Nothing has been published, and the business keeps its account.',
  };
}
