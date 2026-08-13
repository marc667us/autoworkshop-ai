import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiscoveryScreen } from '../../_screens/discovery-screen';

/**
 * `/parts-and-suppliers/discovery` — supplier and parts discovery on the §46
 * OWNER tree, which reaches it by this path.
 *
 * The same screen mounted again, not a copy — see `/workshop-operations/leads`
 * for why the role trees produce several paths for one implementation.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/parts-and-suppliers/discovery');
  return <DiscoveryScreen route="/parts-and-suppliers/discovery" />;
}
