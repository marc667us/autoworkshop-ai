import { requireNavRoute } from '@autoworkshop/next-shell';
import { SettingsScreen } from '../../_screens/settings-screen';

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
  return <SettingsScreen />;
}
