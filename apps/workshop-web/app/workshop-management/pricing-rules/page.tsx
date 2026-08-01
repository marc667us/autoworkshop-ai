import { requireNavRoute } from '@autoworkshop/next-shell';
import { PricingScreen } from '../../_screens/pricing-screen';

/**
 * /workshop-management/pricing-rules — the §46 OWNER tree's route.
 *
 * ⚠️ ONE ROUTE HERE, WHERE SLICE C NEEDED TWO — AND THE DIFFERENCE WAS CHECKED,
 * NOT ASSUMED. Slice C built Workshop Profile at both `/workshop-management/…`
 * and `/settings/…` because the approved trees carry that entry in BOTH: §46's
 * owner tree under Workshop Management, §34's default tree under Settings.
 *
 * Pricing is not in both. `packages/navigation/src/workspaces.ts` carries
 * `pricing-rules` ONLY in `workshopOwnerGroups` (§46); the §34 default tree's
 * Settings group has no pricing entry at all. So the approved navigation itself
 * says pricing belongs to the owner's tree — which agrees with migration 029
 * ("prices are the owner's") and with `07.txt` pt2 §50, where the owner holds
 * financial authority and the manager explicitly does not.
 *
 * 🔴 THE GAP THIS LEAVES, STATED RATHER THAN PAPERED OVER. `navRoleFor` returns
 * undefined for `platform_administrator`, which resolves to the DEFAULT §34
 * tree — so a platform administrator has NO navigable route to this screen,
 * even though `identity.current_user_governs_organization()` admits them
 * (`is_platform_admin() OR workshop_owner`) and the API would serve them. They
 * can reach it by URL; they cannot reach it by clicking.
 *
 * That is left as-is deliberately: adding a Settings entry would be a change to
 * approved navigation, which `05.txt` §2 prohibits without review. It is
 * recorded in `.claude/CURRENT_TASK.md` as a decision for the owner rather than
 * silently resolved in either direction.
 *
 * ⚠️ THE READ-ONLY FORM IS CURRENTLY UNREACHABLE BY NAVIGATION, and saying so
 * is more useful than implying otherwise. `PricingScreen` renders the rates
 * disabled for anyone without `mayEdit`, which is the right behaviour —
 * `quotation.service.ts` prices from these numbers as whichever role prepares
 * the quotation, so the people who USE them should be able to see them. But
 * `WORKSHOP_ROLE_TREES` maps only `owner` to the tree containing
 * `pricing-rules`; manager, reception and technician each get a tree without it
 * and are 404'd here. So the disabled branch is defensive, not exercised:
 * `verify-pricing-screen.mjs` records that a technician is stopped at the
 * NAVIGATION GATE, not at the form.
 *
 * It is kept rather than deleted because it costs nothing and it is what makes
 * adding a Settings entry (see the gap above) safe to do later without also
 * having to remember the authorization. Migration 029's `owner_write` /
 * `owner_update` policies remain the actual control in every case.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS. `check-page-gates.sh` fails the
  // build if this is missing or placed after a fetch.
  await requireNavRoute('workshop', '/workshop-management/pricing-rules');
  return <PricingScreen />;
}
