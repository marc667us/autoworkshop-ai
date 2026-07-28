import { requireNavRoute } from '@autoworkshop/next-shell';
import { VehicleDetailScreen } from '../../../_screens/vehicle-detail-screen';

/**
 * /customers-and-vehicles/vehicles/<id> — detail, on the §46 owner tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC
 * and no navigation advertises one entry per record, so "is `/customers-and-vehicles/vehicles/<id>`
 * in your menu" has no sensible answer. The real question is whether this viewer
 * may see the LIST, and a viewer refused the list is refused every record
 * reachable from it. `check-page-gates.sh` strips trailing dynamic segments and
 * enforces exactly that.
 *
 * NOT the record-level check. The service re-verifies role, tenant AND
 * organization and answers 404 for a record outside them, so guessing an id
 * yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
  const { id } = await params;
  return <VehicleDetailScreen id={id} listHref="/customers-and-vehicles/vehicles" customerHrefBase="/customers-and-vehicles/customers" />;
}
