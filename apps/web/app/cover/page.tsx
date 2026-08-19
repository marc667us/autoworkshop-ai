import type { Metadata } from 'next';
import { InsuranceCoverList, fetchInsuranceProducts } from '@autoworkshop/marketplace-ui';

/**
 * `/cover` — the public insurance marketplace. Slice 17.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 A TOP-LEVEL PUBLIC ROUTE, NOT A PAGE INSIDE THE `insurance` PACK.
 *
 * `/insurance/**` is the INSURER's workspace — it mounts `WorkspaceShell`,
 * resolves a viewer and calls `requireNavRoute`. A shopper is not an insurer
 * and has no session at all, so a browse screen there would render the seller's
 * chrome around a stranger. `/` and `/onboarding` are already public routes at
 * this level; this joins them.
 *
 * ⚠️ IT IS ALSO NOT A NAVIGATION CHANGE. `CLAUDE.md` prohibits changing
 * approved navigation without review, and nothing here touches the eleven role
 * trees in `@autoworkshop/navigation` — public routes are not in them, which is
 * why `/` is not either.
 *
 * ⚠️ `force-dynamic` IS LOAD-BEARING. Verification and listing are decisions a
 * platform administrator and an insurer make at any moment; a statically cached
 * page would keep advertising a product after it was withdrawn, and withdrawal
 * is the mechanism this marketplace uses to take cover off sale.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vehicle insurance — AutoWorkshop AI',
  description:
    'Compare verified vehicle insurance cover from insurers on AutoWorkshop AI. Browsing and enquiring need no account.',
};

export default async function CoverPage() {
  const result = await fetchInsuranceProducts();
  return (
    <InsuranceCoverList
      products={result.ok ? result.data : []}
      // Named, never swallowed into an empty grid. A 200 with an empty list is
      // the shape 083 records as the worst way this can fail: every health
      // check passes and the marketplace is silently empty.
      problem={result.ok ? null : result.reason}
    />
  );
}
