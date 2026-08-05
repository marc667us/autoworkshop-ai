import { requireNavRoute } from '@autoworkshop/next-shell';
import { VehicleDocumentsScreen } from '../../../_screens/vehicle-documents-screen';

/**
 * `/my-vehicles/documents` — the customer workspace, `01 (1).txt` §33. Slice 9 of
 * `COMPLETION_PLAN.md` — the only slice this session that moves customer-web,
 * which was the weakest tree in the product at 31%.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/my-vehicles/documents';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <VehicleDocumentsScreen route={ROUTE} />;
}
