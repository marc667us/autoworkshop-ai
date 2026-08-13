import { requireNavRoute } from '@autoworkshop/next-shell';
import { LeadsScreen } from '../../_screens/leads-screen';

/**
 * `/requests-and-reception/leads` — the lead-discovery agent's candidates, on
 * the §47 MANAGER tree, which reaches them by this path.
 *
 * The same screen mounted again, for the reason `/workshop-operations/leads`
 * gives: one implementation, several role-tree paths, no dead ends.
 */
export default async function Page() {
  await requireNavRoute('workshop', '/requests-and-reception/leads');
  return <LeadsScreen route="/requests-and-reception/leads" />;
}
