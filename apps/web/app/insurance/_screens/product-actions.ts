'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Registering and listing insurance products — migration 082.
 *
 * 🔴 WITHOUT THIS FILE THE ROUTES ARE NOT SHIPPED. `POST /insurance/products`
 * and `PATCH /insurance/products/:id/publication` exist and were proven on a
 * running server, and neither fact puts a product on the marketplace. A route
 * with no caller is as unshipped as a caller with no route — this repository
 * has recorded both directions, most expensively when
 * `POST /registration/customer` was deployed, gated, tested, 401ing on live and
 * called by nothing for a day.
 */

/** Register a product. It arrives unverified and unlisted, by design. */
export async function registerProductAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const name = read('name');
  if (!name || name.length < 2) {
    return { error: 'Give the product a name — at least two characters.' };
  }

  // ⚠️ NUMBERS ARE PARSED HERE, because a form sends strings and the API's zod
  // schema takes `z.number()`. Sending "1200" where a number is expected is a
  // 400 that reads like a server fault to the person who typed a correct price.
  const premium = Number(read('premium'));
  const termMonths = Number(read('termMonths'));
  if (!Number.isFinite(premium) || premium < 0) {
    return { error: 'Enter the premium as a number, for example 1200.' };
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    return { error: 'Enter the term in whole months, for example 12.' };
  }
  const excessRaw = read('excess');
  const excess = excessRaw === undefined ? undefined : Number(excessRaw);
  if (excess !== undefined && (!Number.isFinite(excess) || excess < 0)) {
    return { error: 'Excess must be a number, or leave it blank.' };
  }

  const result = await apiPost('insurance', '/insurance/products', {
    name,
    coverType: read('coverType') ?? 'comprehensive',
    premium,
    currency: read('currency') ?? 'GHS',
    termMonths,
    ...(read('summary') ? { summary: read('summary') } : {}),
    ...(excess !== undefined ? { excess } : {}),
    ...(read('termsUrl') ? { termsUrl: read('termsUrl') } : {}),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check them and try again.')
        : result.reason === 'forbidden'
          ? // The API's own sentence names the way forward — register an
            // insurance company, or buy cover without an account.
            (result.message ?? 'Only an insurance company may register products.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : 'The service did not respond. Nothing has been created — try again shortly.';
    return { error };
  }

  revalidatePath('/insurance/sales/my-products');
  return { created: 'Registered. It is waiting for platform verification before it can be listed.' };
}

/**
 * List or unlist.
 *
 * ⚠️ THE REFUSAL FOR AN UNVERIFIED PRODUCT IS THE DATABASE'S OWN SENTENCE,
 * passed through. It explains the wait — "a platform administrator reviews
 * every insurance product before it is offered to the public" — where a generic
 * "could not publish" would read as a fault and send somebody to support.
 */
export async function setProductPublicationAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('productId') ?? '').trim();
  if (!id) return { error: 'Nothing was selected. Reload the page and try again.' };
  const isPublished = String(formData.get('isPublished') ?? '') === 'true';

  const result = await apiPatch('insurance', `/insurance/products/${id}/publication`, {
    isPublished,
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'That change was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not change a product listing.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That product no longer exists. Reload the page.'
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  revalidatePath('/insurance/sales/my-products');
  return { created: isPublished ? 'Listed on the marketplace.' : 'Removed from the marketplace.' };
}

/**
 * Work the enquiry inbox: new -> contacted -> closed.
 *
 * 🔴 THIS IS THE CALLER `PATCH /insurance/enquiries/:id/status` NEEDS IN ORDER
 * TO BE SHIPPED. The same rule this file's header states for the product
 * routes, applied to slice 17's read half: without it the insurer can see an
 * enquiry and can never mark it dealt with, so the inbox only ever grows and
 * "new" stops meaning anything.
 */
export async function setEnquiryStatusAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('enquiryId') ?? '').trim();
  if (!id) return { error: 'Nothing was selected. Reload the page and try again.' };

  const status = String(formData.get('status') ?? '').trim();
  // Checked here as well as by the API's zod enum, because this one names the
  // control the person actually used rather than a field in a JSON body.
  if (status !== 'new' && status !== 'contacted' && status !== 'closed') {
    return { error: 'Choose new, contacted or closed.' };
  }

  const result = await apiPatch('insurance', `/insurance/enquiries/${id}/status`, { status });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'That change was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not update an enquiry.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That enquiry no longer exists. Reload the page.'
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  revalidatePath('/insurance/sales/my-products');
  return { created: `Marked as ${status}.` };
}
