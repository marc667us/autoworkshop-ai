import { requireNavRoute } from '@autoworkshop/next-shell';
import { PricingScreen } from '../../_screens/pricing-screen';

/**
 * /settings/pricing — the §34 DEFAULT tree's route to the pricing screen.
 *
 * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
 * Option A, owner-approved 2026-08-01). It closes the gap that made this screen
 * hardest to find of the three:
 *
 * `pricing-rules` existed ONLY in the §46 owner tree. But
 * `owner@autoworkshop.local` holds three memberships and `resolveTenantContext`
 * defaults to the STRONGEST by ROLE_PRECEDENCE — `platform_administrator` —
 * which resolves to THIS tree. So the person most likely to set the labour rate
 * found no Pricing anywhere and had to switch role first, while an unset labour
 * rate means quotations price labour at ZERO.
 *
 * ⚠️ IT SITS IN THE `organization.admin` GROUP, which is the point rather than a
 * detail: `platform_administrator` holds that permission, a technician does not,
 * so the entry is invisible to the roles that could never write it anyway.
 * Migration 029's `owner_write` / `owner_update` policies remain the control —
 * this only decides who is OFFERED the screen.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/settings/pricing');
  return <PricingScreen />;
}
