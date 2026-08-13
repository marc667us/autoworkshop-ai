'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * File a Request for Service at a workshop the customer chose — the owner's
 * value chain, step 5.
 *
 * ⚠️ THE AUTHOR IS NEVER SENT. `POST /service-requests` takes it from the
 * validated token subject, and the API's schema does not accept one, so there is
 * nothing here to forget to omit. A client-supplied author would let anybody
 * file a request in another person's name.
 *
 * ⚠️ AND THE WORKSHOP IS NOT VALIDATED HERE. A server action is a public HTTP
 * endpoint exactly like a controller route, so a check written in this file
 * protects nothing (CLAUDE.md §8). The API confirms the organisation exists IN
 * THIS TENANT, and RLS confirms it again. What this function owns is the
 * MESSAGE the person reads.
 */
// `ActionResult` from `@autoworkshop/ui` — `{ error?, created? }`. Reused rather
// than a local shape, because `FormShell` renders the outcome and a divergent
// result type would compile and then display nothing.
export async function requestServiceAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const organizationId = read('organizationId');
  if (!organizationId) {
    // Reachable by opening the form with no `?workshop=`, which is a link
    // somebody typed rather than followed. Say what to do rather than posting a
    // request nobody will receive.
    return { error: 'Choose a workshop first — open this form from a workshop in the directory.' };
  }

  // 🔴 ENROL FIRST, OR THE REQUEST BELOW 401s — AND `POST /registration/customer`
  // HAD NO CALLER AT ALL UNTIL THIS LINE.
  //
  // Measured 2026-08-08: `identity.memberships` has only two writers in the
  // product — `register_workshop` (grants workshop_owner) and the admin-only
  // `MembershipService.grant()`. Neither can produce a `customer`. So a real
  // Keycloak sign-up reached this form holding NO membership, and
  // `POST /service-requests` — which is behind `TenantGuard` — refused them.
  // The whole funnel ended on a wall.
  //
  // Migration 061 and `POST /registration/customer` were built to fix that, and
  // then nothing called them: the route was deployed, gated, tested and
  // unreachable. That is the "complete service with no reachable caller" defect
  // this repository has already shipped once, found here by grepping for a
  // caller rather than by trusting that building the route was the job.
  //
  // ⚠️ ON SUBMIT, NOT ON RENDER, AND THAT IS THE CONSENT BOUNDARY. Enrolling
  // when the page loads would give somebody a membership at every workshop
  // whose form they merely opened. Pressing Send is the act that says "I am
  // becoming this garage's customer".
  //
  // ⚠️ ITS FAILURE IS NOT FATAL HERE. The API refuses an unpublished workshop
  // and an account that already holds a staff role there, and both of those
  // deserve the request's own error handling below rather than a second,
  // differently-worded wall. It is idempotent by design (migration 061), so a
  // customer who is already enrolled simply gets their existing membership back.
  const enrolment = await apiPost<{ created: boolean }>('customer', '/registration/customer', {
    organizationId,
  });
  if (!enrolment.ok && enrolment.reason === 'unauthenticated') {
    // Said here rather than after the request, because at this point NOTHING
    // has been sent and the person can still recover what they typed.
    return { error: 'Your session has ended. Sign in again, then resend — nothing has been sent.' };
  }

  const result = await apiPost<{ id: string }>('customer', '/service-requests', {
    organizationId,
    vehicleId: read('vehicleId'),
    vehicleDescription: read('vehicleDescription'),
    registrationNumber: read('registrationNumber'),
    complaint: read('complaint'),
    preferredContact: read('preferredContact'),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Some details were not accepted. Check the fields and try again.')
        : result.reason === 'unauthenticated'
          ? 'Your session has ended. Sign in again, then resend — nothing has been sent.'
          : result.reason === 'forbidden'
            ? 'Your account may not send a service request.'
            : result.reason === 'notFound'
              ? 'That workshop is no longer listed. Choose another from the directory.'
              : // ⚠️ "Nothing has been sent" is load-bearing. Without it the person
                // cannot tell whether to retry, and a duplicated request means two
                // workshops booking the same car.
                'The service did not respond. Nothing has been sent — try again shortly.';
    return { error };
  }

  revalidatePath('/service-and-repairs/service-requests');
  revalidatePath('/home/dashboard');
  return { created: result.data.id };
}
