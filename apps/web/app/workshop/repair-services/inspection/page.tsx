import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionQueueScreen } from '../../_screens/inspection-queue-screen';

/**
 * /repair-services/inspection — the §34 WORKSPACE DEFAULT route.
 *
 * What a viewer sees when their role has no tree of its own: a platform
 * administrator, a cashier, a storekeeper, a quality-control inspector. The
 * owner (§46), manager (§47) and technician (§49) reach the same screen at their
 * own paths — the nav has advertised "Inspection" in all four trees since Phase
 * 3 and no page existed until now.
 *
 * The screen is shared; the GATE is not. Each page names its own path so
 * `check-page-gates.sh` can verify the gate belongs to the page it sits in.
 *
 * NOT A SECURITY CONTROL. `InspectionService` refuses the roles that may not read
 * or record an inspection (`07.txt` pt2 §50), narrows a technician to their
 * assigned cards, and Postgres RLS denies cross-tenant access independently
 * (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-services/inspection');
  return <InspectionQueueScreen route="/repair-services/inspection" />;
}
