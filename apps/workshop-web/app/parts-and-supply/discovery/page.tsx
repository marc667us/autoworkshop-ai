import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiscoveryScreen } from '../../_screens/discovery-screen';

/**
 * `/parts-and-supply/discovery` — supplier and parts discovery on the DEFAULT
 * §34 tree, which reaches it by this path.
 *
 * 🔴 SAME CORRECTION AS `/customer-reception/leads`, and for the same reason.
 * This file was written at `/sales/discovery` and moved here with the nav
 * entry; the gate below still named the old path, which no tree advertises, so
 * `requireNavRoute` would have called `notFound()` for every viewer while the
 * coverage audit counted the screen as working. Read that file's header before
 * moving either of these again.
 *
 * ⚠️ `requireNavRoute` FIRST. This page runs an agent against a URL a person
 * pasted. The API refuses independently — `DiscoveryAgent` calls
 * `assertWorkshopStaff` on both entry points — so this is the navigation half
 * of the pair, not the control.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/parts-and-supply/discovery');
  return <DiscoveryScreen route="/parts-and-supply/discovery" />;
}
