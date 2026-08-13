import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiscoveryScreen } from '../../_screens/discovery-screen';

/**
 * `/parts/discovery` — supplier and parts discovery on the §47 MANAGER tree,
 * which reaches it by this path.
 *
 * The same screen mounted again, not a copy — see `/workshop-operations/leads`.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/parts/discovery');
  return <DiscoveryScreen route="/parts/discovery" />;
}
