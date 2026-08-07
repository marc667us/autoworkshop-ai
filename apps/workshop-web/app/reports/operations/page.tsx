import { requireNavRoute } from '@autoworkshop/next-shell';
import { ReportScreen } from '../../_screens/report-screen';
import { OrchestrationPanel } from '../../_screens/orchestration-panel';

/**
 * `/reports/operations` - "Operations". Slice 8 of `COMPLETION_PLAN.md`.
 *
 * Renders report `job-progress`. Fourteen report routes map onto NINE distinct
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

const ROUTE = '/reports/operations';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  // The orchestrator ABOVE the report, deliberately. The report says what
  // happened; the panel says what to do now, and the second is what somebody
  // opening Operations in the morning actually needs. Mounted on an existing
  // route rather than a new menu entry — a nav item is a promise, and this is
  // an addition to a screen that already answers the same question badly.
  return (
    <>
      <OrchestrationPanel />
      <ReportScreen route={ROUTE} reportKey="job-progress" fallbackTitle="Operations" />
    </>
  );
}
