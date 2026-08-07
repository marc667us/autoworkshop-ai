import { requireNavRoute } from '@autoworkshop/next-shell';
import { ServiceRequestsScreen } from '../../_screens/service-requests-screen';

/**
 * `/requests-and-reception/service-requests` — reception's inbox for the public Request for
 * Service, on the ROLE TREE that reaches it by this path.
 *
 * ⚠️ THE SAME SCREEN, MOUNTED AGAIN — not a copy. The workshop's role trees
 * (`07.txt` pt2 §46-§49) give the same idea different paths, and a route that
 * appears in a tree with no page behind it is a DEAD END: this repository has
 * shipped three of those, each one a menu item that 404s when pressed.
 * Duplicating the screen instead would be the §0.3 violation.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/requests-and-reception/service-requests');
  return <ServiceRequestsScreen />;
}
