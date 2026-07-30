import { requireNavRoute } from '@autoworkshop/next-shell';
import { ExecutionSheetScreen } from '../../../_screens/execution-sheet-screen';

/**
 * /record-work/repair-tasks/<id> — one repair. the §49 TECHNICIAN tree. §49 splits one repair record into four menu entries — tasks, time, parts and evidence — and they are FACETS of the same execution, so all four open the same screen. A time sheet that could not say which task the time was against would be useless, and `05.txt` §2 forbids disconnected pages.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC and no
 * navigation advertises one entry per repair. `check-page-gates.sh` strips trailing
 * dynamic segments and enforces exactly that.
 *
 * NOT the record-level check. `ExecutionService.findById` re-verifies role, tenant,
 * organization AND — for a technician — assignment, answering 404 outside them.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/record-work/repair-tasks');
  const { id } = await params;
  return <ExecutionSheetScreen route="/record-work/repair-tasks" executionId={id} />;
}
