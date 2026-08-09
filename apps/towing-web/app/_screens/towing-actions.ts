'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, apiPut } from '@autoworkshop/next-shell';

/**
 * Server actions for the towing workspace.
 *
 * ⚠️ EVERY ONE REVALIDATES THE PATHS ITS WRITE CHANGES, not just the page it
 * was submitted from. Dispatching a recovery changes the dispatch board, the
 * active list, the driver roster, the truck list AND the dashboard counts; a
 * revalidate of only the current route leaves five screens quietly stale, and
 * a dispatcher who sees a truck as free is a dispatcher who double-books it.
 *
 * ⚠️ THESE ARE THE ONLY WRITE PATHS IN THIS APP. The API refuses independently
 * — `assertTowingStaff` plus migration 074's RLS — so nothing here is the
 * security boundary. It is the reachable caller, which this repository has
 * repeatedly shipped routes without.
 */

const BOARD_PATHS = [
  '/operations/dashboard',
  '/operations/new-requests',
  '/operations/dispatch-board',
  '/operations/active-recoveries',
  '/operations/completed-recoveries',
  '/operations/drivers',
  '/operations/recovery-vehicles',
];

function refresh(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export async function dispatchAction(formData: FormData): Promise<void> {
  await apiPost('towing', '/towing/recoveries', {
    requestId: String(formData.get('requestId') ?? ''),
    driverId: String(formData.get('driverId') ?? ''),
    vehicleId: String(formData.get('vehicleId') ?? ''),
  });
  refresh(BOARD_PATHS);
}

export async function advanceRecoveryAction(formData: FormData): Promise<void> {
  const id = String(formData.get('recoveryId') ?? '');
  const status = String(formData.get('status') ?? '');
  const distanceRaw = String(formData.get('distanceKm') ?? '').trim();
  const cancelReason = String(formData.get('cancelReason') ?? '').trim();

  await apiPatch('towing', `/towing/recoveries/${id}`, {
    status,
    // Only send what was actually typed. An empty box must not become 0 km —
    // that would price a completed recovery at the call-out fee alone and look
    // like a deliberate discount.
    ...(distanceRaw ? { distanceKm: Number(distanceRaw) } : {}),
    ...(cancelReason ? { cancelReason } : {}),
  });
  refresh([...BOARD_PATHS, '/operations/incidents', '/operations/invoices']);
}

export async function addDriverAction(formData: FormData): Promise<void> {
  const licenceExpires = String(formData.get('licenceExpires') ?? '').trim();
  const licenceNumber = String(formData.get('licenceNumber') ?? '').trim();
  await apiPost('towing', '/towing/drivers', {
    fullName: String(formData.get('fullName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    ...(licenceNumber ? { licenceNumber } : {}),
    ...(licenceExpires ? { licenceExpires } : {}),
  });
  refresh(['/operations/drivers', '/operations/dispatch-board', '/operations/dashboard']);
}

export async function addVehicleAction(formData: FormData): Promise<void> {
  const capacityRaw = String(formData.get('capacityKg') ?? '').trim();
  await apiPost('towing', '/towing/vehicles', {
    registration: String(formData.get('registration') ?? ''),
    label: String(formData.get('label') ?? ''),
    vehicleType: String(formData.get('vehicleType') ?? 'flatbed'),
    ...(capacityRaw ? { capacityKg: Number(capacityRaw) } : {}),
  });
  refresh(['/operations/recovery-vehicles', '/operations/dispatch-board', '/operations/dashboard']);
}

export async function reportIncidentAction(formData: FormData): Promise<void> {
  await apiPost('towing', '/towing/incidents', {
    recoveryId: String(formData.get('recoveryId') ?? ''),
    kind: String(formData.get('kind') ?? 'other'),
    severity: String(formData.get('severity') ?? 'low'),
    summary: String(formData.get('summary') ?? ''),
  });
  refresh(['/operations/incidents', '/operations/dashboard']);
}

export async function raiseInvoiceAction(formData: FormData): Promise<void> {
  const otherRaw = String(formData.get('otherCharges') ?? '').trim();
  await apiPost('towing', '/towing/invoices', {
    recoveryId: String(formData.get('recoveryId') ?? ''),
    ...(otherRaw ? { otherCharges: Number(otherRaw) } : {}),
  });
  refresh(['/operations/invoices', '/operations/completed-recoveries', '/operations/dashboard']);
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const num = (name: string) => {
    const raw = String(formData.get(name) ?? '').trim();
    return raw === '' ? undefined : Number(raw);
  };
  const radius = num('serviceRadiusKm');
  const notes = String(formData.get('dispatchNotes') ?? '').trim();

  await apiPut('towing', '/towing/settings', {
    currency: String(formData.get('currency') ?? 'GHS'),
    calloutFee: num('calloutFee'),
    ratePerKm: num('ratePerKm'),
    // Explicit null clears the value; `undefined` would be omitted from the
    // body and the API would leave it unchanged. Giving `null` a meaning means
    // re-checking every path that already produces it — a recorded lesson.
    serviceRadiusKm: radius === undefined ? null : radius,
    operates24h: formData.get('operates24h') === 'on',
    dispatchNotes: notes === '' ? null : notes,
  });
  refresh(['/operations/settings', '/operations/invoices', '/operations/dashboard']);
}
