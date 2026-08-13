'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Report a problem — `2.txt` §537, and the entry point to the repair lifecycle.
 *
 * A complaint IS a job card. `1.txt` §322 lists "Complaint received" as the
 * FIRST stage, so this does not create a separate complaint record that someone
 * later has to convert: it opens the job card the workshop will work from, at
 * the stage the specification starts it. One record, one lifecycle, no handover
 * step that can be forgotten.
 *
 * ⚠️ TEXT ONLY, DELIBERATELY, AND SAID OUT LOUD ON THE SCREEN. §537 also asks
 * for voice, photographs, dashboard-light images, video and uploaded OBD
 * results. Those need file storage, which this build does not have. Shipping a
 * disabled camera button would imply a capability that does not exist; naming
 * the gap does not.
 *
 * The vehicle is chosen from the customer's OWN garage, and `JobCardService`
 * re-checks that the vehicle belongs to a customer record linked to this user —
 * so a tampered vehicle id returns "vehicle not found" rather than opening a job
 * against somebody else's car (CLAUDE.md §8).
 */

interface Created {
  id: string;
  jobNumber: string;
}

export async function reportProblemAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const result = await apiPost<Created>('customer', '/job-cards', {
    vehicleId: read('vehicleId'),
    complaint: read('complaint'),
    priority: read('priority'),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Some details were not accepted. Check the fields and try again.')
        : result.reason === 'forbidden'
          ? 'Your account may not report a problem.'
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That vehicle is no longer on your account. Reload the page and try again.'
              : 'The service did not respond. Nothing has been sent — try again shortly.';
    return { error };
  }

  revalidatePath('/home/dashboard');
  return { created: result.data.jobNumber };
}
