'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

interface Created {
  tenantId: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  roleName: string;
  verificationStatus: string;
}

/**
 * Register a fleet — the CALLER for `POST /registration/fleet`.
 *
 * 🔴 WITHOUT THIS FILE THE ROUTE IS NOT SHIPPED. Migration 075 created
 * `identity.register_fleet`, the controller now exposes it, and neither fact
 * puts a fleet operator in the database — `POST /registration/customer` was
 * deployed, gated, tested, answering 401 on live, and called by NOTHING for a
 * day. Every gate was green throughout.
 */
export async function createFleetAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const fleetName = read('fleetName');
  // Checked here as well as at the API, because the API's message is written
  // for a developer reading a response body and this one is read by a person
  // looking at a form. The API's check is the one that enforces.
  if (!fleetName || fleetName.length < 2) {
    return { error: 'Enter your fleet name — at least two characters.' };
  }

  // ⚠️ WORKSPACE `'fleet'`. This app's session cookie is
  // `authjs.session-token.fleet`; writing `'workshop'` here would read a cookie
  // that CANNOT EXIST on this host — and it would pass every local test, because
  // localhost ports share one cookie jar. This repository has made that exact
  // mistake three times.
  const result = await apiPost<Created>('fleet', '/registration/fleet', {
    fleetName,
    // Omitted rather than sent empty: the database substitutes a default, and
    // '' would fail the API's `min(1)` on a field deliberately left blank.
    ...(read('locationName') ? { locationName: read('locationName') } : {}),
  });

  if (!result.ok) {
    // 🔴 `invalid` COVERS 409, AND THE MESSAGE IS THE API'S OWN — it names a
    // reachable alternative ("sign in with a different account, or ask a
    // platform administrator to add you"). A generic "could not create" would
    // send somebody to support over an organisation that already exists.
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'unauthenticated'
          ? 'Your session has ended. Sign in again, then retry.'
          : result.reason === 'forbidden'
            ? 'This account may not register a fleet.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  // The WHOLE shell changes: the viewer now has a membership, so `/me` starts
  // answering, the navigation gains the fleet tree, and the top bar can name
  // them. A partial revalidation would leave the onboarding panel wrapped around
  // a fleet that now exists.
  revalidatePath('/', 'layout');
  return { created: 'registered' };
}
