import { requireNavRoute } from '@autoworkshop/next-shell';
import { ExecutionSheetScreen } from '../../../_screens/execution-sheet-screen';

/**
 * /record-work/parts-used/<id> — one repair. the §49 TECHNICIAN tree — the same repair record, entered by its parts.
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
  await requireNavRoute('workshop', '/record-work/parts-used');
  const { id } = await params;
  return <ExecutionSheetScreen route="/record-work/parts-used" executionId={id} />;
}
