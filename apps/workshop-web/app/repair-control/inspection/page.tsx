import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionQueueScreen } from '../../_screens/inspection-queue-screen';

/**
 * /repair-control/inspection — the §46 WORKSHOP OWNER tree.
 *
 * §46 puts Inspection under "Repair Control"; the §34 default puts it under
 * "Repair Services". Same screen, different path, and an owner signed in would
 * find nothing at the default route — which is why all four exist.
 *
 * The heading comes from `navLabelFor`, so each tree shows its own wording.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/repair-control/inspection');
  return <InspectionQueueScreen route="/repair-control/inspection" />;
}
