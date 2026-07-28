'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The Phase 4 write actions.
 *
 * IN THEIR OWN `'use server'` MODULE, deliberately. A server action defined
 * inside a component file is easy to move by accident into a file that later
 * gains `'use client'`, at which point the credential handling below would run
 * in the browser. A module whose first line is `'use server'` cannot become a
 * client module without that line being deleted on purpose.
 *
 * These run on the SERVER, so `apiPost` reads the access token from the
 * httpOnly session cookie and it never reaches the browser.
 *
 * ⚠️ THEY ARE NOT THE AUTHORIZATION POINT. A server action is a public HTTP
 * endpoint — Next exposes one per action, callable directly. `CustomerService`
 * and `VehicleService` enforce who may create, so a caller who reaches these
 * without passing the screen's gate still gets refused by the API. Nothing here
 * may be relied on to protect anything (CLAUDE.md §8).
 */

interface Created {
  id: string;
  displayName?: string;
  registrationNumber?: string;
}

/**
 * Turn an `ApiResult` failure into one sentence the person can act on.
 *
 * `invalid` carries the API's own message because that is the only failure the
 * user can fix, and those messages describe the INPUT ("a vehicle with this
 * registration number or VIN already exists"), never the system. The rest get
 * fixed wording: a session or permission problem is not something to solve by
 * editing the form, and saying "check the fields" would send them in circles.
 */
function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  noun: string,
): string {
  switch (reason) {
    case 'invalid':
      return message ?? 'Some details were not accepted. Check the fields and try again.';
    case 'forbidden':
      return `Your account may not register ${noun}.`;
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then retry.';
    case 'notFound':
      return 'A record this refers to no longer exists. Reload the page and try again.';
    default:
      return 'The service did not respond. Nothing has been saved — try again shortly.';
  }
}

/** Trimmed, or omitted entirely — an empty string is not the same as "unset". */
function text(form: FormData, key: string): string | undefined {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? undefined : v;
}

/** A number, or omitted. Sent as a NUMBER: the API rejects numeric strings. */
function num(form: FormData, key: string): number | undefined {
  const v = text(form, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN; // NaN reaches the API and is rejected there
}

export async function registerCustomerAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<Created>('workshop', '/customers', {
    displayName: text(formData, 'displayName'),
    customerType: text(formData, 'customerType'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    preferredContact: text(formData, 'preferredContact'),
    location: text(formData, 'location'),
  });

  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'customers') };
  }

  // The list pages are `force-dynamic`, so this is belt and braces rather than
  // load-bearing — but it makes the new row appear immediately if either page is
  // ever cached, instead of leaving the user wondering whether the save worked.
  revalidatePath('/customers/customer-search');
  revalidatePath('/customer-reception/customers');
  revalidatePath('/customers-and-vehicles/customers');

  return { created: result.data.displayName ?? 'the customer' };
}

export async function registerVehicleAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<Created>('workshop', '/vehicles', {
    customerId: text(formData, 'customerId'),
    registrationNumber: text(formData, 'registrationNumber'),
    makeId: text(formData, 'makeId'),
    vin: text(formData, 'vin'),
    variant: text(formData, 'variant'),
    modelYear: num(formData, 'modelYear'),
    engineType: text(formData, 'engineType'),
    transmissionType: text(formData, 'transmissionType'),
    fuelType: text(formData, 'fuelType'),
    currentMileageKm: num(formData, 'currentMileageKm'),
    colour: text(formData, 'colour'),
    insurerName: text(formData, 'insurerName'),
    insurancePolicyNo: text(formData, 'insurancePolicyNo'),
    insuranceExpiresOn: text(formData, 'insuranceExpiresOn'),
  });

  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'vehicles') };
  }

  revalidatePath('/vehicles/vehicle-search');
  revalidatePath('/customer-reception/vehicles');
  revalidatePath('/customers-and-vehicles/vehicles');

  return { created: result.data.registrationNumber ?? 'the vehicle' };
}
