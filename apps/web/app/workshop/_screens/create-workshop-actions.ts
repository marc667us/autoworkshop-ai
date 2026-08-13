'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Create the caller's workshop — `07.txt` part 2 §5 (workshop sign-up).
 *
 * The end of the chain that starts at Keycloak: sign up there, the first API
 * call provisions the application user, and this turns that user into an
 * organisation with themselves as `workshop_owner`.
 *
 * ⚠️ THE BODY NAMES THE WORKSHOP AND NOTHING ELSE. The owner is taken from the
 * validated token subject, server-side. Sending a user id here would be
 * refused: `validatedBody` applies `.strict()`, so an unexpected field is a 400
 * rather than a value somebody downstream might trust. Measured, not assumed —
 * a body carrying `userId` returns "contains an unexpected field".
 */

interface Created {
  tenantId: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  roleName: string;
}

export async function createWorkshopAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const workshopName = read('workshopName');
  // Checked here as well as at the API, because the API's message is written
  // for a developer reading a response body and this one is read by a person
  // looking at a form. The API's check is the one that enforces.
  if (!workshopName || workshopName.length < 2) {
    return { error: 'Enter the name of your workshop — at least two characters.' };
  }

  const result = await apiPost<Created>('workshop', '/registration/workshop', {
    workshopName,
    // Omitted rather than sent empty: the database substitutes "Main branch",
    // and sending '' would fail the API's `min(1)` on a field the person
    // deliberately left blank.
    ...(read('branchName') ? { branchName: read('branchName') } : {}),
  });

  if (!result.ok) {
    // 🔴 `invalid` COVERS 409 HERE, AND THE MESSAGE IS THE API'S OWN. A second
    // submission — which is what a double-clicked button IS — gets "This
    // account already has a workshop. Sign in and open your dashboard." That
    // sentence is worth passing through verbatim: a generic "could not create"
    // would send somebody to support over a workshop that already exists and is
    // waiting for them. This route used to answer 500 for exactly that case.
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'unauthenticated'
          ? 'Your session has ended. Sign in again, then retry.'
          : result.reason === 'forbidden'
            ? 'This account may not create a workshop.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  // The WHOLE shell changes: the viewer now has a membership, so `/me` starts
  // answering, the navigation gains a role tree, and the top bar can finally
  // name them. Revalidating the layout is what makes that appear without a
  // manual reload — a partial revalidation would leave the onboarding panel
  // wrapped around a workshop that now exists.
  revalidatePath('/', 'layout');
  return { created: 'ready' };
}
