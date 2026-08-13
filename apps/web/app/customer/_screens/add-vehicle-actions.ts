'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The customer's own "add a vehicle" write — `2.txt` §537.
 *
 * ⚠️ THE `customerId` IS NOT A CHOICE, AND THAT IS THE POINT. On the workshop
 * side reception picks an owner from a list. Here there is no picker: the screen
 * resolves the viewer's OWN customer record and sends that id, because a
 * customer may only register vehicles to themselves.
 *
 * That is not enforced here — a server action is a public HTTP endpoint and this
 * one could be called with any id. `VehicleService.create` re-checks it: for a
 * viewer whose role is `customer` the parent lookup carries
 * `user_id = ctx.userId`, so an id belonging to anyone else returns "customer
 * not found". This module supplies the value; the service is what makes it true
 * (CLAUDE.md §8).
 */

interface Created {
  id: string;
  registrationNumber?: string;
}

function text(form: FormData, key: string): string | undefined {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? undefined : v;
}

function num(form: FormData, key: string): number | undefined {
  const v = text(form, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN; // NaN is rejected by the API's validator
}

export async function addVehicleAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost<Created>('customer', '/vehicles', {
    customerId: text(formData, 'customerId'),
    registrationNumber: text(formData, 'registrationNumber'),
    makeId: text(formData, 'makeId'),
    vin: text(formData, 'vin'),
    variant: text(formData, 'variant'),
    modelYear: num(formData, 'modelYear'),
    engineType: text(formData, 'engineType'),
    fuelType: text(formData, 'fuelType'),
    transmissionType: text(formData, 'transmissionType'),
    currentMileageKm: num(formData, 'currentMileageKm'),
    colour: text(formData, 'colour'),
    insurerName: text(formData, 'insurerName'),
    insurancePolicyNo: text(formData, 'insurancePolicyNo'),
    insuranceExpiresOn: text(formData, 'insuranceExpiresOn'),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Some details were not accepted. Check the fields and try again.')
        : result.reason === 'forbidden'
          ? 'Your account may not add vehicles.'
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              // What this means HERE: the viewer has no customer record to own
              // the vehicle. Saying "not found" would be true and useless.
              ? 'Your account is not yet linked to a customer profile, so there is nobody to register this vehicle to. Contact your workshop.'
              : 'The service did not respond. Nothing has been saved — try again shortly.';
    return { error };
  }

  revalidatePath('/my-vehicles/garage');
  return { created: result.data.registrationNumber ?? 'your vehicle' };
}
