'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, type ApiResult } from '@autoworkshop/next-shell';

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Insurance product verification — the platform's half of slice 18.
 *
 * ⚠️ THIS IS THE ONLY PRODUCTION PATH TO A LISTED INSURANCE PRODUCT.
 * `082_insurance_marketplace.sql:166` installs
 * `reject_unverified_product_publication()`, a database trigger that REFUSES to
 * publish a product whose `is_verified` is false. The insurer can create and
 * attempt to list; nothing they can do makes a product visible. Until this
 * action existed the only way to verify one was to call the API by hand, which
 * is what the 2026-08-14 UAT did — an operating procedure, not a product.
 *
 * ⚠️ WITHDRAWING ALSO UNLISTS, and the copy says so. The service sets
 * `is_published = false` in the same statement (`insurance.service.ts`), because
 * a product left on sale after the platform withdrew its verification is the
 * decision and its effect coming apart. The button must not describe withdrawal
 * as a smaller act than it is.
 *
 * ⚠️ THE WORKSPACE ID IS `'admin'`, which selects the Keycloak client whose
 * token is attached, and the tenant context derived from it is what sets
 * `app.current_role`. The API re-checks `platform.admin` — which since
 * migrations 077/078 comes from a GRANT RECORD, not a role name — so a
 * verification sent from any other workspace's session is a request with no
 * platform authority behind it.
 */

function failureMessage(result: Exclude<ApiResult<unknown>, { ok: true }>): string {
  if (result.reason === 'invalid' || result.reason === 'forbidden') {
    // The API's own words when it can give them: `assertAdmin` answers
    // "verifying an insurance product is a platform administrator decision",
    // which is more use than anything this file could invent.
    return result.message ?? 'That decision was not accepted.';
  }
  if (result.reason === 'unauthenticated') return 'Your session has expired. Sign in again.';
  if (result.reason === 'notFound') {
    // 🔴 THIS IS THE SHAPE A SILENT FAILURE WOULD TAKE. The service raises
    // NotFound when the UPDATE returns no row, which covers both a deleted
    // product and a role the database does not recognise — the second being the
    // defect migration 025 fixed for the parts catalogue, where an admin UPDATE
    // matched no policy, affected zero rows and raised nothing.
    return 'That product could not be updated — it may have been removed, or your grant may have been revoked.';
  }
  return 'The decision could not be recorded just now.';
}

async function setVerification(productId: string, isVerified: boolean): Promise<ActionOutcome> {
  const result = await apiPatch<{ isVerified: boolean }>(
    'admin',
    `/admin/insurance/products/${productId}/verification`,
    { isVerified },
  );
  if (!result.ok) return { ok: false, message: failureMessage(result) };

  revalidatePath('/catalogue-and-content/insurance-products');
  return {
    ok: true,
    message: isVerified
      ? 'Verified. The insurer can now list this product for sale.'
      : 'Verification withdrawn — and the product has been unlisted with it.',
  };
}

export async function verifyInsuranceProductAction(productId: string): Promise<ActionOutcome> {
  return setVerification(productId, true);
}

export async function withdrawInsuranceProductAction(productId: string): Promise<ActionOutcome> {
  return setVerification(productId, false);
}
