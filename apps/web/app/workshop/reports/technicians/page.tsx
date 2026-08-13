import { requireNavRoute } from '@autoworkshop/next-shell';
import { ReportScreen } from '../../_screens/report-screen';

/**
 * `/reports/technicians` - "Technicians". Slice 8 of `COMPLETION_PLAN.md`.
 *
 * Renders report `technician-workload`. Fourteen report routes map onto NINE distinct
 * questions - sections 46 and 47 each name several of the same ones under
 * different headings - so this is one screen and one service method, not
 * fourteen places for the same arithmetic to drift. `navLabelFor` reads the
 * heading back from whichever tree the viewer is in.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/reports/technicians';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ReportScreen route={ROUTE} reportKey="technician-workload" fallbackTitle="Technicians" />;
}
