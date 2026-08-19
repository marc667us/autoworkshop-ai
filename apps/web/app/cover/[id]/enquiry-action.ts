'use server';

import { submitInsuranceEnquiry } from '@autoworkshop/marketplace-ui';

/**
 * The enquiry POST, run on the SERVER.
 *
 * 🔴 THIS FILE EXISTS BECAUSE THE BROWSER CANNOT KNOW WHERE THE API IS.
 * `apiBaseUrl()` reads `process.env.API_BASE_URL`, which has no `NEXT_PUBLIC_`
 * prefix and is therefore absent in the client bundle — it would fall back to
 * `http://localhost:4000` and every enquiry a real visitor sent would go to
 * their own machine. Running the POST here is what makes the address correct.
 *
 * It also un-breaks the build: `@autoworkshop/marketplace-ui`'s `public-api`
 * imports `@autoworkshop/auth`, which reaches `next/headers`, and pulling that
 * into a `'use client'` bundle fails `next build`.
 *
 * ⚠️ NO `revalidatePath` HERE, DELIBERATELY. Nothing this visitor can see
 * changes — the enquiry lands in the INSURER's inbox, in another tenant, behind
 * authentication. Revalidating the public product page would rebuild a page
 * whose content did not change and hide that fact from the next reader.
 *
 * ⚠️ AND IT RETURNS NO ID. The API does not issue one (see
 * `PublicInsuranceController`), and inventing one here would hand an anonymous
 * caller a handle to a record they can never be authorised to read.
 */
export async function submitEnquiryAction(input: {
  productId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  vehicleRegistration?: string;
  message?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await submitInsuranceEnquiry(input);
  // Narrowed to exactly what the form needs. The API's own refusal text is kept
  // verbatim because it names what the visitor can do next — replacing it with
  // a generic message throws away the actionable half of the answer.
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
