'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 12 write action — raising a warranty claim.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. The workspace id is the one character of
 * difference LOCAL TESTING CANNOT CATCH: `:3000` and `:3001` share a cookie jar
 * because cookies ignore the PORT, so a wrong id works on a developer's machine
 * and fails only on the deployed hosts. Three recorded instances.
 *
 * NOT the authorization point. `CustomerRecordsService` checks that the policy
 * belongs to the signed-in customer, against the database, because this action
 * is a public HTTP endpoint reachable with any policy id.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
    case 'notFound':
      // The API's own sentence. Its refusals name what to do instead — "your
      // warranties are listed on the Warranty page" — and that is the only part
      // the reader can act on.
      return message ?? fallback;
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Ask the workshop to add you as a customer.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The workshop could not be reached. Nothing was saved.';
  }
}

export async function raiseWarrantyClaimAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    policyId: String(formData.get('policyId') ?? ''),
    reportedFault: String(formData.get('reportedFault') ?? ''),
  };
  const km = String(formData.get('odometerReading') ?? '').trim();
  if (km !== '' && Number.isFinite(Number(km))) body.odometerReading = Math.floor(Number(km));

  const result = await apiPost('customer', '/my/warranty-claims', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The claim was not raised.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Claim raised. The workshop will assess it and you will see their decision here.' };
}
