import { needsWorkshop, registrationStatus, requireNavRoute } from '@autoworkshop/next-shell';
import { DashboardScreen } from '../../_screens/dashboard-screen';
import { CreateTowingScreen } from '../../_screens/create-towing-screen';

/**
 * `/operations/dashboard` — the towing desk at a glance, and this pack's
 * canonical landing (`02.txt` §52 gives towing an `operations` group rather than
 * a `home` one, which is why its dashboard is here and not at `/home/dashboard`).
 *
 * ── 🔴 THE ONBOARDING BRANCH, AND WHY IT COMES FIRST ───────────────────────
 *
 * Migration 074 built this pack end to end and all ten screens work. Nothing
 * could create a `towing_operator` membership until migration 080, so every one
 * of those screens belonged to a role nobody could hold — ten finished rooms
 * with no entrance, and every gate green over it. This branch is the entrance.
 *
 * ⚠️ THE REGISTRATION CHECK IS BEFORE `requireNavRoute`, DELIBERATELY, AND IT IS
 * THE ONE ORDERING DECISION ON THIS PAGE.
 *
 * `requireNavRoute` resolves the viewer's role tree and 404s a route that tree
 * does not advertise. A person with NO membership has no role, so
 * `workspaceForRole` hands back this workspace's default tree — which does
 * advertise `/operations/dashboard`, so they would pass. But relying on that is
 * relying on a fail-open: `workspaceForRole` returning the default tree for an
 * unresolved role is a documented FAIL-OPEN in this repository's own notes, and
 * building the onboarding path on top of it would make a future tightening of
 * that function silently lock every new registrant out of the only screen that
 * can un-stick them.
 *
 * So the branch that needs no permissions is answered before permissions are
 * consulted. It grants nothing: `registrationStatus` is on `UserGuard`, it
 * describes only the CALLER, and the screen it returns writes through
 * `register_towing_operator`, whose role literal is inside the migration.
 */
export default async function Page() {
  const status = await registrationStatus('towing');
  if (needsWorkshop(status)) {
    return <CreateTowingScreen displayName={status?.displayName} />;
  }

  /**
   * `requireNavRoute` FIRST for everybody else, before any data access. A layout
   * gate does NOT stop this component executing and its output would still ship
   * in the RSC payload — a recorded defect in this repository, found when a
   * staff member could read customers' vehicles on a page that "was gated".
   */
  await requireNavRoute('towing', '/operations/dashboard');
  return <DashboardScreen />;
}
