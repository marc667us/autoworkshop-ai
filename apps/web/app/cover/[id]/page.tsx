import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  EnquiryForm,
  InsuranceCoverDetail,
  InsuranceCoverUnavailable,
  fetchInsuranceProduct,
} from '@autoworkshop/marketplace-ui';
import { submitEnquiryAction } from './enquiry-action';

/**
 * `/cover/[id]` — one insurance product, and the enquiry that reaches its
 * insurer. Slice 17, steps 2 and 3.
 *
 * ⚠️ THE 404 IS THE API'S DECISION, NOT THIS PAGE'S. `insurance.public_product()`
 * (086) selects only published AND verified rows, so an unlisted product is
 * absent from the response rather than filtered out here. That distinction is
 * the rule `PublicController`'s header states about withheld VIN detail: a page
 * that receives the full record and chooses to hide half of it has no gate at
 * all — the data is in the HTML and in the network tab.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchInsuranceProduct(id);
  if (!result.ok) {
    // A generic title rather than an invented one. Naming a product that could
    // not be loaded would put a claim in the browser tab and in any link
    // preview that this page cannot substantiate.
    return { title: 'Vehicle insurance — AutoWorkshop AI' };
  }
  return {
    title: `${result.data.name} — ${result.data.insurer}`,
    description:
      result.data.summary ??
      `${result.data.name}, offered by ${result.data.insurer} on AutoWorkshop AI.`,
  };
}

export default async function CoverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchInsuranceProduct(id);

  // 🔴 ONE ANSWER FOR "NOT LISTED" AND "DOES NOT EXIST", matching the API.
  // Distinguishing them would tell a stranger which product ids are real, and
  // an unpublished draft is precisely what must not be discoverable.
  if (!result.ok && result.missing) notFound();

  // 🔴 BUT AN OUTAGE IS NOT A 404, AND THIS PAGE USED TO SAY IT WAS.
  //
  // The first version called `notFound()` for every failure, so while the API
  // was unreachable a perfectly live product rendered as "this page does not
  // exist" — a confident wrong answer, and worse than an error, because a
  // shopper who has been told an insurer's cover does not exist does not come
  // back to check. `fetchInsuranceProduct` now separates the two and this acts
  // on the difference. Caught by Codex, 2026-08-19.
  if (!result.ok) return <InsuranceCoverUnavailable reason={result.reason} />;

  return (
    <InsuranceCoverDetail
      product={result.data}
      enquiryForm={
        <EnquiryForm
          productId={result.data.id}
          insurer={result.data.insurer}
          // The POST runs on the server — see `enquiry-action.ts` for the two
          // separate faults that made a browser-side fetch wrong here.
          action={submitEnquiryAction}
        />
      }
    />
  );
}
