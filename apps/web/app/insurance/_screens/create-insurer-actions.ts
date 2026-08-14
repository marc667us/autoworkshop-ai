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
 * Register an insurance company — the CALLER for `POST /registration/insurance`.
 *
 * 🔴 WITHOUT THIS FILE THE ROUTE IS NOT SHIPPED. Migration 080 created
 * `identity.register_insurer` and the controller now exposes it, and neither
 * fact puts an insurance assessor in the database. `POST /registration/customer`
 * was deployed, gated, tested, answering 401 on live, and called by NOTHING for
 * a day — every gate green throughout. A route with no caller is as unshipped as
 * a caller with no route.
 *
 * ⚠️ `'use server'` IS THE FIRST STATEMENT IN THE FILE. An import above it fails
 * the BUILD while `tsc` and `eslint` stay green — a directive's POSITION is
 * neither a type error nor a lint rule, and that shipped on 2026-08-13.
 */
export async function createInsurerAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const insurerName = read('insurerName');
  // Checked here as well as at the API, because the API's message is written for
  // a developer reading a response body and this one is read by a person looking
  // at a form. The API's check is the one that enforces.
  if (!insurerName || insurerName.length < 2) {
    return { error: 'Enter your company name — at least two characters.' };
  }

  const result = await apiPost<Created>('insurance', '/registration/insurance', {
    insurerName,
    // Omitted rather than sent empty: the database substitutes a default, and
    // '' would fail the API's `min(1)` on a field deliberately left blank.
    ...(read('locationName') ? { locationName: read('locationName') } : {}),
  });

  if (!result.ok) {
    // 🔴 `invalid` COVERS 409, AND THE MESSAGE IS THE API'S OWN — it names a
    // reachable alternative ("sign in with a different account, or ask a
    // platform administrator"). A generic "could not create" would send somebody
    // to support over an organisation that already exists.
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'unauthenticated'
          ? 'Your session has ended. Sign in again, then retry.'
          : result.reason === 'forbidden'
            ? 'This account may not register an insurance company.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  // The WHOLE shell changes: the viewer now has a membership, so `/me` starts
  // answering, the navigation gains the insurance tree, and the top bar can name
  // them. A partial revalidation would leave the onboarding panel wrapped around
  // a company that now exists.
  //
  // ⚠️ NOT `revalidatePath('/insurance', 'layout')`. The artifact's ROOT layout
  // is what holds the shell after ADR-021, and the front door at `/` dispatches
  // on the viewer this call just changed.
  revalidatePath('/', 'layout');
  return { created: 'registered' };
}
