'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Publication decisions — the administrator's half of Slice B.
 *
 * ⚠️ THIS IS THE SURFACE THAT WAS DEAD. Every admin policy in migrations 021-024
 * tested `identity.current_role_name() = 'admin'`, and the application sets
 * `platform_administrator` — so an UPDATE here matched no policy, affected zero
 * rows, and RAISED NOTHING. Migration 025 fixed the predicate; the API reports a
 * zero-row result as an error rather than a cheerful 200, and this file shows
 * whatever it says. If publication ever silently stops working again, the screen
 * says so instead of appearing to succeed.
 *
 * ⚠️ THE WORKSPACE ID IS `'admin'`, WHICH SELECTS THE KEYCLOAK CLIENT whose
 * token is attached — and the tenant context derived from it is what sets
 * `app.current_role`. Sending an admin decision from any other workspace's
 * session is not merely wrong-audience; it is a request with no administrator
 * role behind it.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    return result.message ?? 'That decision was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') {
    // ⚠️ THIS IS THE SHAPE THE OLD SILENT FAILURE WOULD TAKE. The API answers
    // 404 "not found, or not permitted" when the UPDATE returns no row, which
    // covers both a deleted row and a role the database does not recognise.
    return 'That item could not be updated — it may have been removed, or your role may not permit it.';
  }
  return 'The decision could not be recorded just now.';
}

export async function setSupplierPublicationAction(
  supplierId: string,
  published: boolean,
  verified?: boolean,
): Promise<ActionOutcome> {
  const result = await apiPatch<{ isPublished: boolean }>(
    'admin',
    `/admin/catalogue/suppliers/${supplierId}/publication`,
    verified === undefined ? { published } : { published, verified },
  );
  if (!result.ok) return { ok: false, message: failureMessage(result) };

  revalidatePath('/catalogue-and-content/products');
  return {
    ok: true,
    message: published ? 'Supplier published.' : 'Supplier withdrawn from the marketplace.',
  };
}

export async function setPartPublicationAction(
  partId: string,
  published: boolean,
): Promise<ActionOutcome> {
  const result = await apiPatch<{ isPublished: boolean }>(
    'admin',
    `/admin/catalogue/parts/${partId}/publication`,
    { published },
  );
  if (!result.ok) return { ok: false, message: failureMessage(result) };

  revalidatePath('/catalogue-and-content/products');
  return {
    ok: true,
    message: published
      ? 'Part published — it is now visible to buyers.'
      : 'Part withdrawn. Its supplier can now edit it, including its compatibility list.',
  };
}
