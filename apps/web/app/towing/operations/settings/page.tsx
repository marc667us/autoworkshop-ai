import { requireNavRoute } from '@autoworkshop/next-shell';
import { SettingsScreen } from '../../_screens/settings-screen';
import { TowingStaffSection } from '../../_screens/staff-section';

/**
 * `/operations/settings` — the rates every invoice is priced from.
 *
 * `requireNavRoute` FIRST, before any data access. A layout gate does NOT stop
 * this component executing and its output would still ship in the RSC payload —
 * a recorded defect in this repository, found when a staff member could read
 * customers' vehicles on a page that "was gated".
 */
export default async function Page() {
  await requireNavRoute('towing', '/operations/settings');
  return (
    <>
      <SettingsScreen />
      {/*
        🔴 THE PEOPLE SECTION — the towing half of what migration 085 unblocked.
        Until 085 a towing company had exactly one member, its founder, and no
        way to appoint a second; the grant authority 085 created then had no
        caller until this shipped.

        Rendered here rather than at its own route because §52 defines ONE
        settings entry for this tree, and this route already carries the
        `organization.admin` gate that `towing_owner` newly satisfies.
      */}
      <TowingStaffSection />
    </>
  );
}
