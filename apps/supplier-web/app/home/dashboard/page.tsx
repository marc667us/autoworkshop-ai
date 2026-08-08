import { needsWorkshop, registrationStatus, renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
import { CreateSupplierScreen } from '../../_screens/create-supplier-screen';

/**
 * `/home/dashboard` — supplier-web's front door, and the ONE destination the
 * landing page's "Register as parts supplier" button sends people to.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THIS FILE IS WHY THAT BUTTON IS NOT A DEAD END.
 *
 * Before it, this route was served by `app/[...slug]/page.tsx` — the catch-all
 * that renders a navigation module. A signed-in person with NO membership has
 * no grants, so the catch-all had nothing to show them, and the funnel would
 * have ended on an empty page with no way to register. "A route with no caller
 * is not shipped" is a recorded lesson here; its mirror is a caller with no
 * usable route, which is what a button pointing at an onboarding screen that
 * does not exist would have been.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A CONCRETE `page.tsx` RESOLVES AHEAD OF `app/[...slug]`, so this file
 * takes over `/home/dashboard` entirely — including the tree check the
 * catch-all performs. That is why the membership branch below falls THROUGH to
 * `renderModulePage` with the real grants rather than rendering something of
 * its own: an already-registered supplier must see exactly what they saw
 * before, and duplicating the dashboard here would be a second implementation
 * free to drift from the first.
 */
export default async function Page() {
  // ⚠️ `registrationStatus`, NOT `/me`. `/me` sits behind `TenantGuard` and
  // 401s for anyone with no membership — which is the ENTIRE audience of the
  // branch below. `/registration/status` is the one route reachable with a
  // token alone.
  //
  // ⚠️ WORKSPACE `'supplier'`: this app's session cookie is
  // `authjs.session-token.supplier`. A copied `'workshop'` here would read a
  // cookie that cannot exist on this host and would pass every local test,
  // because localhost ports share one jar. Three recorded instances.
  const status = await registrationStatus('supplier');

  // ⚠️ `needsWorkshop` IS MISNAMED FOR THIS CALLER AND IS STILL THE RIGHT
  // FUNCTION. What it actually answers is "we positively know this account
  // holds NO active membership anywhere" — `hasWorkshop` on the API side is
  // `active.length > 0` over every membership, not workshops specifically.
  // Reused rather than copied under a better name so the two apps cannot
  // disagree about what "not registered yet" means (§0.3). The name is the
  // defect, not the behaviour; renaming it touches workshop-web and customer-web
  // and belongs in its own change.
  //
  // 🔴 IT IS FALSE WHEN THE ANSWER IS UNKNOWN, deliberately. A failed
  // `/registration/status` returns null and this renders the normal dashboard,
  // so an API outage degrades to "figures could not be loaded" rather than
  // showing a registered supplier an onboarding wall telling them they own
  // nothing. A transport failure is not an authorization fact — the fourth
  // recorded instance of that class in this repository.
  if (needsWorkshop(status)) {
    return <CreateSupplierScreen displayName={status?.displayName} />;
  }

  return renderModulePage('supplier', ['home', 'dashboard'], await viewerGrants('supplier'));
}
