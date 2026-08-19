'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The fleet's write paths — slice 20, over migration 087 and ADR-023.
 *
 * 🔴 WITHOUT THIS FILE THE ROUTES ARE NOT SHIPPED. `POST /fleet/drivers` and
 * `POST /fleet/service-requests` exist and were proven on a running server, and
 * neither fact puts a driver on a roster or a van into a workshop. A route with
 * no caller is as unshipped as a caller with no route — this repository has
 * recorded both directions, most expensively when `POST /registration/customer`
 * was deployed, gated, tested, 401ing on live and called by nothing for a day.
 *
 * ⚠️ AND THE CREATE FORMS LIVE ON THE LIST SCREENS, not behind an "Add new"
 * that leads somewhere else. `quickCreateHref` resolves out of the viewer's own
 * navigation and returns null when the route is not advertised, so a button
 * pointing at an unadvertised create route renders nothing at all. The towing
 * roster made the same choice for the same reason.
 */

export async function addFleetDriverAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const fullName = read('fullName');
  if (!fullName || fullName.length < 2) {
    return { error: 'Give the driver a name — at least two characters.' };
  }

  const result = await apiPost('fleet', '/fleet/drivers', {
    fullName,
    ...(read('licenceNumber') ? { licenceNumber: read('licenceNumber') } : {}),
    ...(read('licenceExpiresOn') ? { licenceExpiresOn: read('licenceExpiresOn') } : {}),
    ...(read('phone') ? { phone: read('phone') } : {}),
    ...(read('email') ? { email: read('email') } : {}),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'forbidden'
          ? // The API's own sentence names the way forward — register a fleet,
            // or use the incoming-requests route if you are the workshop.
            (result.message ?? 'Only a fleet operator may add drivers.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  revalidatePath('/fleet/fleet-assets/drivers');
  return { created: 'Driver added to the roster.' };
}

/**
 * Raise a service request with a workshop.
 *
 * ⚠️ THE FORM NAMES A WORKSHOP FROM THE PUBLISHED DIRECTORY, NEVER AN
 * ORGANISATION ID. ADR-023 decision 2: the workshop is addressed through its
 * public directory row, and migration 087's trigger derives the organisation
 * from it — that derived column is what the workshop-side RLS predicate reads,
 * so a caller-supplied organisation would be a caller-supplied tenant boundary.
 */
export async function raiseServiceRequestAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const vehicleId = read('vehicleId');
  const workshopDirectoryId = read('workshopDirectoryId');
  const summary = read('summary');

  if (!vehicleId) return { error: 'Choose which vehicle this is for.' };
  if (!workshopDirectoryId) return { error: 'Choose a workshop to send this to.' };
  if (!summary || summary.length < 3) {
    return { error: 'Say briefly what is needed — at least a few words.' };
  }

  // ⚠️ PARSED HERE, because a form sends strings and the API's zod schema takes
  // `z.number()`. Sending "82000" where a number is expected is a 400 that
  // reads like a server fault to the person who typed a correct mileage.
  const odometerRaw = read('odometerKm');
  const odometerKm = odometerRaw === undefined ? undefined : Number(odometerRaw);
  if (odometerKm !== undefined && (!Number.isInteger(odometerKm) || odometerKm < 0)) {
    return { error: 'Enter the odometer reading in whole kilometres, or leave it blank.' };
  }

  const result = await apiPost('fleet', '/fleet/service-requests', {
    vehicleId,
    workshopDirectoryId,
    requestType: read('requestType') ?? 'service',
    summary,
    ...(read('detail') ? { detail: read('detail') } : {}),
    ...(read('priority') ? { priority: read('priority') } : {}),
    ...(read('preferredDate') ? { preferredDate: read('preferredDate') } : {}),
    ...(odometerKm !== undefined ? { odometerKm } : {}),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? // 🔴 THE DATABASE'S OWN SENTENCE, PASSED THROUGH. A workshop that has
          // withdrawn from the directory produces "that workshop is not
          // currently accepting requests…", which tells the person what to do.
          // A generic "could not create" would send them to support.
          (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Only a fleet operator may raise a service request.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That vehicle is no longer in your fleet. Reload the page.'
              : 'The service did not respond. Nothing has been sent — try again shortly.';
    return { error };
  }

  // Every route that renders the fleet's requests — the list, and the three
  // filtered views over the same data.
  for (const p of [
    '/fleet/service-management/service-requests',
    '/fleet/service-management/appointments',
    '/fleet/service-management/repairs-in-progress',
    '/fleet/service-management/completed-repairs',
  ]) {
    revalidatePath(p);
  }
  return { created: 'Sent to the workshop. They will accept or decline it.' };
}
