import { requireNavRoute } from '@autoworkshop/next-shell';
import { ToolsScreen } from '../../_screens/tools-screen';

/**
 * `/workshop-management/tools-and-equipment` — "Tools and Equipment". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * A tool is NOT a stock item — it is borrowed and comes back. Calibration is
 * tracked because an out-of-date torque wrench produces measurements a repair
 * is later judged on.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/workshop-management/tools-and-equipment';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ToolsScreen route={ROUTE} />;
}
