'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Register the caller's parts supplier — owner request, 2026-08-09.
 *
 * The end of the chain that starts at the landing page's "Register as parts
 * supplier" button: sign up at Keycloak, the first API call provisions the
 * application user, and this turns that user into a `parts_supplier`
 * organisation with themselves as `supplier_owner`.
 *
 * 🔴 UNTIL MIGRATION 068 NOTHING IN THE PRODUCT COULD DO THIS. `supplier_owner`
 * appeared in the permission matrix, in `ROLE_PRECEDENCE`, in this app's
 * navigation tree — and the only two writers of `identity.memberships` were
 * `register_workshop` (always `workshop_owner`) and an admin-only grant. A
 * button shipped before that migration would have produced an account that
 * signs in successfully and is refused by every supplier route. That is exactly
 * what happened to the `customer` role, and it survived every test because the
 * dev seed script INSERTs the membership with raw SQL.
 *
 * ⚠️ THE BODY NAMES THE SUPPLIER AND NOTHING ELSE. The owner is taken from the
 * validated token subject server-side, and the ROLE is a literal inside
 * migration 068 — there is no argument anywhere on this path that can change
 * it. `validatedBody` applies `.strict()`, so an unexpected field is a 400
 * rather than a value somebody downstream might trust.
 */

interface Created {
  tenantId: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
  roleName: string;
  verificationStatus: string;
}

export async function createSupplierAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const supplierName = read('supplierName');
  // Checked here as well as at the API, because the API's message is written
  // for a developer reading a response body and this one is read by a person
  // looking at a form. The API's check is the one that enforces.
  if (!supplierName || supplierName.length < 2) {
    return { error: 'Enter your business name — at least two characters.' };
  }

  // ⚠️ WORKSPACE `'supplier'`. This app's session cookie is
  // `authjs.session-token.supplier`; writing `'workshop'` here would read a
  // cookie that CANNOT EXIST on this host — and it would pass every local test,
  // because localhost ports share one cookie jar. This repository has made that
  // exact mistake three times.
  const result = await apiPost<Created>('supplier', '/registration/supplier', {
    supplierName,
    // Omitted rather than sent empty: the database substitutes "Main location",
    // and '' would fail the API's `min(1)` on a field deliberately left blank.
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
            ? 'This account may not register a supplier.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  // The WHOLE shell changes: the viewer now has a membership, so `/me` starts
  // answering, the navigation gains the supplier tree, and the top bar can name
  // them. A partial revalidation would leave the onboarding panel wrapped
  // around a supplier that now exists.
  revalidatePath('/', 'layout');
  return { created: 'registered' };
}
